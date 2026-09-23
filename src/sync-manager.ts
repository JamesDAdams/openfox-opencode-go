import type { ModelConfig } from 'openfox/provider'
import type { OpenCodeGoTransportAdapter } from './transport/opencode-go.js'
import { DEFAULT_SETTINGS, type OpenCodeGoPluginSettings } from './settings.js'

export interface PriceDiff {
  modelId: string
  oldMultiplier?: number
  newMultiplier?: number
  oldQuota?: number
  newQuota?: number
  changes: string[]
}

export interface SyncNotification {
  title: string | { en: string; fr: string }
  body?: string | { en: string; fr: string }
  level?: 'info' | 'success' | 'warning' | 'error'
}

export interface SyncManagerOptions {
  transport: OpenCodeGoTransportAdapter
  settings?: OpenCodeGoPluginSettings
  notify?: (notification: SyncNotification) => void
  modelsRefreshIntervalMs?: number
  pricesRefreshIntervalMs?: number
}

interface ModelQuotaMeta {
  baseRequestsPer5h?: number
  multiplier?: number
  effectiveRequestsPer5h?: number
  isBoosted?: boolean
}

type ModelWithQuota = ModelConfig & {
  quota?: ModelQuotaMeta
}

export function formatPriceDiffBody(priceDiffs: PriceDiff[], maxModels = 2): string {
  if (priceDiffs.length === 0) return ''

  const formattedModels = priceDiffs.slice(0, maxModels).map((diff) => {
    const detail = diff.changes.length > 0 ? diff.changes.join('\n') : '• Quota/Boost updated'
    return `${diff.modelId}:\n${detail}`
  })

  const remaining = priceDiffs.length - maxModels
  if (remaining > 0) {
    return `${formattedModels.join('\n\n')}\n\n(+${remaining} other${remaining > 1 ? 's' : ''})`
  }

  return formattedModels.join('\n\n')
}

export class OpenCodeGoSyncManager {
  private readonly transport: OpenCodeGoTransportAdapter
  private notifier?: (notification: SyncNotification) => void
  private settings: OpenCodeGoPluginSettings

  private customModelsIntervalMs?: number
  private customPricesIntervalMs?: number

  private modelsTimer: NodeJS.Timeout | null = null
  private pricesTimer: NodeJS.Timeout | null = null

  private knownModelIds = new Set<string>()
  private knownModelQuotas = new Map<string, ModelQuotaMeta>()
  private isInitialModelsLoad = true
  private isInitialPricesLoad = true

  private lastDiscoveredModels: string[] = []
  private lastRemovedModels: string[] = []
  private lastPriceDiffs: PriceDiff[] = []

  constructor(options: SyncManagerOptions) {
    this.transport = options.transport
    this.notifier = options.notify
    this.settings = options.settings ?? { ...DEFAULT_SETTINGS }
    this.customModelsIntervalMs = options.modelsRefreshIntervalMs
    this.customPricesIntervalMs = options.pricesRefreshIntervalMs
  }

