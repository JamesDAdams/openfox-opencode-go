import { join } from 'node:path'
import type { ProviderPluginRegistry, ProviderPreset } from 'openfox/provider'
import { FileProviderCredentialStore } from './credentials/file-credential-store.js'
import { OpenCodeGoAuthAdapter } from './auth/opencode-auth.js'
import { OpenCodeGoTransportAdapter } from './transport/opencode-go.js'
import { OpenCodeGoQuotaProvider } from './quota/opencode-go.js'
import { PluginSettingsStore, DEFAULT_SETTINGS, type OpenCodeGoPluginSettings } from './settings.js'
import { OpenCodeGoSyncManager, type PriceDiff, type SyncManagerOptions } from './sync-manager.js'
import './types.js'
import './models.js'
import './quota/contract.js'

const opencodeGoPreset: ProviderPreset = {
  id: 'opencode-go',
  name: 'OpenCode Go',
  description: 'Access curated open coding models with generous limits via your OpenCode Go subscription ($10/month).',
  documentationUrl: 'https://opencode.ai/docs/go',
  requiresAuth: false,
  transportAdapter: 'opencode-go-transport',
  defaults: {
    name: 'OpenCode Go',
    url: 'https://opencode.ai/zen/go/v1',
    backend: 'opencode-go',
  },
  missingPluginMessage: 'Install openfox-opencode-go to use this provider.',
}

export { OpenCodeGoAuthAdapter } from './auth/opencode-auth.js'
export { OpenCodeGoTransportAdapter } from './transport/opencode-go.js'
export {
  OpenCodeGoQuotaProvider,
  type OpenCodeGoQuotaProviderOptions,
  type OpenCodeProviderAccount,
} from './quota/opencode-go.js'
export {
  OPENCODE_GO_MODELS,
  buildGoModelsList,
  fetchLiveBoosts,
  fetchLiveModelsAndBoosts,
  parseModelsFromHtml,
  parseBoostsFromHtml,
  ModelsCacheStore,
} from './models.js'
export { PluginSettingsStore, DEFAULT_SETTINGS, type OpenCodeGoPluginSettings } from './settings.js'
export { OpenCodeGoSyncManager, type PriceDiff, type SyncManagerOptions } from './sync-manager.js'

