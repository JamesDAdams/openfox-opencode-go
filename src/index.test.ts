import { describe, it, expect, vi } from 'vitest'
import { register } from './index.js'

describe('Plugin Registration', () => {
  it('should register auth, transport, preset and settings with OpenFox', async () => {
    let registeredAuth: any = null
    let registeredTransport: any = null
    let registeredPreset: any = null
    let registeredSettings: any = null

    const mockRegistry = {
      runtime: {
        mode: 'development',
        configDirectory: '/tmp/openfox-test',
      },
      registerAuth: (a: any) => { registeredAuth = a },
      registerTransport: (t: any) => { registeredTransport = t },
      registerPreset: (p: any) => { registeredPreset = p },
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

    expect(registeredSettings).toBeDefined()
    expect(registeredSettings.title).toBe('OpenCode Go Configuration')
  })
})
