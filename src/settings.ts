import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface OpenCodeGoPluginSettings {
  checkModelsOnStartup: boolean
  modelsRefreshIntervalMinutes: number
  notifyOnNewModelsOnly: boolean
  notifyOnLimitChanges: boolean
  notifyOnEveryCheck: boolean
}

export const DEFAULT_SETTINGS: OpenCodeGoPluginSettings = {
  checkModelsOnStartup: true,
  modelsRefreshIntervalMinutes: 60,
  notifyOnNewModelsOnly: true,
  notifyOnLimitChanges: true,
  notifyOnEveryCheck: false,
}

export class PluginSettingsStore {
  constructor(private readonly path: string) {}

  async load(): Promise<OpenCodeGoPluginSettings> {
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'))
      return { ...DEFAULT_SETTINGS, ...data }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  async save(settings: Partial<OpenCodeGoPluginSettings>): Promise<OpenCodeGoPluginSettings> {
    const current = await this.load()
    const updated = { ...current, ...settings }
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, JSON.stringify(updated, null, 2), 'utf8')
    return updated
  }
}
