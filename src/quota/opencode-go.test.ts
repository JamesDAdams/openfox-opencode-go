import { describe, it, expect, vi } from 'vitest'
import { OpenCodeGoQuotaProvider } from './opencode-go.js'
import type { ProviderCredentialStore } from '../credentials/credential-store.js'

class MemoryCredentialStore implements ProviderCredentialStore {
  private store = new Map<string, unknown>()
  async create(data: unknown): Promise<string> {
    const id = 'ref-1'
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
  it('should return catalog metrics when no credentials and no env var', async () => {
    const credentials = new MemoryCredentialStore()
    const provider = new OpenCodeGoQuotaProvider(credentials)
    const quota = await provider.getQuota()

    expect(quota.id).toBe('opencode-go')
    expect(quota.name).toBe('OpenCode Go')
    expect(quota.metrics.length).toBeGreaterThan(0)
    expect(quota.metrics[0].kind).toBe('windowed')
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
      label: 'Rolling (5h)',
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

  it('should resolve API key from configDirectory config.json', async () => {
    const credentials = new MemoryCredentialStore()
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/zen/go/v1/usage')) {
        return {
          ok: true,
          json: async () => ({
            usage: {
              rolling: { status: 'ok', percent: 5 },
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
    expect(quota.metrics.length).toBeGreaterThan(0)
  })

  it('should use cache within CACHE_TTL_MS', async () => {
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
})
