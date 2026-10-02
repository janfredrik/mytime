# MyTime

Timeføring for jobb: før timer per uke på prosjekt/oppgave/type, se fleksitid, og importer/eksporter
Excel-filer i samme format som dagens løsning. Innlogging med Microsoft Entra ID.

- Ukevisning med autolagring, tastaturnavigasjon (piltaster/Enter) og kommentar per celle (Shift+Enter)
- Fleks per dag og total fleksbalanse (dagsnorm 8 t, helg og norske helligdager har norm 0)
- «Kopier fra forrige uke» kopierer linjene uten timer
- Import/eksport av `.xlsx` (ark `Timecard`, kolonner `Project number … Time to`). Eksporten er identisk
  med dagens format, filnavn `week40_02102026130256.xlsx`
- Hver bruker ser kun sine egne timer. Ingen felles katalog: linjer føres fritt eller kommer fra import

## Arkitektur

| Del | Teknologi |
| --- | --- |
| `apps/web` | React 19, Vite, Tailwind CSS 4, TanStack Query |
| `apps/server` | Fastify 5, Drizzle ORM, PostgreSQL 16, `openid-client` |
| `packages/shared` | Typer, zod-skjemaer, dato-/uke-/fleksberegning (brukes av begge) |

Innloggingen er et *backend-for-frontend*-oppsett: serveren gjør OIDC Authorization Code + PKCE mot
Entra ID som konfidensiell klient, og nettleseren får bare en `httpOnly`-sesjonscookie (ingen tokens i
nettleseren). Kun brukere fra tenanten i `ENTRA_TENANT_ID` slipper inn. Databasemigrasjoner kjøres
automatisk ved oppstart.

## 1. App registration i Entra ID

1. **Entra admin center → App registrations → New registration**
   - Navn: `MyTime`
   - Supported account types: *Accounts in this organizational directory only* (single tenant)
   - Redirect URI: plattform **Web**, `https://mytime.x99.no/auth/callback`
2. **Authentication**
   - Legg til en ekstra redirect-URI `https://mytime.x99.no/` (brukes etter utlogging)
   - Front-channel logout URL kan stå tom
   - La *ID tokens* / *Access tokens* (implicit flow) være **av**
3. **Certificates & secrets → New client secret** – kopier *Value* til `ENTRA_CLIENT_SECRET`.
   Noter utløpsdatoen; innlogging slutter å virke når hemmeligheten utløper.
4. **API permissions**: `Microsoft Graph → openid, profile, email` (delegated). `User.Read` som ligger
   der fra før er greit.
5. Fra **Overview**: kopier *Directory (tenant) ID* til `ENTRA_TENANT_ID` og *Application (client) ID*
   til `ENTRA_CLIENT_ID`.
6. Valgfritt: for å begrense hvem som får logge inn, gå til **Enterprise applications → MyTime →
   Properties**, sett *Assignment required* = Yes og legg til brukere/grupper under *Users and groups*.

## 2. Drift på Unraid (docker compose)

```bash
# på Unraid, f.eks. i /mnt/user/appdata/mytime/src
git clone https://github.com/janfredrik/mytime.git .
cp .env.example .env
nano .env               # fyll inn Entra-verdier, SESSION_SECRET og POSTGRES_PASSWORD
docker compose pull && docker compose up -d
```

GitHub Actions publiserer imaget til `ghcr.io/janfredrik/mytime` (amd64 og arm64) når testene er
grønne på `main`. Taggene er `latest`, `sha-<kort hash>` og `1.2.3`/`1.2` for git-tagger `v1.2.3`. Lås
en versjon med `MYTIME_TAG=1.2.3` i `.env`. `docker compose up -d --build` bygger fra kildekoden i
stedet.

Generer hemmeligheter med `openssl rand -hex 32` (SESSION_SECRET) og `openssl rand -hex 24`
(POSTGRES_PASSWORD – bruk kun bokstaver og tall, siden det settes inn i en database-URL).

Appen lytter på `APP_PORT` (standard `8080`). Databasen lagres i `${DATA_DIR}/postgres`
(standard `/mnt/user/appdata/mytime/postgres`).

**Oppdatering:** `git pull && docker compose pull && docker compose up -d`

### Reverse proxy

TLS termineres i eksisterende reverse proxy. Pek `mytime.x99.no` til `http://<unraid-ip>:8080`.
Proxyen må sende `X-Forwarded-For`/`X-Forwarded-Proto` (standard i Nginx Proxy Manager, SWAG og
Traefik). `PUBLIC_URL` må være nøyaktig `https://mytime.x99.no`, ellers stemmer ikke redirect-URI-en og
cookies blir ikke merket `Secure`.

### Backup

```bash
docker exec mytime-db pg_dump -U mytime mytime | gzip > mytime-$(date +%F).sql.gz
# gjenoppretting:
gunzip -c mytime-2026-10-02.sql.gz | docker exec -i mytime-db psql -U mytime mytime
```

Kan legges inn som et skript i *User Scripts*-pluginen på Unraid.

### Helsesjekk

`GET /healthz` svarer `{"ok":true}` når appen og databasen er oppe (brukes av Docker `HEALTHCHECK`).

## Kjøre lokalt med Docker

Uten Node, Postgres eller Entra – kun Docker:

```bash
docker compose -f compose.local.yml up
```

Åpne <http://localhost:8080>. «Logg inn» gir en lokal testbruker (`DEV_AUTH_BYPASS`), og dataene
ligger i Docker-volumet `mytime-local-pg` (`docker compose -f compose.local.yml down -v` sletter dem).
Legg til `--build` for å teste endringer du ikke har pushet ennå.

## Utvikling

Krever Node 22 og en PostgreSQL 16-database.

```bash
npm install
cp .env.example .env
# sett DATABASE_URL=postgres://… og DEV_AUTH_BYPASS=true i .env for å slippe Entra lokalt
npm run dev            # server på :3000, Vite på :5173 (proxy mot serveren)
```

Med `DEV_AUTH_BYPASS=true` logger `/auth/login?user=navn` inn en lokal testbruker. Dette avvises når
`NODE_ENV=production`.

| Kommando | |
| --- | --- |
| `npm run typecheck` | TypeScript for alle pakker |
| `npm run lint` | ESLint |
| `npm test` | Enhetstester (vitest). Sett `TEST_DATABASE_URL` for å kjøre API-/innloggingstestene mot Postgres |
| `npm run build && E2E_DATABASE_URL=… npm run test:e2e` | Ende-til-ende-tester i Chromium (Playwright) |
| `npm run db:generate` | Lag ny migrasjon etter endring i `apps/server/src/db/schema.ts` |

### Excel-format

Ett ark `Timecard` med kolonnene `Project number, Project name, Task number, Task name, Type, Date,
Hours, Comment, Time from, Time to`. Én rad per linje og dag med timer; linjer uten timer i uka
skrives som én rad med bare de fem første kolonnene.

Importen er tolerant: kolonner finnes via overskrift, timer kan være tall eller tekst (komma eller
punktum), og datoer kan være `2026-09-28`, `28.09.2026` eller ekte Excel-datoer. Daterte rader havner i
sin uke (en fil kan dekke flere uker); rader uten dato havner i uka filen gjelder, eller uka du står i.
Importen erstatter innholdet i de berørte ukene etter en forhåndsvisning.
