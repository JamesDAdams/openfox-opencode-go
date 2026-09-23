import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface OpenCodeGoPluginSettings {
  checkModelsOnStartup: boolean
  modelsRefreshIntervalMinutes: number
  checkPricesOnStartup: boolean
  pricesRefreshIntervalMinutes: number
  notifyOnNewModelsOnly: boolean
  notifyOnPriceChanges: boolean
  notifyOnEveryCheck: boolean
}

export const DEFAULT_SETTINGS: OpenCodeGoPluginSettings = {
  checkModelsOnStartup: true,
  modelsRefreshIntervalMinutes: 60,
  checkPricesOnStartup: true,
  pricesRefreshIntervalMinutes: 60,
  notifyOnNewModelsOnly: true,
  notifyOnPriceChanges: true,
  notifyOnEveryCheck: false,
}

export class PluginSettingsStore {
  private cached: OpenCodeGoPluginSettings | null = null

  constructor(private readonly settingsPath: string) {}

  async load(): Promise<OpenCodeGoPluginSettings> {
    if (this.cached) return this.cached
    try {
      const raw = await readFile(this.settingsPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<OpenCodeGoPluginSettings>
      this.cached = {
        checkModelsOnStartup:
          typeof parsed.checkModelsOnStartup === 'boolean'
            ? parsed.checkModelsOnStartup
            : DEFAULT_SETTINGS.checkModelsOnStartup,
        modelsRefreshIntervalMinutes:
          typeof parsed.modelsRefreshIntervalMinutes === 'number' && parsed.modelsRefreshIntervalMinutes > 0
            ? parsed.modelsRefreshIntervalMinutes
            : DEFAULT_SETTINGS.modelsRefreshIntervalMinutes,
        checkPricesOnStartup:
          typeof parsed.checkPricesOnStartup === 'boolean'
            ? parsed.checkPricesOnStartup
            : DEFAULT_SETTINGS.checkPricesOnStartup,
        pricesRefreshIntervalMinutes:
          typeof parsed.pricesRefreshIntervalMinutes === 'number' && parsed.pricesRefreshIntervalMinutes > 0
            ? parsed.pricesRefreshIntervalMinutes
            : DEFAULT_SETTINGS.pricesRefreshIntervalMinutes,
        notifyOnNewModelsOnly:
          typeof parsed.notifyOnNewModelsOnly === 'boolean'
            ? parsed.notifyOnNewModelsOnly
            : DEFAULT_SETTINGS.notifyOnNewModelsOnly,
        notifyOnPriceChanges:
          typeof parsed.notifyOnPriceChanges === 'boolean'
            ? parsed.notifyOnPriceChanges
            : DEFAULT_SETTINGS.notifyOnPriceChanges,
        notifyOnEveryCheck:
          typeof parsed.notifyOnEveryCheck === 'boolean'
            ? parsed.notifyOnEveryCheck
            : DEFAULT_SETTINGS.notifyOnEveryCheck,
      }
      return this.cached
    } catch {
      this.cached = { ...DEFAULT_SETTINGS }
      return this.cached
    }
  }

  async save(
    values: Partial<OpenCodeGoPluginSettings> | Record<string, unknown>,
  ): Promise<OpenCodeGoPluginSettings> {
    const current = await this.load()
    const parsedModelsMinutes = Number(values['modelsRefreshIntervalMinutes'])
    const parsedPricesMinutes = Number(values['pricesRefreshIntervalMinutes'])

    const merged: OpenCodeGoPluginSettings = {
      checkModelsOnStartup:
        typeof values['checkModelsOnStartup'] === 'boolean'
          ? values['checkModelsOnStartup']
          : current.checkModelsOnStartup,
      modelsRefreshIntervalMinutes:
        !isNaN(parsedModelsMinutes) && parsedModelsMinutes > 0
          ? parsedModelsMinutes
          : current.modelsRefreshIntervalMinutes,
      checkPricesOnStartup:
        typeof values['checkPricesOnStartup'] === 'boolean'
          ? values['checkPricesOnStartup']
          : current.checkPricesOnStartup,
      pricesRefreshIntervalMinutes:
        !isNaN(parsedPricesMinutes) && parsedPricesMinutes > 0
          ? parsedPricesMinutes
          : current.pricesRefreshIntervalMinutes,
      notifyOnNewModelsOnly:
        typeof values['notifyOnNewModelsOnly'] === 'boolean'
          ? values['notifyOnNewModelsOnly']
          : current.notifyOnNewModelsOnly,
      notifyOnPriceChanges:
        typeof values['notifyOnPriceChanges'] === 'boolean'
          ? values['notifyOnPriceChanges']
          : current.notifyOnPriceChanges,
      notifyOnEveryCheck:
        typeof values['notifyOnEveryCheck'] === 'boolean'
          ? values['notifyOnEveryCheck']
          : current.notifyOnEveryCheck,
    }

    await mkdir(dirname(this.settingsPath), { recursive: true })
    await writeFile(this.settingsPath, JSON.stringify(merged, null, 2), 'utf8')
    this.cached = merged
    return merged
  }

  getCached(): OpenCodeGoPluginSettings {
    return this.cached ?? { ...DEFAULT_SETTINGS }
  }
}
