// Hemmeligheter leses fra miljøvariabler, så ingenting sensitivt havner i git. Se infra/README.md.
using 'main.bicep'

param customDomain = readEnvironmentVariable('MYTIME_DOMAIN', '')
param image = readEnvironmentVariable('MYTIME_IMAGE', 'ghcr.io/janfredrik/mytime:latest')

param entraTenantId = readEnvironmentVariable('ENTRA_TENANT_ID')
param entraClientId = readEnvironmentVariable('ENTRA_CLIENT_ID')
param entraClientSecret = readEnvironmentVariable('ENTRA_CLIENT_SECRET')
param sessionSecret = readEnvironmentVariable('SESSION_SECRET')
param postgresPassword = readEnvironmentVariable('POSTGRES_PASSWORD')

// Kun ved privat image på ghcr.io: GitHub-brukernavn og en PAT med read:packages.
param registryUsername = readEnvironmentVariable('REGISTRY_USERNAME', '')
param registryPassword = readEnvironmentVariable('REGISTRY_PASSWORD', '')
