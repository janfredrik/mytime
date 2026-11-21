<!-- prettier-ignore -->
<div align="center">

<img src="apps/web/public/favicon.svg" alt="MyTime" width="80" />

# MyTime

*Rask timeføring per uke, med fleks og Excel-eksport som passer rett inn i dagens timesystem*

[![CI](https://github.com/janfredrik/mytime/actions/workflows/ci.yml/badge.svg)](https://github.com/janfredrik/mytime/actions/workflows/ci.yml)
![Node version](https://img.shields.io/badge/node-%3E%3D22-3c873a)
![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript&logoColor=white)
[![Docker image](https://img.shields.io/badge/ghcr.io-janfredrik%2Fmytime-0f766e?logo=docker&logoColor=white)](https://github.com/janfredrik/mytime/pkgs/container/mytime)

[Funksjoner](#funksjoner) • [Kom i gang](#kom-i-gang) • [Drift](#drift) • [Utvikling](#utvikling) • [xlsx-format](#xlsx-format)

</div>

MyTime er et raskere og hyggeligere sted å føre timer enn det offisielle timesystemet. Du fyller inn uka i et
tastaturstyrt rutenett, ser fleksen din hele tiden, og eksporterer en `.xlsx` som lastes opp i det offisielle
systemet uten endringer. Det offisielle systemet er fortsatt fasiten; MyTime er et verktøy for å komme dit
fortere.

## Funksjoner

- **Ukevisning med autolagring.** Piltaster og Enter flytter deg rundt, Shift+Enter åpner kommentar for cellen.
  Ingen lagreknapp.
- **Fleks per dag og totalt.** Normen er 8 timer, helg og norske helligdager er 0. Dagens fleks telles så snart
  du har ført timer, og en graf viser utviklingen over tid.
- **Kopier fra forrige uke.** Tar med linjene, ikke timene.
- **Import og eksport av `.xlsx`** i nøyaktig samme format og med samme filnavnmønster som dagens løsning
  (`week40_02102026130256.xlsx`). Importen viser en forhåndsvisning før den erstatter noe.
- **Felles timekodekatalog** med søk på prosjekt og oppgave. Koder som mangler kan fortsatt skrives inn selv.
- **Innlogging med Microsoft Entra ID**, valgfritt med selvbetjent gjestetilgang for godkjente domener.
- **Privat.** Hver bruker ser bare sine egne timer.

## Oversikt

| Del | Teknologi |
| --- | --- |
| [`apps/web`](apps/web) | React 19, Vite, Tailwind CSS 4, TanStack Query |
| [`apps/server`](apps/server) | Fastify 5, Drizzle ORM, PostgreSQL 16, `openid-client` |
| [`packages/shared`](packages/shared) | Typer, zod-skjemaer, dato-, uke- og fleksberegning (brukes av begge) |

Innloggingen er et *backend-for-frontend*-oppsett: serveren gjør OIDC Authorization Code + PKCE mot Entra ID
som konfidensiell klient, og nettleseren får bare en `httpOnly`-sesjonscookie. Ingen tokens havner i
nettleseren, og kun brukere fra tenanten i `ENTRA_TENANT_ID` slipper inn. Databasemigrasjoner kjøres
automatisk ved oppstart.

## Kom i gang

Den raskeste måten å prøve MyTime på krever bare Docker (ingen Node, Postgres eller Entra):

```bash
docker compose -f compose.local.yml up
```

Åpne <http://localhost:8080> og trykk **Logg inn**. Du blir logget inn som en lokal testbruker
(`DEV_AUTH_BYPASS`), og dataene lagres i Docker-volumet `mytime-local-pg`.

> [!TIP]
> Legg til `--build` for å teste endringer du ikke har pushet ennå, og bruk
> `docker compose -f compose.local.yml down -v` for å slette testdataene.

## Drift

MyTime kjører som to containere (appen og PostgreSQL) bak en eksisterende reverse proxy som håndterer TLS.
Du trenger Docker med Compose v2 og en app registration i Entra ID.

### 1. Registrer appen i Entra ID

1. **Entra admin center → App registrations → New registration**
   - Navn: `MyTime`
   - Supported account types: *Accounts in this organizational directory only* (single tenant)
   - Redirect URI: plattform **Web**, f.eks. `https://mytime.domene.no/auth/callback`
2. **Authentication**: legg til `https://mytime.domene.no/` som ekstra redirect-URI (brukes etter utlogging).
   La *ID tokens* og *Access tokens* (implicit flow) være **av**.
3. **Certificates & secrets → New client secret**: kopier *Value* til `ENTRA_CLIENT_SECRET`.
4. **API permissions**: `Microsoft Graph → openid, profile, email` (delegated). `User.Read`, som ligger der fra
   før, er greit.
5. Fra **Overview**: kopier *Directory (tenant) ID* til `ENTRA_TENANT_ID` og *Application (client) ID* til
   `ENTRA_CLIENT_ID`.
6. Valgfritt: for å begrense hvem som kan logge inn, sett *Assignment required* = Yes under
   **Enterprise applications → MyTime → Properties**, og legg til brukere eller grupper under
   *Users and groups*.

> [!IMPORTANT]
> Noter utløpsdatoen på client secret-en. Innloggingen slutter å virke den dagen den utløper.

<details>
<summary><strong>Valgfritt: selvbetjent gjestetilgang</strong></summary>

Folk fra godkjente domener som ikke finnes i tenanten kan legge seg til som gjest via «Får du ikke logget inn?»
under innloggingsknappen. MyTime sjekker om adressen finnes fra før, inviterer den ellers som B2B-gjest (uten
e-post fra Microsoft), venter til kontoen er synlig og ber personen logge inn som vanlig. Invitasjonen godtas
ved første innlogging.

- **API permissions → Add a permission → Microsoft Graph → Application permissions**: legg til
  `User.Invite.All` og `User.Read.All`, og trykk **Grant admin consent**. Dette er applikasjonstilganger, og de
  bruker den samme client secret-en.
- Sett `GUEST_INVITE_DOMAINS=partner.no,annet.no` i `.env`. Tom eller manglende verdi skjuler valget.
- **External Identities → External collaboration settings** må tillate invitasjoner til disse domenene.
- Med *Assignment required* = Yes slipper ikke nye gjester inn før de er lagt til under *Users and groups*.
  En dynamisk gruppe for gjester (`user.userType -eq "Guest"`) løser det.
- Endepunktet er åpent, men begrenset til 5 forsøk per IP per 10 minutter. Bare den som eier adressen kan
  godta invitasjonen.

</details>

### 2. Start med Docker Compose

```bash
git clone https://github.com/janfredrik/mytime.git
cd mytime
cp .env.example .env    # fyll inn Entra-verdier, SESSION_SECRET og POSTGRES_PASSWORD
docker compose pull && docker compose up -d
```

Følg med på oppstarten med `docker compose logs -f app`.

<details>
<summary><strong>Uten å klone repoet</strong></summary>

Du trenger bare to filer i en tom mappe, f.eks. `/opt/mytime`.

`docker-compose.yml`:

```yaml
services:
  app:
    image: ghcr.io/janfredrik/mytime:${MYTIME_TAG:-latest}
    container_name: mytime
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://mytime:${POSTGRES_PASSWORD}@db:5432/mytime
    ports:
      - '${APP_PORT:-3135}:3000'
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    container_name: mytime-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: mytime
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: mytime
      TZ: Europe/Oslo
    volumes:
      - ${DATA_DIR:-./data}/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U mytime -d mytime']
      interval: 10s
      timeout: 5s
      retries: 10
```

`.env`:

```ini
PUBLIC_URL=https://mytime.domene.no

ENTRA_TENANT_ID=<directory (tenant) id>
ENTRA_CLIENT_ID=<application (client) id>
ENTRA_CLIENT_SECRET=<client secret value>

SESSION_SECRET=<openssl rand -hex 32>
POSTGRES_PASSWORD=<openssl rand -hex 24>

APP_PORT=3135
DATA_DIR=./data
TZ=Europe/Oslo
# MYTIME_TAG=1.2.3
# SESSION_TTL_DAYS=14
# LOG_LEVEL=info
```

Start med `docker compose up -d`.

</details>

**Oppdatering:** `docker compose pull && docker compose up -d` (kjør `git pull` først hvis du bruker repoet).
Migrasjonene kjøres automatisk.

### 3. Konfigurasjon

| Variabel | Beskrivelse |
| --- | --- |
| `PUBLIC_URL` | Offentlig adresse, nøyaktig slik den står i redirect-URI-en |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` | Fra app registration |
| `SESSION_SECRET` | Minst 32 tegn: `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24`. Bare bokstaver og tall, siden det settes inn i en database-URL |
| `ADMIN_EMAILS` | Valgfritt. Kommaseparerte adresser som kan administrere timekodekatalogen |
| `GUEST_INVITE_DOMAINS` | Valgfritt. Kommaseparerte domener som kan legge seg til som gjest |
| `APP_PORT` | Port på verten (standard `3135`) |
| `DATA_DIR` | Databasen lagres i `${DATA_DIR}/postgres` (standard `./data`) |
| `MYTIME_TAG` | Låser imageversjonen, f.eks. `1.2.3` (standard `latest`) |
| `SESSION_TTL_DAYS` | Hvor lenge en sesjon varer uten bruk (standard `14`) |
| `LOG_LEVEL` | Loggnivå (standard `info`) |

### 4. Reverse proxy

Pek `mytime.domene.no` til `http://<docker-vert>:3135`. Proxyen må sende `X-Forwarded-For` og
`X-Forwarded-Proto`, som er standard i Nginx Proxy Manager, SWAG, Caddy og Traefik.

> [!WARNING]
> `PUBLIC_URL` må være nøyaktig `https://mytime.domene.no`. Ellers stemmer ikke redirect-URI-en, og cookies blir
> ikke merket `Secure`.

`GET /healthz` svarer `{"ok":true}` når appen og databasen er oppe, og brukes av Docker-helsesjekken.

### Timekodekatalog

Katalogen er felles for alle brukere og lastes opp av en administrator (en adresse i `ADMIN_EMAILS`) under
**Innstillinger → Last opp katalog**. Filen er `mytime-timekoder.json` fra eksportscriptet som kjøres i
nettleserkonsollen på dagens løsning: én oppføring per prosjekt (`project_id`, `project_number`,
`project_name`) med `tasks` (`task_id`, `task_title`, `task_description`). En ny opplasting erstatter hele
katalogen. Oppgavetittelen deles ved første ` - ` (`1.1.1 - Maintenance Work` → `1.1.1` og
`Maintenance Work`).

Under **Innstillinger → Del timekoder i bruk…** ser en administrator koder som står i noens timeliste men
mangler i katalogen, med antall brukere (ikke hvem). Kodene som krysses av blir valgbare for alle, merket
«delt». De lagres separat, så en ny katalogopplasting lar dem stå. Delte koder kan foreløpig bare fjernes
direkte i databasen.

> [!NOTE]
> Katalogen inneholder interne kunde- og prosjektnavn. Den lagres bare i databasen, og `mytime-timekoder*`
> ligger i `.gitignore`. Filen kan være rundt 10 MB, så reverse proxyen må tillate så store opplastinger
> (f.eks. `client_max_body_size` i Nginx).

### Docker-image

GitHub Actions publiserer `ghcr.io/janfredrik/mytime` (amd64 og arm64) når testene er grønne på `main`.
Taggene er `latest`, `sha-<kort hash>` og `1.2.3`/`1.2` for git-tagger `v1.2.3`. For å bygge selv:

```bash
docker build -t ghcr.io/janfredrik/mytime:latest . && docker compose up -d
```

## Utvikling

Krever Node 22 og en PostgreSQL 16-database.

```bash
npm install
cp .env.example .env   # sett DATABASE_URL og DEV_AUTH_BYPASS=true
npm run dev            # server på :3000, Vite på :5173 (proxy mot serveren)
```

Med `DEV_AUTH_BYPASS=true` logger `/auth/login?user=navn` inn en lokal testbruker.

> [!CAUTION]
> `DEV_AUTH_BYPASS` slår av all innlogging. Serveren nekter å starte med den når `NODE_ENV=production`.

| Kommando | Beskrivelse |
| --- | --- |
| `npm run typecheck` | TypeScript for alle pakker |
| `npm run lint` | ESLint |
| `npm test` | Enhetstester (Vitest). Sett `TEST_DATABASE_URL` for å kjøre API- og innloggingstestene mot Postgres |
| `npm run build && E2E_DATABASE_URL=… npm run test:e2e` | Ende-til-ende-tester i Chromium (Playwright) |
| `npm run db:generate` | Lag ny migrasjon etter endring i [`schema.ts`](apps/server/src/db/schema.ts) |

## xlsx-format

Ett ark, `Timecard`, med kolonnene:

```
Project number, Project name, Task number, Task name, Type, Date, Hours, Comment, Time from, Time to
```

Eksporten har én rad per linje og dag med timer. Linjer uten timer i uka skrives som én rad med bare de fem
første kolonnene. Type er `Normal -NO` hvis ikke noe annet er valgt, og kommentarer er begrenset til 240 tegn,
som i det offisielle systemet.

Importen er tolerant:

- Kolonner finnes via overskriften, ikke posisjon.
- Timer kan være tall eller tekst, med komma eller punktum.
- Datoer kan være `2026-09-28`, `28.09.2026` eller ekte Excel-datoer.
- Daterte rader havner i sin uke, så én fil kan dekke flere uker. Rader uten dato havner i uka filen gjelder,
  eller uka du står i.

Importen erstatter innholdet i de berørte ukene etter en forhåndsvisning.
