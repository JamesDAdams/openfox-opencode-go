import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenCodeGoQuotaProvider } from './opencode-go.js'
import type { ProviderCredentialStore } from '../credentials/credential-store.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

class MemoryCredentialStore implements ProviderCredentialStore {
  private store = new Map<string, unknown>()
  async create(data: unknown): Promise<string> {
    const id = `ref-${this.store.size + 1}`
    this.store.set(id, data)
    return id
  }
  async get(id: string): Promise<unknown | undefined> {
    return this.store.get(id)
  }
  async set(id: string, data: unknown): Promise<void> {
    this.store.set(id, data)
  }
  async delete(id: string): Promise<void> {
    this.store.delete(id)
  }
  async listReferences(): Promise<string[]> {
    return Array.from(this.store.keys())
  }
}

describe('OpenCodeGoQuotaProvider', () => {
  beforeEach(() => {
    delete process.env.OPENCODE_GO_API_KEY
    delete process.env.OPENCODE_API_KEY
    const pendingKey = Symbol.for('openfox.pendingQuotaProviders')
    const globalQuotaKey = Symbol.for('openfox.quotaManager')
    delete (globalThis as any)[pendingKey]
    delete (globalThis as any)[globalQuotaKey]
  })

  it('returns empty metrics when no credentials and no env var', async () => {
    const credentials = new MemoryCredentialStore()
    const provider = new OpenCodeGoQuotaProvider(credentials)
    const quota = await provider.getQuota()
    expect(quota.id).toBe('opencode-go')
    expect(quota.name).toBe('OpenCode Go')
    expect(quota.metrics).toEqual([])
  })

  it('should parse real /zen/go/v1/usage payload with rolling, weekly and monthly windows', async () => {
    const credentials = new MemoryCredentialStore()
    await credentials.create({ apiKey: 'og_live_test_key', label: 'Pro Plan' })

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/zen/go/v1/usage')) {
        return {
          ok: true,
          json: async () => ({
            usage: {
              rolling: {
                status: 'ok',
                percent: 15,
                resetsAt: '2026-09-08T14:18:36.593Z',
              },
              weekly: {
                status: 'ok',
                percent: 40,
                resetsAt: '2026-09-14T00:00:00.593Z',
              },
              monthly: {
                status: 'rate-limited',
                percent: 100,
                resetsAt: '2026-09-16T11:25:45.593Z',
              },
            },
          }),
        }
      }
      return { ok: false, status: 404 }
    })

    const provider = new OpenCodeGoQuotaProvider(credentials, {
      fetcher: mockFetch as any,
    })

    const quota = await provider.getQuota()
    expect(quota.name).toBe('OpenCode Go (Pro Plan)')
    expect(quota.metrics).toHaveLength(3)

    expect(quota.metrics[0]).toEqual({
      kind: 'windowed',
      label: '5-hour rolling',
      used: 15,
      limit: 100,
      window: 'hour',
      resetsAt: '2026-09-08T14:18:36.593Z',
    })

    expect(quota.metrics[1]).toEqual({
      kind: 'windowed',
      label: 'Weekly',
      used: 40,
      limit: 100,
      window: 'week',
      resetsAt: '2026-09-14T00:00:00.593Z',
    })

    expect(quota.metrics[2]).toEqual({
      kind: 'windowed',
      label: 'Monthly',
      used: 100,
      limit: 100,
      window: 'month',
      resetsAt: '2026-09-16T11:25:45.593Z',
    })
  })

  it('should discover and fetch quota for multiple OpenCode providers in config.json', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfox-quota-test-'))
    const configPath = path.join(tempDir, 'config.json')

    const config = {
      providers: [
        {
          id: 'opencode-pro',
          name: 'OpenCode Pro Account',
          backend: 'opencode-go',
          apiKey: 'key-pro-123',
        },
        {
          id: 'opencode-team',
          name: 'OpenCode Team Account',
          backend: 'opencode-go',
          apiKey: 'key-team-456',
        },
        {
          id: 'openai-main',
          name: 'OpenAI',
          backend: 'openai',
          apiKey: 'sk-other',
        },
      ],
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')

    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: any) => {
      const authHeader = init?.headers?.Authorization || ''
      if (authHeader.includes('key-pro-123')) {
        return {
          ok: true,
          json: async () => ({
            usage: {
              rolling: { percent: 20 },
              weekly: { percent: 35 },
            },
          }),
        }
      }
      if (authHeader.includes('key-team-456')) {
        return {
          ok: true,
          json: async () => ({
            usage: {
              rolling: { percent: 80 },
              weekly: { percent: 90 },
            },
          }),
        }
      }
      return { ok: false, status: 401 }
    })

    const credentials = new MemoryCredentialStore()
    const provider = new OpenCodeGoQuotaProvider(credentials, {
      configDirectory: tempDir,
      fetcher: mockFetch as any,
    })

    const accounts = await provider.discoverProviders()
    expect(accounts).toHaveLength(2)
    expect(accounts[0]?.id).toBe('opencode-pro')
    expect(accounts[1]?.id).toBe('opencode-team')

    const sources = await provider.getAllQuotaSources()
    expect(sources).toHaveLength(2)

    expect(sources[0]?.id).toBe('opencode-pro')
    expect(sources[0]?.name).toBe('OpenCode Pro Account')
    expect(sources[0]?.metrics[0]).toMatchObject({ kind: 'windowed', label: '5-hour rolling', used: 20 })

    expect(sources[1]?.id).toBe('opencode-team')
    expect(sources[1]?.name).toBe('OpenCode Team Account')
    expect(sources[1]?.metrics[0]).toMatchObject({ kind: 'windowed', label: '5-hour rolling', used: 80 })

    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('should submit sources to global openfox-quota manager without clobbering user assignments', async () => {
    const submittedSources: any[] = []

    const globalQuotaKey = Symbol.for('openfox.quotaManager')
    ;(globalThis as any)[globalQuotaKey] = {
      submitSource: (s: any) => submittedSources.push(s),
      clearPushedSources: vi.fn(),
    }

    const credentials = new MemoryCredentialStore()
    await credentials.create({ apiKey: 'og_user_1', label: 'Personal' })
    await credentials.create({ apiKey: 'og_user_2', label: 'Work' })

    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: any) => {
      const auth = init?.headers?.Authorization || ''
      const percent = auth.includes('og_user_1') ? 10 : 60
      return {
        ok: true,
        json: async () => ({
          usage: {
            rolling: { percent },
          },
        }),
      }
    })

    const provider = new OpenCodeGoQuotaProvider(credentials, {
      fetcher: mockFetch as any,
    })

    await provider.getQuota()

    expect(submittedSources).toHaveLength(2)
    expect(submittedSources[0]?.name).toBe('OpenCode Go (Personal)')
    expect(submittedSources[1]?.name).toBe('OpenCode Go (Work)')
  })

  it('should use cache per account within CACHE_TTL_MS', async () => {
    const credentials = new MemoryCredentialStore()
    await credentials.create({ apiKey: 'og_key' })

    let fetchCount = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      fetchCount++
      return {
        ok: true,
        json: async () => ({
          usage: {
            rolling: { percent: 10 },
          },
        }),
      }
    })

    let currentTime = 1000
    const provider = new OpenCodeGoQuotaProvider(credentials, {
      fetcher: mockFetch as any,
      now: () => currentTime,
    })

    const q1 = await provider.getQuota()
    expect(fetchCount).toBe(1)
    expect((q1.metrics[0] as any).used).toBe(10)

    // Advance 30 seconds (< 60s cache TTL)
    currentTime += 30_000
    const q2 = await provider.getQuota()
    expect(fetchCount).toBe(1)
    expect((q2.metrics[0] as any).used).toBe(10)

    // Advance beyond 60s
    currentTime += 40_000
    const q3 = await provider.getQuota()
    expect(fetchCount).toBe(2)
    expect((q3.metrics[0] as any).used).toBe(10)
  })

  it('should gracefully handle network failure and return default quota metrics', async () => {
    const credentials = new MemoryCredentialStore()
    await credentials.create({ apiKey: 'og_failing_key' })

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline'))

    const provider = new OpenCodeGoQuotaProvider(credentials, {
      fetcher: mockFetch as any,
    })

    const quota = await provider.getQuota()
    expect(quota.metrics).toHaveLength(3)
    expect(quota.metrics[0]?.label).toBe('5-hour rolling')
  })
})
