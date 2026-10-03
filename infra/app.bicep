// Selve containerappen. Brukes to ganger fra main.bicep når eget domene er satt (se der).

param settings {
  location: string
  tags: object
  name: string
  environmentId: string
  image: string
  publicUrl: string
  minReplicas: int
  entraTenantId: string
  entraClientId: string
  registryServer: string
  registryUsername: string
}

@secure()
param databaseUrl string
@secure()
param entraClientSecret string
@secure()
param sessionSecret string
@secure()
param registryPassword string

param customDomain string
@description('Tom = vertsnavnet legges til uten sertifikat (første steg).')
param certificateId string

var useRegistry = !empty(settings.registryServer)

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: settings.name
  location: settings.location
  tags: settings.tags
  properties: {
    environmentId: settings.environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
        customDomains: empty(customDomain)
          ? []
          : [
              {
                name: customDomain
                bindingType: empty(certificateId) ? 'Disabled' : 'SniEnabled'
                certificateId: empty(certificateId) ? null : certificateId
              }
            ]
      }
      secrets: concat(
        [
          { name: 'database-url', value: databaseUrl }
          { name: 'entra-client-secret', value: entraClientSecret }
          { name: 'session-secret', value: sessionSecret }
        ],
        useRegistry ? [{ name: 'registry-password', value: registryPassword }] : []
      )
      registries: useRegistry
        ? [
            {
              server: settings.registryServer
              username: settings.registryUsername
              passwordSecretRef: 'registry-password'
            }
          ]
        : []
    }
    template: {
      containers: [
        {
          name: 'mytime'
          image: settings.image
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PUBLIC_URL', value: settings.publicUrl }
            { name: 'ENTRA_TENANT_ID', value: settings.entraTenantId }
            { name: 'ENTRA_CLIENT_ID', value: settings.entraClientId }
            { name: 'ENTRA_CLIENT_SECRET', secretRef: 'entra-client-secret' }
            { name: 'SESSION_SECRET', secretRef: 'session-secret' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'TZ', value: 'Europe/Oslo' }
          ]
          probes: [
            // Migrasjoner kjøres ved oppstart; gi dem tid før appen regnes som død.
            {
              type: 'Startup'
              httpGet: { path: '/healthz', port: 3000 }
              periodSeconds: 5
              failureThreshold: 24
            }
            // /healthz sjekker også databasen, så den styrer bare trafikk – et kort DB-brudd
            // skal ikke føre til at containeren startes på nytt.
            {
              type: 'Readiness'
              httpGet: { path: '/healthz', port: 3000 }
              periodSeconds: 10
              failureThreshold: 3
            }
            {
              type: 'Liveness'
              tcpSocket: { port: 3000 }
              periodSeconds: 30
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: settings.minReplicas
        maxReplicas: 3
        rules: [
          {
            name: 'http'
            http: { metadata: { concurrentRequests: '50' } }
          }
        ]
      }
    }
  }
}
