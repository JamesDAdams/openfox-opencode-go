import type { ModelConfig } from 'openfox/provider'
import type { OpenCodeGoAuthAdapter } from './auth/opencode-auth.js'
import type { ProviderCredentialStore } from './credentials/credential-store.js'
import type { OpenCodeGoTransportAdapter } from './transport/opencode-go.js'
import { DEFAULT_SETTINGS, type OpenCodeGoPluginSettings } from './settings.js'

export interface SyncManagerOptions {
  auth: OpenCodeGoAuthAdapter
  credentials: ProviderCredentialStore
  transport: OpenCodeGoTransportAdapter
  notify?: (notification: { title: string; body: string }) => void
  settings?: OpenCodeGoPluginSettings
  modelsRefreshIntervalMs?: number
}

export interface LimitChangeDiff {
  modelId: string
  modelName: string
  previousMultiplier: number
  newMultiplier: number
  previousQuota: number
  newQuota: number
  type: 'boost' | 'restored' | 'changed'
  description: string
}

export class OpenCodeGoSyncManager {
  private readonly auth: OpenCodeGoAuthAdapter
  private readonly credentials: ProviderCredentialStore
  private readonly transport: OpenCodeGoTransportAdapter
  private notifier?: (notification: { title: string; body: string }) => void
  private settings: OpenCodeGoPluginSettings

  private customModelsIntervalMs?: number
  private modelsTimer: NodeJS.Timeout | null = null

  private knownModels = new Map<
    string,
    {
      name: string
      baseQuota: number
      multiplier: number
      effectiveQuota: number
    }
  >()
  private isInitialLoad = true

  private lastDiscoveredModels: string[] = []
  private lastRemovedModels: string[] = []
  private lastLimitChanges: LimitChangeDiff[] = []

  constructor(options: SyncManagerOptions) {
    this.auth = options.auth
    this.credentials = options.credentials
    this.transport = options.transport
    this.notifier = options.notify
    this.settings = options.settings ?? { ...DEFAULT_SETTINGS }
    this.customModelsIntervalMs = options.modelsRefreshIntervalMs
  }

  setNotifier(notify: (notification: { title: string; body: string }) => void): void {
    this.notifier = notify
  }

  getSettings(): OpenCodeGoPluginSettings {
    return { ...this.settings }
  }

  getLastDiscoveredModels(): string[] {
    return [...this.lastDiscoveredModels]
  }

  getLastRemovedModels(): string[] {
    return [...this.lastRemovedModels]
  }

  getLastLimitChanges(): LimitChangeDiff[] {
    return [...this.lastLimitChanges]
  }

  getModelsRefreshIntervalMs(): number {
    if (this.customModelsIntervalMs !== undefined) return this.customModelsIntervalMs
    const minutes = this.settings.modelsRefreshIntervalMinutes || DEFAULT_SETTINGS.modelsRefreshIntervalMinutes
    return minutes * 60 * 1000
  }

  updateSettings(settings: OpenCodeGoPluginSettings): void {
    const prevInterval = this.getModelsRefreshIntervalMs()
    this.settings = { ...settings }
    const newInterval = this.getModelsRefreshIntervalMs()

    if (this.modelsTimer && prevInterval !== newInterval) {
      this.stop()
      this.start(false)
    }
  }

  start(checkOnStart = this.settings.checkModelsOnStartup): void {
    if (this.modelsTimer) return
    if (checkOnStart) {
      this.checkModels(false, false).catch(() => {})
    }
    this.modelsTimer = setInterval(() => {
      this.checkModels(false, false).catch(() => {})
    }, this.getModelsRefreshIntervalMs())
    if (this.modelsTimer.unref) this.modelsTimer.unref()
  }

  stop(): void {
    if (this.modelsTimer) {
      clearInterval(this.modelsTimer)
      this.modelsTimer = null
    }
  }

  private async getFirstValidCredentialRef(): Promise<string | undefined> {
    const references = await this.credentials.listReferences()
    for (const ref of references) {
      const status = await this.auth.getStatus({ providerId: 'opencode-go', credentialRef: ref })
      if (status.state === 'connected') {
        return ref
      }
    }
    return references[0]
  }

