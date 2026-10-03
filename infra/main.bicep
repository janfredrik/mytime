// MyTime i Azure: Container Apps (appen) + PostgreSQL Flexible Server (databasen).
// Deployes til en ressursgruppe; se infra/README.md.

targetScope = 'resourceGroup'

@description('Region for alle ressurser.')
param location string = resourceGroup().location

@description('Prefiks for ressursnavn.')
param name string = 'mytime'

@description('Container-image. GitHub Actions oppdaterer imaget ved nye bygg; send inn gjeldende tag ved redeploy.')
param image string = 'ghcr.io/janfredrik/mytime:latest'

@description('Eget domene, f.eks. mytime.x99.no. Tom = bruk *.azurecontainerapps.io-adressen.')
param customDomain string = ''

@description('Offentlig adresse appen nås på. Tom = utledes fra customDomain eller Container Apps-adressen.')
param publicUrl string = ''

param entraTenantId string
param entraClientId string
@secure()
param entraClientSecret string

@description('Minst 32 tegn: openssl rand -hex 32')
@secure()
@minLength(32)
param sessionSecret string

@description('Databasepassord, kun bokstaver og tall (inngår i DATABASE_URL): openssl rand -hex 24')
@secure()
@minLength(16)
param postgresPassword string

@description('Brukernavn for privat container-registry. Tomt for offentlig image.')
param registryUsername string = ''
@secure()
param registryPassword string = ''

@description('Minste antall kopier. 1 unngår kaldstart; 0 er billigst.')
@minValue(0)
param minReplicas int = 1

@description('Postgres-størrelse. B1ms holder for noen få brukere.')
param postgresSku string = 'Standard_B1ms'

@description('Dager med automatisk backup av databasen (7–35).')
@minValue(7)
@maxValue(35)
param postgresBackupRetentionDays int = 7

param tags object = { app: 'mytime' }

var suffix = uniqueString(resourceGroup().id)
var postgresUser = 'mytime'
var postgresDb = 'mytime'
var registryServer = split(image, '/')[0]
var useRegistry = !empty(registryUsername)

// ---- Logger ----

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${name}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ---- Database ----

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${name}-pg-${suffix}'
  location: location
  tags: tags
  sku: {
    name: postgresSku
    tier: startsWith(postgresSku, 'Standard_B') ? 'Burstable' : 'GeneralPurpose'
  }
  properties: {
    version: '16'
    administratorLogin: postgresUser
    administratorLoginPassword: postgresPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: postgresBackupRetentionDays
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: postgresDb
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource postgresTimezone 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: postgres
  name: 'timezone'
  properties: {
    value: 'Europe/Oslo'
    source: 'user-override'
  }
  dependsOn: [postgresDatabase]
}

// 0.0.0.0–0.0.0.0 = «Allow public access from any Azure service». Tilgangen er fortsatt
// beskyttet av passord og påkrevd TLS; for privat nettverk må app og database inn i et VNet.
resource postgresAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
  dependsOn: [postgresTimezone]
}

// ---- Container Apps ----

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${name}-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

var appName = '${name}-app'
var defaultFqdn = '${appName}.${environment.properties.defaultDomain}'
var resolvedPublicUrl = !empty(publicUrl)
  ? publicUrl
  : (!empty(customDomain) ? 'https://${customDomain}' : 'https://${defaultFqdn}')

var appSettings = {
  location: location
  tags: tags
  name: appName
  environmentId: environment.id
  image: image
  publicUrl: resolvedPublicUrl
  minReplicas: minReplicas
  entraTenantId: entraTenantId
  entraClientId: entraClientId
  registryServer: useRegistry ? registryServer : ''
  registryUsername: registryUsername
}

var databaseUrl = 'postgres://${postgresUser}:${postgresPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${postgresDb}?sslmode=require'

// Med eget domene må vertsnavnet ligge på appen før Azure kan utstede det administrerte
// sertifikatet, og først deretter kan det bindes. Derfor deployes appen i to steg.
module app 'app.bicep' = {
  name: 'app'
  params: {
    settings: appSettings
    databaseUrl: databaseUrl
    entraClientSecret: entraClientSecret
    sessionSecret: sessionSecret
    registryPassword: registryPassword
    customDomain: customDomain
    certificateId: ''
  }
  dependsOn: [postgresAllowAzure]
}

resource certificate 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' = if (!empty(customDomain)) {
  parent: environment
  name: '${name}-cert'
  location: location
  tags: tags
  properties: {
    subjectName: customDomain
    domainControlValidation: 'CNAME'
  }
  dependsOn: [app]
}

module appBinding 'app.bicep' = if (!empty(customDomain)) {
  name: 'app-binding'
  params: {
    settings: appSettings
    databaseUrl: databaseUrl
    entraClientSecret: entraClientSecret
    sessionSecret: sessionSecret
    registryPassword: registryPassword
    customDomain: customDomain
    certificateId: certificate.id
  }
}

output appName string = appName
output appFqdn string = defaultFqdn
output publicUrl string = resolvedPublicUrl
output redirectUri string = '${resolvedPublicUrl}/auth/callback'
output postgresServer string = postgres.properties.fullyQualifiedDomainName
@description('Verdi for TXT-posten asuid.<domene> ved eget domene.')
output customDomainVerificationId string = environment.properties.customDomainConfiguration.customDomainVerificationId