export async function register(registry: ProviderPluginRegistry): Promise<void> {
  const configDir = registry.runtime.configDirectory
  const storageDir = join(configDir, 'plugins', 'openfox-opencode-go')
  const settingsStore = new PluginSettingsStore(join(storageDir, 'settings.json'))
  const initialSettings = await settingsStore.load()

  const credentials = new FileProviderCredentialStore(
    join(storageDir, 'credentials.json'),
    join(storageDir, 'credentials.key'),
  )
  const auth = new OpenCodeGoAuthAdapter(credentials)
  const transport = new OpenCodeGoTransportAdapter(auth, {
    configDirectory: configDir,
    cacheFilePath: join(storageDir, 'models-cache.json'),
  })

  const notify =
    typeof (registry as any).context?.notify === 'function'
      ? (registry as any).context.notify.bind((registry as any).context)
      : typeof (registry as any).notify === 'function'
        ? (registry as any).notify.bind(registry)
        : undefined

  const syncManager = new OpenCodeGoSyncManager({
    transport,
    settings: initialSettings,
    ...(notify ? { notify } : {}),
  })
  syncManager.start()

  registry.registerAuth(auth)
  registry.registerTransport(transport)
  registry.registerPreset(opencodeGoPreset)

  const quotaProvider = new OpenCodeGoQuotaProvider(credentials, {
    configDirectory: registry.runtime.configDirectory,
  })

  await quotaProvider.registerProviders(registry)

  // Register RPC methods for manual quota sync and retrieval
  if (typeof registry.registerRpc === 'function') {
    registry.registerRpc('opencode.getQuota', async (params) => {
      const providerId = typeof params?.['providerId'] === 'string' ? params['providerId'] : undefined
      if (providerId) {
        const accounts = await quotaProvider.discoverProviders()
        const target = accounts.find((a) => a.id === providerId || a.sourceId === providerId)
        if (target) {
          const source = await quotaProvider.getQuotaForAccount(target)
          return { source }
        }
      }
      const sources = await quotaProvider.getAllQuotaSources()
      return { sources }
    })

    registry.registerRpc('opencode.syncQuota', async () => {
      return await quotaProvider.syncQuota(registry)
    })

    registry.registerRpc('opencode.manualSync', async () => {
      const { models, priceDiffs } = await syncManager.syncAll()
      notify?.({
        title: {
          en: 'OpenCode Go Check Completed',
          fr: 'Vérification OpenCode Go terminée',
        },
        body: {
          en: `${models.length} models verified. ${priceDiffs.length} quota/boost changes.`,
          fr: `${models.length} modèles vérifiés. ${priceDiffs.length} changements de quota/boost.`,
        },
        level: 'success',
      })
      return { success: true, modelsCount: models.length, priceDiffsCount: priceDiffs.length }
    })
  }

  // Register tool for LLM to query all OpenCode quotas
  if (typeof registry.registerTool === 'function') {
    registry.registerTool({
      name: 'get_opencode_quota',
      description: 'Retrieve current model quota limits and usage across all configured OpenCode provider accounts.',
      parameters: {
        type: 'object',
        properties: {
          providerId: {
            type: 'string',
            description: 'Optional OpenCode provider ID or source ID filter',
          },
        },
      },
      execute: async (args) => {
        const providerId = typeof args['providerId'] === 'string' ? args['providerId'] : undefined
        if (providerId) {
          const accounts = await quotaProvider.discoverProviders()
          const target = accounts.find((a) => a.id === providerId || a.sourceId === providerId)
          if (target) {
            const source = await quotaProvider.getQuotaForAccount(target)
            return {
              success: true,
              output: JSON.stringify(source, null, 2),
            }
          }
        }
        const sources = await quotaProvider.getAllQuotaSources()
        return {
          success: true,
          output: JSON.stringify({ sources }, null, 2),
        }
      },
    })
  }

  // Register turn completion hook to keep quotas updated
  if (typeof registry.registerHook === 'function') {
    registry.registerHook('turn.completed', async () => {
      try {
        await quotaProvider.syncQuota(registry)
      } catch {
        // Silently ignore background quota sync failure
      }
    })
  }

  if (typeof (registry as any).registerSettings === 'function') {
    ;(registry as any).registerSettings({
      title: {
        en: 'OpenCode Go Configuration',
        fr: 'Configuration OpenCode Go',
      },
      description: {
        en: 'Configure models discovery, quota boosts display and periodic synchronization.',
        fr: 'Configurer la découverte des modèles, l’affichage des boosts de quota et la synchronisation périodique.',
      },
      fields: [
        {
          key: 'checkModelsOnStartup',
          label: {
            en: 'Check models on OpenFox startup',
            fr: 'Vérifier les modèles au démarrage d’OpenFox',
          },
          type: 'boolean',
          description: {
            en: 'Automatically check OpenCode Go for new models when OpenFox starts.',
            fr: 'Vérifier automatiquement les nouveaux modèles OpenCode Go au démarrage.',
          },
          default: true,
          defaultValue: true,
        },
        {
          key: 'modelsRefreshIntervalMinutes',
          label: {
            en: 'Models check interval (minutes)',
            fr: 'Intervalle de vérification des modèles (minutes)',
          },
          type: 'number',
          description: {
            en: 'How often to automatically check OpenCode Go for new models (in minutes).',
            fr: 'Fréquence de vérification des nouveaux modèles (en minutes).',
          },
          default: 60,
          defaultValue: 60,
          required: true,
        },
        {
          key: 'checkPricesOnStartup',
          label: {
            en: 'Check API prices on OpenFox startup',
            fr: 'Vérifier les prix de l’API au démarrage',
          },
          type: 'boolean',
          description: {
            en: 'Automatically check API pricing changes when OpenFox starts.',
            fr: 'Vérifier automatiquement les changements de prix de l’API au démarrage.',
          },
          default: true,
          defaultValue: true,
        },
        {
          key: 'pricesRefreshIntervalMinutes',
          label: {
            en: 'Pricing check interval (minutes)',
            fr: 'Intervalle de vérification des prix (minutes)',
          },
          type: 'number',
          description: {
            en: 'How often to automatically check OpenCode Go API prices (default: 60 minutes).',
            fr: 'Fréquence de vérification des prix de l’API (par défaut : 60 minutes).',
          },
          default: 60,
          defaultValue: 60,
          required: true,
        },
        {
          key: 'notifyOnNewModelsOnly',
          label: {
            en: 'Notify only when new models are available or removed',
            fr: 'Notifier uniquement lors de l’ajout ou du retrait de modèles',
          },
          type: 'boolean',
          description: {
            en: 'Receive an in-app notification only when models are added or removed.',
            fr: 'Recevoir une notification uniquement lorsque des modèles sont ajoutés ou retirés.',
          },
          default: true,
          defaultValue: true,
        },
        {
          key: 'notifyOnPriceChanges',
          label: {
            en: 'Notify on price modifications',
            fr: 'Notifier en cas de modification des prix',
          },
          type: 'boolean',
          description: {
            en: 'Receive an in-app notification when model API prices change.',
            fr: 'Recevoir une notification lorsque les prix des modèles changent.',
          },
          default: true,
          defaultValue: true,
        },
        {
          key: 'notifyOnEveryCheck',
          label: {
            en: 'Notify on every check',
            fr: 'Notifier à chaque vérification',
          },
          type: 'boolean',
          description: {
            en: 'Receive an in-app notification every time the background batch checks models or pricing.',
            fr: 'Recevoir une notification à chaque vérification en arrière-plan.',
          },
          default: false,
          defaultValue: false,
        },
        {
          key: 'manualSync',
          label: { en: 'Sync Now', fr: 'Synchroniser' },
          type: 'button',
          buttonLabel: { en: 'Sync Now', fr: 'Synchroniser' },
          action: 'manualSync',
          rpcMethod: 'opencode.manualSync',
        },
      ],
      async getSettings() {
        return (await settingsStore.load()) as unknown as Record<string, unknown>
      },
      async saveSettings(values: Record<string, unknown>) {
        const updated = await settingsStore.save(values)
        syncManager.updateSettings(updated)
      },
      async executeAction(action: string) {
        if (action === 'manualSync') {
          const { models, priceDiffs } = await syncManager.syncAll()
          const newModels = syncManager.getLastDiscoveredModels()
          const removedModels = syncManager.getLastRemovedModels()
          const parts: string[] = [`${models.length} models available`]
          if (newModels.length > 0) parts.push(`${newModels.length} new: ${newModels.join(', ')}`)
          if (removedModels.length > 0) parts.push(`${removedModels.length} removed: ${removedModels.join(', ')}`)
          if (priceDiffs.length > 0) parts.push(`${priceDiffs.length} price changes`)
          return { message: `Sync complete: ${parts.join(' | ')}.` }
        }
      },
    })
  }
}
