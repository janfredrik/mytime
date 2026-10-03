# MyTime i Azure (Bicep)

| Ressurs | Hva |
| --- | --- |
| Container App `mytime-app` | Appen (`ghcr.io/janfredrik/mytime`), HTTPS og eget domene med gratis sertifikat |
| Container Apps-miljø `mytime-env` | Plattformen appen kjører i (Consumption) |
| PostgreSQL Flexible Server `mytime-pg-…` | Postgres 16, Burstable B1ms, 32 GB, 7 dagers automatisk backup |
| Log Analytics `mytime-logs` | Logger fra appen (30 dager) |

Appen holder ingen tilstand selv (sesjoner ligger i Postgres), så den tåler restart og flere kopier.
Migrasjoner kjøres ved oppstart som før.

## Forutsetninger

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`az bicep` installeres automatisk)
- App registration i Entra ID som beskrevet i hoved-README-en
- Er pakken på ghcr.io privat: et GitHub-token (PAT) med `read:packages`. Alternativt kan pakken
  gjøres offentlig under *Package settings → Change visibility*.

## Første deploy

```bash
az login
az group create --name mytime --location norwayeast

export ENTRA_TENANT_ID=...
export ENTRA_CLIENT_ID=...
export ENTRA_CLIENT_SECRET=...
export SESSION_SECRET=$(openssl rand -hex 32)
export POSTGRES_PASSWORD=$(openssl rand -hex 24)   # kun bokstaver og tall
# export REGISTRY_USERNAME=janfredrik REGISTRY_PASSWORD=ghp_...   # bare ved privat image

az deployment group create -g mytime -f infra/main.bicep -p infra/main.bicepparam
```

Ta vare på `SESSION_SECRET` og `POSTGRES_PASSWORD` (for eksempel i en passordhåndterer). De må
oppgis på nytt hver gang malen deployes. Outputen viser blant annet:

- `publicUrl`: adressen appen kjører på (`https://mytime-app.<…>.norwayeast.azurecontainerapps.io`)
- `redirectUri`: legg den inn som redirect-URI (plattform *Web*) i app registration, og legg
  `publicUrl` + `/` til som redirect etter utlogging

## Eget domene (f.eks. mytime.x99.no)

1. Gjør første deploy uten domene, slik at Container Apps-adressen finnes.
2. Opprett to DNS-poster (verdiene står i outputen fra deployen):

   | Type | Navn | Verdi |
   | --- | --- | --- |
   | CNAME | `mytime` | `appFqdn` |
   | TXT | `asuid.mytime` | `customDomainVerificationId` |

   Ligger domenet i Cloudflare, må CNAME-posten stå som *DNS only* (grå sky) mens sertifikatet
   utstedes.
3. Deploy på nytt med domenet:

   ```bash
   export MYTIME_DOMAIN=mytime.x99.no
   az deployment group create -g mytime -f infra/main.bicep -p infra/main.bicepparam
   ```

   Azure legger vertsnavnet på appen, utsteder et administrert sertifikat (tar noen minutter) og
   binder det. `PUBLIC_URL` blir `https://mytime.x99.no`, som stemmer med redirect-URI-ene fra
   hoved-README-en.

Hver gang malen deployes med domene, kobles sertifikatet fra og på igjen. Da kan HTTPS på eget
domene være borte i opptil et minutt. Nye image-versjoner trenger ikke ny deploy av malen (se
under), så malen kjøres bare når infrastrukturen endres.

## Oppdatere appen

Nytt image fra GitHub Actions rulles ut uten å kjøre malen:

```bash
az containerapp update -g mytime -n mytime-app --image ghcr.io/janfredrik/mytime:sha-abc1234
```

Bruk gjerne en fast tag (`sha-…` eller versjon) i stedet for `latest`: Container Apps henter bare
imaget på nytt når en ny revisjon lages. Kjører du malen igjen senere, sett `MYTIME_IMAGE` til
taggen som kjører, ellers rulles appen tilbake til `latest`.

## Drift

- **Logger:** `az containerapp logs show -g mytime -n mytime-app --follow`, eller Log Analytics
  i portalen.
- **Backup:** Flexible Server tar automatisk backup med gjenoppretting til et vilkårlig tidspunkt
  (point-in-time restore) innenfor `postgresBackupRetentionDays`. Manuell dump:

  ```bash
  pg_dump "postgres://mytime:$POSTGRES_PASSWORD@<postgresServer>:5432/mytime?sslmode=require" \
    | gzip > mytime-$(date +%F).sql.gz
  ```

  For å nå databasen fra egen maskin legger du til egen IP under *Networking* på serveren.
- **Flytte data fra Docker:** deploy til Azure først, så tabellene finnes. Ta deretter en dump som
  erstatter dem, last den inn og start appen på nytt:

  ```bash
  docker exec mytime-db pg_dump -U mytime --clean --if-exists --no-owner mytime > mytime.sql
  psql "postgres://mytime:$POSTGRES_PASSWORD@<postgresServer>:5432/mytime?sslmode=require" < mytime.sql
  az containerapp revision restart -g mytime -n mytime-app \
    --revision $(az containerapp revision list -g mytime -n mytime-app --query '[0].name' -o tsv)
  ```
- **Nettverk:** Postgres er åpen for tjenester i Azure (brannmurregelen *Allow Azure services*),
  beskyttet av passord og påkrevd TLS. Vil du ha den helt privat, må app og database inn i et VNet
  (Container Apps-miljø med VNet-integrasjon og Flexible Server med privat tilgang).

## Parametere

Se `main.bicep`. De viktigste utover hemmelighetene:

| Parameter | Standard | |
| --- | --- | --- |
| `customDomain` | tom | Settes via `MYTIME_DOMAIN` |
| `image` | `ghcr.io/janfredrik/mytime:latest` | Settes via `MYTIME_IMAGE` |
| `minReplicas` | `1` | `0` er billigst, men gir kaldstart etter pauser |
| `postgresSku` | `Standard_B1ms` | |
| `postgresBackupRetentionDays` | `7` | 7–35 |

Overstyr med `-p minReplicas=0` etter `-p infra/main.bicepparam`.