  async checkModels(force = false, isManual = false): Promise<ModelConfig[]> {
    try {
      const credRef = await this.getFirstValidCredentialRef()

      const models = await this.transport.listModels({
        providerId: 'opencode-go',
        credentialRef: credRef,
      })

      const currentModelMap = new Map<string, ModelConfig>()
      for (const m of models) {
        currentModelMap.set(m.id, m)
      }

      const newModels: string[] = []
      const removedModels: string[] = []
      const limitChanges: LimitChangeDiff[] = []

      // Check for added models or limit changes
      for (const m of models) {
        const quotaData = (m as any).quota as
          | {
              baseRequestsPer5h: number
              multiplier: number
              effectiveRequestsPer5h: number
              isBoosted: boolean
            }
          | undefined

        const multiplier = quotaData?.multiplier ?? 1
        const effectiveQuota = quotaData?.effectiveRequestsPer5h ?? quotaData?.baseRequestsPer5h ?? 0
        const baseQuota = quotaData?.baseRequestsPer5h ?? 0
        const modelName = m.name?.replace(/\s*\([^)]*Boost\)/, '') || m.id

        if (!this.knownModels.has(m.id)) {
          newModels.push(modelName)
        } else if (!this.isInitialLoad) {
          const prev = this.knownModels.get(m.id)!
          if (prev.multiplier !== multiplier || prev.effectiveQuota !== effectiveQuota) {
            let changeType: LimitChangeDiff['type'] = 'changed'
            let desc = ''

            if (multiplier > prev.multiplier && multiplier > 1) {
              changeType = 'boost'
              desc = `${modelName}: boosted to ${multiplier}x usage limits (${effectiveQuota.toLocaleString()} req/5h)`
            } else if (multiplier < prev.multiplier && multiplier === 1) {
              changeType = 'restored'
              desc = `${modelName}: usage limit restored to normal (${effectiveQuota.toLocaleString()} req/5h)`
            } else {
              desc = `${modelName}: limit changed from ${prev.effectiveQuota.toLocaleString()} to ${effectiveQuota.toLocaleString()} req/5h`
            }

            limitChanges.push({
              modelId: m.id,
              modelName,
              previousMultiplier: prev.multiplier,
              newMultiplier: multiplier,
              previousQuota: prev.effectiveQuota,
              newQuota: effectiveQuota,
              type: changeType,
              description: desc,
            })
          }
        }
      }

      // Check for removed models
      if (!this.isInitialLoad) {
        for (const [id, prev] of this.knownModels.entries()) {
          if (!currentModelMap.has(id)) {
            removedModels.push(prev.name)
          }
        }
      }

      const wasInitial = this.isInitialLoad
      this.lastDiscoveredModels = newModels
      this.lastRemovedModels = removedModels
      this.lastLimitChanges = limitChanges

      // Update known models state
      this.knownModels.clear()
      for (const m of models) {
        const quotaData = (m as any).quota as
          | {
              baseRequestsPer5h: number
              multiplier: number
              effectiveRequestsPer5h: number
            }
          | undefined

        const modelName = m.name?.replace(/\s*\([^)]*Boost\)/, '') || m.id
        this.knownModels.set(m.id, {
          name: modelName,
          baseQuota: quotaData?.baseRequestsPer5h ?? 0,
          multiplier: quotaData?.multiplier ?? 1,
          effectiveQuota: quotaData?.effectiveRequestsPer5h ?? quotaData?.baseRequestsPer5h ?? 0,
        })
      }
      this.isInitialLoad = false

      if (this.notifier) {
        const notificationsToSend: Array<{ title: string; body: string }> = []

        // Model additions/removals
        if (!wasInitial && (newModels.length > 0 || removedModels.length > 0)) {
          const parts: string[] = []
          if (newModels.length > 0) parts.push(`Added: ${newModels.join(', ')}`)
          if (removedModels.length > 0) parts.push(`Removed: ${removedModels.join(', ')}`)

          if (this.settings.notifyOnNewModelsOnly || this.settings.notifyOnEveryCheck) {
            notificationsToSend.push({
              title: 'OpenCode Go: Model Catalog Update',
              body: parts.join('\n'),
            })
          }
        }

        // Limit / boost changes
        if (!wasInitial && limitChanges.length > 0) {
          const boostChanges = limitChanges.filter((c) => c.type === 'boost')
          const restoredChanges = limitChanges.filter((c) => c.type === 'restored')
          const otherChanges = limitChanges.filter((c) => c.type === 'changed')

          if (this.settings.notifyOnLimitChanges || this.settings.notifyOnEveryCheck) {
            if (boostChanges.length > 0) {
              notificationsToSend.push({
                title: 'OpenCode Go: Usage Limit Boost Active',
                body: boostChanges.map((b) => `🚀 ${b.description}`).join('\n'),
              })
            }
            if (restoredChanges.length > 0) {
              notificationsToSend.push({
                title: 'OpenCode Go: Usage Limit Restored',
                body: restoredChanges.map((r) => `ℹ️ ${r.description}`).join('\n'),
              })
            }
            if (otherChanges.length > 0) {
              notificationsToSend.push({
                title: 'OpenCode Go: Usage Limits Updated',
                body: otherChanges.map((o) => `• ${o.description}`).join('\n'),
              })
            }
          }
        }

        if (isManual) {
          const summaryParts: string[] = [`${models.length} Go models available`]
          if (newModels.length > 0) summaryParts.push(`${newModels.length} new`)
          if (removedModels.length > 0) summaryParts.push(`${removedModels.length} removed`)
          if (limitChanges.length > 0) summaryParts.push(`${limitChanges.length} limit updates`)

          notificationsToSend.push({
            title: 'OpenCode Go Sync Complete',
            body: summaryParts.join(' | '),
          })
        } else if (this.settings.notifyOnEveryCheck && notificationsToSend.length === 0) {
          notificationsToSend.push({
            title: 'OpenCode Go Check Complete',
            body: `${models.length} Go models up to date (no changes).`,
          })
        }

        for (const notif of notificationsToSend) {
          this.notifier(notif)
        }
      }

      return models
    } catch (err) {
      if (isManual && this.notifier) {
        this.notifier({
          title: 'OpenCode Go Sync Error',
          body: err instanceof Error ? err.message : 'Error syncing models',
        })
      }
      return []
    }
  }

  async syncAll(): Promise<{
    models: ModelConfig[]
    boosts: LimitChangeDiff[]
    added: string[]
    removed: string[]
  }> {
    const models = await this.checkModels(true, true)
    return {
      models,
      boosts: this.getLastLimitChanges(),
      added: this.getLastDiscoveredModels(),
      removed: this.getLastRemovedModels(),
    }
  }
}
