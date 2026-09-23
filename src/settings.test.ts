import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginSettingsStore, DEFAULT_SETTINGS } from './settings.js'

describe('OpenCodeGo PluginSettingsStore', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'opencode-go-settings-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('loads default settings when file does not exist', async () => {
    const store = new PluginSettingsStore(join(tempDir, 'settings.json'))
    const settings = await store.load()
    expect(settings).toEqual(DEFAULT_SETTINGS)
    expect(settings.checkModelsOnStartup).toBe(true)
    expect(settings.modelsRefreshIntervalMinutes).toBe(60)
    expect(settings.checkPricesOnStartup).toBe(true)
    expect(settings.pricesRefreshIntervalMinutes).toBe(60)
    expect(settings.notifyOnNewModelsOnly).toBe(true)
    expect(settings.notifyOnPriceChanges).toBe(true)
    expect(settings.notifyOnEveryCheck).toBe(false)
  })

  it('saves and reloads settings correctly', async () => {
    const store = new PluginSettingsStore(join(tempDir, 'settings.json'))
    const saved = await store.save({
      checkModelsOnStartup: false,
      modelsRefreshIntervalMinutes: 30,
      notifyOnEveryCheck: true,
    })
    expect(saved.checkModelsOnStartup).toBe(false)
    expect(saved.modelsRefreshIntervalMinutes).toBe(30)
    expect(saved.notifyOnEveryCheck).toBe(true)
    expect(saved.checkPricesOnStartup).toBe(true)

    const reloadedStore = new PluginSettingsStore(join(tempDir, 'settings.json'))
    const reloaded = await reloadedStore.load()
    expect(reloaded.checkModelsOnStartup).toBe(false)
    expect(reloaded.modelsRefreshIntervalMinutes).toBe(30)
    expect(reloaded.notifyOnEveryCheck).toBe(true)
  })
})
