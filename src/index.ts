import { join } from 'node:path'
import type { ProviderPluginRegistry, ProviderPreset } from 'openfox/provider'
import { FileProviderCredentialStore } from './credentials/file-credential-store.js'
import { OpenCodeGoAuthAdapter } from './auth/opencode-auth.js'
import { OpenCodeGoTransportAdapter } from './transport/opencode-go.js'
import { PluginSettingsStore, DEFAULT_SETTINGS, type OpenCodeGoPluginSettings } from './settings.js'
import { OpenCodeGoSyncManager, type LimitChangeDiff, type SyncManagerOptions } from './sync-manager.js'
import './types.js'
import './models.js'

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
export { OpenCodeGoSyncManager, type LimitChangeDiff, type SyncManagerOptions } from './sync-manager.js'
export { PluginSettingsStore, DEFAULT_SETTINGS, type OpenCodeGoPluginSettings } from './settings.js'
export { OPENCODE_GO_MODELS, buildGoModelsList, fetchLiveBoosts } from './models.js'

export async function register(registry: ProviderPluginRegistry): Promise<void> {
  const storageDir = join(registry.runtime.configDirectory, 'plugins', 'openfox-opencode-go')
  const settingsStore = new PluginSettingsStore(join(storageDir, 'settings.json'))
  const initialSettings = await settingsStore.load()

  const credentials = new FileProviderCredentialStore(
    join(storageDir, 'credentials.json'),
    join(storageDir, 'credentials.key'),
  )
  const auth = new OpenCodeGoAuthAdapter(credentials)
  const transport = new OpenCodeGoTransportAdapter(auth, {
    configDirectory: registry.runtime.configDirectory,
  })

  const syncManager = new OpenCodeGoSyncManager({
    auth,
    credentials,
    transport,
    settings: initialSettings,
    notify: (notification) => {
      if (typeof (registry as any).notify === 'function') {
        ;(registry as any).notify(notification)
      }
    },
  })
  syncManager.start()

  registry.registerAuth(auth)
  registry.registerTransport(transport)
  registry.registerPreset(opencodeGoPreset)

  if (typeof (registry as any).registerSettings === 'function') {
    ;(registry as any).registerSettings({
      title: 'OpenCode Go Configuration',
      description: 'Configure model discovery, quota ordering and usage limit boost notifications for OpenCode Go.',
      fields: [
        {
          key: 'checkModelsOnStartup',
          label: 'Check models on OpenFox startup',
          type: 'boolean',
          description: 'Automatically check OpenCode Go for new models and temporary quota boosts on startup.',
          defaultValue: true,
        },
        {
          key: 'modelsRefreshIntervalMinutes',
          label: 'Check interval (minutes)',
          type: 'number',
          description: 'How often to check for OpenCode Go model updates and temporary limit boosts (in minutes).',
          defaultValue: 60,
          required: true,
        },
        {
          key: 'notifyOnNewModelsOnly',
          label: 'Notify on model additions / removals',
          type: 'boolean',
          description: 'Receive an in-app notification when Go models are added or removed.',
          defaultValue: true,
        },
        {
          key: 'notifyOnLimitChanges',
          label: 'Notify on temporary limit boosts & restoration',
          type: 'boolean',
          description: 'Receive an in-app notification when models receive temporary boosts (e.g. 2x limits) or return to normal.',
          defaultValue: true,
        },
        {
          key: 'notifyOnEveryCheck',
          label: 'Notify on every check',
          type: 'boolean',
          description: 'Receive an in-app notification every time the background batch checks models.',
          defaultValue: false,
        },
        {
          key: 'manualSync',
          label: '',
          type: 'button',
          buttonLabel: 'Sync Now',
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
          const { models, boosts, added, removed } = await syncManager.syncAll()

          const parts: string[] = [`${models.length} Go models available`]
          if (added.length > 0) parts.push(`${added.length} new: ${added.join(', ')}`)
          if (removed.length > 0) parts.push(`${removed.length} removed: ${removed.join(', ')}`)
          if (boosts.length > 0) parts.push(`${boosts.length} limit updates`)

          return { message: `Sync complete: ${parts.join(' | ')}.` }
        }
      },
    })
  }
}