  setNotifier(notify: (notification: SyncNotification) => void): void {
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

  getLastPriceDiffs(): PriceDiff[] {
    return [...this.lastPriceDiffs]
  }

  getModelsRefreshIntervalMs(): number {
    if (this.customModelsIntervalMs !== undefined) return this.customModelsIntervalMs
    const minutes = this.settings.modelsRefreshIntervalMinutes || DEFAULT_SETTINGS.modelsRefreshIntervalMinutes
    return minutes * 60 * 1000
  }

  getPricesRefreshIntervalMs(): number {
    if (this.customPricesIntervalMs !== undefined) return this.customPricesIntervalMs
    const minutes = this.settings.pricesRefreshIntervalMinutes || DEFAULT_SETTINGS.pricesRefreshIntervalMinutes
    return minutes * 60 * 1000
  }

  updateSettings(settings: OpenCodeGoPluginSettings): void {
    const prevModelsInterval = this.getModelsRefreshIntervalMs()
    const prevPricesInterval = this.getPricesRefreshIntervalMs()
    this.settings = { ...settings }
    const newModelsInterval = this.getModelsRefreshIntervalMs()
    const newPricesInterval = this.getPricesRefreshIntervalMs()

    if (this.modelsTimer && prevModelsInterval !== newModelsInterval) {
      this.stopModelsSync()
      this.startModelsSync(false)
    }

    if (this.pricesTimer && prevPricesInterval !== newPricesInterval) {
      this.stopPricesSync()
      this.startPricesSync(false)
    }
  }

  start(): void {
    this.startModelsSync(this.settings.checkModelsOnStartup)
    this.startPricesSync(this.settings.checkPricesOnStartup)
  }

  stop(): void {
    this.stopModelsSync()
    this.stopPricesSync()
  }

  restart(): void {
    this.stop()
    this.start()
  }

  startModelsSync(checkOnStart = this.settings.checkModelsOnStartup): void {
    if (this.modelsTimer) return
    if (checkOnStart) {
      this.checkModels(false, false).catch(() => {})
    }
    this.modelsTimer = setInterval(() => {
      this.checkModels(false, false).catch(() => {})
    }, this.getModelsRefreshIntervalMs())
    if (this.modelsTimer.unref) this.modelsTimer.unref()
  }

  stopModelsSync(): void {
    if (this.modelsTimer) {
      clearInterval(this.modelsTimer)
      this.modelsTimer = null
    }
  }

  startPricesSync(checkOnStart = this.settings.checkPricesOnStartup): void {
    if (this.pricesTimer) return
    if (checkOnStart) {
      this.checkPrices(false, false).catch(() => {})
    }
    this.pricesTimer = setInterval(() => {
      this.checkPrices(false, false).catch(() => {})
    }, this.getPricesRefreshIntervalMs())
    if (this.pricesTimer.unref) this.pricesTimer.unref()
  }

  stopPricesSync(): void {
    if (this.pricesTimer) {
      clearInterval(this.pricesTimer)
      this.pricesTimer = null
    }
  }

  async checkModels(_force = false, isManual = false): Promise<ModelConfig[]> {
    try {
      const dummyContext = {
        providerId: 'opencode-go',
        signal: new AbortController().signal,
        model: 'mimo-v2.5',
      }
      const models = (await this.transport.listModels(dummyContext as any)) as ModelWithQuota[]
      const currentModelIds = new Set(models.map((m) => m.id))
      const newModels: string[] = []
      const removedModels: string[] = []

      for (const m of models) {
        if (!this.knownModelIds.has(m.id)) {
          newModels.push(m.name || m.id)
        }
      }

      if (!this.isInitialModelsLoad) {
        for (const id of this.knownModelIds) {
          if (!currentModelIds.has(id)) {
            removedModels.push(id)
          }
        }
      }

      const wasInitial = this.isInitialModelsLoad
      this.lastDiscoveredModels = newModels
      this.lastRemovedModels = removedModels
      if (models.length > 0) {
        this.knownModelIds = currentModelIds
      }
      this.isInitialModelsLoad = false

      if (this.notifier) {
        const changes: string[] = []
        if (newModels.length > 0) {
          changes.push(`New models (${newModels.length}): ${newModels.join(', ')}`)
        }
        if (removedModels.length > 0) {
          changes.push(`Removed models (${removedModels.length}): ${removedModels.join(', ')}`)
        }

        if (isManual) {
          this.notifier({
            title: { en: 'OpenCode Go Models Synced', fr: 'Modèles OpenCode Go synchronisés' },
            body:
              changes.length > 0
                ? {
                    en: `Sync complete: ${models.length} models available (${changes.join(' | ')}).`,
                    fr: `Synchronisation terminée : ${models.length} modèles disponibles (${changes.join(' | ')}).`,
                  }
                : {
                    en: `Sync complete: ${models.length} models available (no changes).`,
                    fr: `Synchronisation terminée : ${models.length} modèles disponibles (aucun changement).`,
                  },
            level: 'success',
          })
        } else if (
          !wasInitial &&
          changes.length > 0 &&
          (this.settings.notifyOnNewModelsOnly || this.settings.notifyOnEveryCheck)
        ) {
          this.notifier({
            title: { en: 'OpenCode Go: New Models Available', fr: 'OpenCode Go : Nouveaux modèles disponibles' },
            body: { en: changes.join('\n'), fr: changes.join('\n') },
            level: 'info',
          })
        } else if (this.settings.notifyOnEveryCheck && (!wasInitial || changes.length === 0)) {
          this.notifier({
            title: { en: 'OpenCode Go Models Checked', fr: 'Modèles OpenCode Go vérifiés' },
            body: {
              en: `Check complete: ${models.length} models available (no changes).`,
              fr: `Vérification terminée : ${models.length} modèles disponibles (aucun changement).`,
            },
            level: 'info',
          })
        }
      }

      return models
    } catch (err) {
      if (isManual && this.notifier) {
        this.notifier({
          title: { en: 'OpenCode Go Models Sync Error', fr: 'Erreur de synchronisation des modèles OpenCode Go' },
          body: {
            en: err instanceof Error ? err.message : 'Error syncing models',
            fr: err instanceof Error ? err.message : 'Erreur lors de la synchronisation des modèles',
          },
          level: 'error',
        })
      }
      return []
    }
  }

  async checkPrices(_force = false, isManual = false): Promise<PriceDiff[]> {
    try {
      const dummyContext = {
        providerId: 'opencode-go',
        signal: new AbortController().signal,
        model: 'mimo-v2.5',
      }
      const models = (await this.transport.listModels(dummyContext as any)) as ModelWithQuota[]
      const priceDiffs: PriceDiff[] = []

      for (const m of models) {
        const currentQuota = m.quota
        if (!currentQuota) continue

        const known = this.knownModelQuotas.get(m.id)
        if (known) {
          const changes: string[] = []
          if (known.multiplier !== currentQuota.multiplier) {
            changes.push(`Boost multiplier: ${known.multiplier ?? 1}x → ${currentQuota.multiplier ?? 1}x`)
          }
          if (known.effectiveRequestsPer5h !== currentQuota.effectiveRequestsPer5h) {
            changes.push(
              `Effective rate limit: ${known.effectiveRequestsPer5h ?? 'N/A'} → ${currentQuota.effectiveRequestsPer5h ?? 'N/A'} req/5h`,
            )
          }

          if (changes.length > 0) {
            priceDiffs.push({
              modelId: m.id,
              oldMultiplier: known.multiplier,
              newMultiplier: currentQuota.multiplier,
              oldQuota: known.effectiveRequestsPer5h,
              newQuota: currentQuota.effectiveRequestsPer5h,
              changes,
            })
          }
        }

        this.knownModelQuotas.set(m.id, { ...currentQuota })
      }

      this.lastPriceDiffs = priceDiffs
      this.isInitialPricesLoad = false

      if (this.notifier) {
        if (priceDiffs.length > 0) {
          const body = formatPriceDiffBody(priceDiffs)
          if (isManual || this.settings.notifyOnPriceChanges || this.settings.notifyOnEveryCheck) {
            this.notifier({
              title: { en: 'OpenCode Go Quota & Boosts Updated', fr: 'Quotas et boosts OpenCode Go mis à jour' },
              body: {
                en: `Pricing/limit changes detected for ${priceDiffs.length} model(s):\n${body}`,
                fr: `Changements de limites/prix détectés pour ${priceDiffs.length} modèle(s) :\n${body}`,
              },
              level: 'info',
            })
          }
        } else if (isManual) {
          this.notifier({
            title: { en: 'OpenCode Go Pricing Checked', fr: 'Prix OpenCode Go vérifiés' },
            body: {
              en: 'All model prices and quotas are up-to-date (no changes).',
              fr: 'Tous les prix et quotas des modèles sont à jour (aucun changement).',
            },
            level: 'info',
          })
        } else if (this.settings.notifyOnEveryCheck) {
          this.notifier({
            title: { en: 'OpenCode Go Pricing Checked', fr: 'Prix OpenCode Go vérifiés' },
            body: {
              en: 'All model prices and quotas are up-to-date (no changes).',
              fr: 'Tous les prix et quotas des modèles sont à jour (aucun changement).',
            },
            level: 'info',
          })
        }
      }

      return priceDiffs
    } catch (err) {
      if (isManual && this.notifier) {
        this.notifier({
          title: { en: 'OpenCode Go Pricing Sync Error', fr: 'Erreur de synchronisation des prix OpenCode Go' },
          body: {
            en: err instanceof Error ? err.message : 'Error checking API prices/quotas',
            fr: err instanceof Error ? err.message : 'Erreur lors de la vérification des prix/quotas',
          },
          level: 'error',
        })
      }
      return []
    }
  }

  async syncAll(): Promise<{ models: ModelConfig[]; priceDiffs: PriceDiff[] }> {
    const models = await this.checkModels(true, true)
    const priceDiffs = await this.checkPrices(true, false)
    return { models, priceDiffs }
  }
}
