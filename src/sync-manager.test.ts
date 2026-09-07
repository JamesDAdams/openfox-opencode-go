import { describe, it, expect, vi } from 'vitest'
import { MemoryProviderCredentialStore } from './credentials/credential-store.js'
import { OpenCodeGoAuthAdapter } from './auth/opencode-auth.js'
import { OpenCodeGoTransportAdapter } from './transport/opencode-go.js'
import { OpenCodeGoSyncManager } from './sync-manager.js'

describe('OpenCodeGoSyncManager', () => {
  it('should detect boosts and restorations with notifications', async () => {
    const credentials = new MemoryProviderCredentialStore()
    const credRef = await credentials.create({ apiKey: 'test-key', label: 'OpenCode Go' })

    const auth = new OpenCodeGoAuthAdapter(credentials)

    let currentBoost = 1
    const mockFetcher = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString()
      if (urlStr.includes('/models')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'glm-5.3-flash' },
              { id: 'kimi-k3' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (urlStr.includes('/go')) {
        if (currentBoost > 1) {
          return new Response(
            `<html><body>GLM-5.3-Flash gets ${currentBoost}× usage limits for a limited time</body></html>`,
            { status: 200 },
          )
        }
        return new Response('<html><body>Standard limits</body></html>', { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    }) as any

    const transport = new OpenCodeGoTransportAdapter(auth, { fetcher: mockFetcher })

    const notifications: Array<{ title: string; body: string }> = []
    const syncManager = new OpenCodeGoSyncManager({
      auth,
      credentials,
      transport,
      notify: (notif) => notifications.push(notif),
    })

    // Initial check (does not trigger diff notifications)
    await syncManager.checkModels()
    expect(notifications.length).toBe(0)

    // Apply 2x boost to GLM-5.3-Flash
    currentBoost = 2
    await syncManager.checkModels()

    expect(notifications.length).toBe(1)
    expect(notifications[0].title).toContain('Usage Limit Boost Active')
    expect(notifications[0].body).toContain('GLM-5.3-Flash: boosted to 2x usage limits')

    // Restore to normal
    currentBoost = 1
    await syncManager.checkModels()

    expect(notifications.length).toBe(2)
    expect(notifications[1].title).toContain('Usage Limit Restored')
    expect(notifications[1].body).toContain('GLM-5.3-Flash: usage limit restored to normal')
  })
})
