import { describe, it, expect, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { register } from './index.js'

describe('Plugin Registration', () => {
  it('should register auth, transport, preset, quota provider, rpc, tools and settings with OpenFox', async () => {
    const configDirectory = await mkdtemp(join(tmpdir(), 'opencode-go-plugin-test-'))
    let registeredAuth: any = null
    let registeredTransport: any = null
    let registeredPreset: any = null
    let registeredQuotaProvider: any = null
    let registeredSettings: any = null
    const registeredRpcs = new Map<string, Function>()
    const registeredTools = new Map<string, any>()
    const registeredHooks = new Map<string, Function>()

    const mockRegistry = {
      runtime: {
        mode: 'development',
        configDirectory,
      },
      registerAuth: (a: any) => { registeredAuth = a },
      registerTransport: (t: any) => { registeredTransport = t },
      registerPreset: (p: any) => { registeredPreset = p },
      registerQuotaProvider: (q: any) => { registeredQuotaProvider = q },
      registerRpc: (method: string, fn: Function) => { registeredRpcs.set(method, fn) },
      registerTool: (tool: any) => { registeredTools.set(tool.name, tool) },
      registerHook: (event: string, fn: Function) => { registeredHooks.set(event, fn) },
      registerSettings: (s: any) => { registeredSettings = s },
      notify: vi.fn(),
    }

    await register(mockRegistry as any)

    expect(registeredAuth).toBeDefined()
    expect(registeredAuth.id).toBe('opencode-go-auth')

    expect(registeredTransport).toBeDefined()
    expect(registeredTransport.id).toBe('opencode-go-transport')

    expect(registeredPreset).toBeDefined()
    expect(registeredPreset.id).toBe('opencode-go')
    expect(registeredPreset.defaults.backend).toBe('opencode-go')

    expect(registeredQuotaProvider).toBeDefined()
    expect(registeredQuotaProvider.id).toBe('opencode-go')
    expect(registeredQuotaProvider.name).toBe('OpenCode Go')

    expect(registeredRpcs.has('opencode.getQuota')).toBe(true)
    expect(registeredRpcs.has('opencode.syncQuota')).toBe(true)
    expect(registeredRpcs.has('opencode.manualSync')).toBe(true)

    expect(registeredTools.has('get_opencode_quota')).toBe(true)
    expect(registeredHooks.has('turn.completed')).toBe(true)

    expect(registeredSettings).toBeDefined()
    expect(registeredSettings.fields).toHaveLength(8)

    const fieldKeys = registeredSettings.fields.map((f: any) => f.key)
    expect(fieldKeys).toEqual([
      'checkModelsOnStartup',
      'modelsRefreshIntervalMinutes',
      'checkPricesOnStartup',
      'pricesRefreshIntervalMinutes',
      'notifyOnNewModelsOnly',
      'notifyOnPriceChanges',
      'notifyOnEveryCheck',
      'manualSync',
    ])

    const initialSettings = await registeredSettings.getSettings()
    expect(initialSettings.checkModelsOnStartup).toBe(true)
    expect(initialSettings.modelsRefreshIntervalMinutes).toBe(60)

    await registeredSettings.saveSettings({ modelsRefreshIntervalMinutes: 45 })
    const updatedSettings = await registeredSettings.getSettings()
    expect(updatedSettings.modelsRefreshIntervalMinutes).toBe(45)

    const manualSyncRpc = registeredRpcs.get('opencode.manualSync')
    const rpcResult = await manualSyncRpc?.()
    expect(rpcResult.success).toBe(true)

    const actionResult = await registeredSettings.executeAction('manualSync')
    expect(actionResult.message).toContain('models available')

    await rm(configDirectory, { recursive: true, force: true })
  })
})
