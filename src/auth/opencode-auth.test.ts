import { describe, it, expect, vi } from 'vitest'
import { MemoryProviderCredentialStore } from '../credentials/credential-store.js'
import { OpenCodeGoAuthAdapter } from './opencode-auth.js'

describe('OpenCodeGoAuthAdapter', () => {
  it('should authenticate and store credentials', async () => {
    const credentials = new MemoryProviderCredentialStore()
    const mockFetcher = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as any

    const auth = new OpenCodeGoAuthAdapter(credentials, { fetcher: mockFetcher })

    const { challenge } = await auth.beginLogin({ providerId: 'opencode-go' })
    expect(challenge.verificationUrl).toBe('https://opencode.ai/auth')

    const credentialRef = await auth.saveApiKey('valid-go-key-123')
    expect(credentialRef).toBeDefined()

    const status = await auth.getStatus({ providerId: 'opencode-go', credentialRef })
    expect(status.state).toBe('connected')

    const access = await auth.getAccessContext(credentialRef)
    expect(access.accessToken).toBe('valid-go-key-123')
    expect(access.headers?.Authorization).toBe('Bearer valid-go-key-123')
  })
})
