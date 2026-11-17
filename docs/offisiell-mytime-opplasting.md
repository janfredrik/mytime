# Sende uker rett til offisielle MyTime

## Status
«Eksporter flere uker» laster i dag ned én `.xlsx` per uke, og brukeren laster dem opp i offisielle MyTime selv.
Sending rett dit krever at vi vet hvordan opplastingen der ser ut. Det kan vi ikke sjekke før systemet er på
nett. Alt er klart for et nytt leveringsvalg: [delivery.ts](../apps/web/src/lib/delivery.ts) har `DELIVERY_METHODS`.
Dialogen ([ExportWeeksDialog.tsx](../apps/web/src/components/ExportWeeksDialog.tsx)) viser et valg bare når
det finnes mer enn én metode, så ingen ser «Send til MyTime» før det virker.

## Hva vi må finne ut når systemet er oppe
Last opp én eksportert uke i offisielle MyTime med utviklerverktøyene åpne (**Network**, kryss av for *Preserve log*).
Ta vare på følgende:

1. **Selve opplastingen:** høyreklikk på forespørselen → *Copy as cURL*. Vi trenger URL, metode, `Content-Type`
   (multipart eller ren binærfil?), navnet på filfeltet og eventuelle andre felt (uke, bruker-ID, tenant).
2. **Autentisering:** sendes det en `Authorization: Bearer …` (et Entra-token) eller bare informasjonskapsler?
   For et token: dekod det på jwt.ms og noter `aud` (hvilket API det gjelder) og `scp`/`roles`. **Ikke** del
   selve tokenet.
3. **Forespørsler før og etter:** henter siden et token, en CSRF-verdi eller en «opplastings-ID» først? Kommer
   det en bekreftelse etterpå (f.eks. «send inn», «lagre»)?
4. **Svaret:** statuskode og innhold både når det går bra og når filen avvises (prøv gjerne en uke med en for
   lang kommentar). Da kan vi vise feilmeldingen per uke i dialogen.
5. **Én uke per opplasting?** Sjekk om én fil med flere uker godtas. Ellers sender vi én forespørsel per uke,
   slik nedlastingen gjør nå.

Lagre gjerne alt som en HAR-fil (*Export HAR*), men fjern informasjonskapsler og tokener før den deles.

## Tenant-oppsettet
Uoffisielle MyTime kjører i tenant A. Offisielle MyTime kjører i tenant B. Brukerne har hjemmekonto i B og er
gjester i A. Det avgjør hvilke veier som er mulige:

- **Serveren sender på vegne av brukeren (best):** dette fungerer hvis offisielle MyTime har et API beskyttet av
  Entra (punkt 2 gir `aud`). Da må app-registreringen til MyTime bli *multitenant*, og tenant B må gi samtykke til
  å kalle det API-et. Brukeren må logge inn mot tenant B (sin hjemmetenant) for å få et token for B. Det krever en
  administrator i B.
- **Nettleseren sender direkte:** dette virker bare hvis offisielle MyTime tillater CORS fra vår adresse, og det er
  lite sannsynlig. Informasjonskapsler fra deres domene blir ikke sendt med fra vårt.
- **Fallback (fungerer alltid):** dagens nedlasting av én fil per uke. Brukeren laster dem opp i offisielle MyTime.

Når punktene over er kjent, legger vi til en metode `send` i `DELIVERY_METHODS`, sammen med et endepunkt på
serveren som gjør selve kallet. Status per uke (`markExported`) settes først når det offisielle systemet har
godtatt uka.
