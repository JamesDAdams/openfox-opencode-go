import type {
  ProviderAccessContext,
  ProviderAuthAdapter,
  ProviderAuthStatus,
  ProviderLoginChallenge,
} from 'openfox/provider'
import type { ProviderCredentialStore } from '../credentials/credential-store.js'
import type { OpenCodeGoCredential } from '../types.js'

export interface OpenCodeGoAuthOptions {
  fetcher?: typeof fetch
}

export class OpenCodeGoAuthAdapter implements ProviderAuthAdapter {
  readonly id = 'opencode-go-auth'
  private readonly request: typeof fetch

  constructor(
    private readonly credentials: ProviderCredentialStore,
    options: OpenCodeGoAuthOptions = {},
  ) {
    this.request = options.fetcher ?? fetch
  }

  async beginLogin(_context: { providerId: string }): Promise<{
    challenge: ProviderLoginChallenge
    completion: Promise<{ credentialRef: string }>
  }> {
    const challenge: ProviderLoginChallenge = {
      mode: 'external',
      verificationUrl: 'https://opencode.ai/auth',
      instructions: 'Please obtain your API key from https://opencode.ai/auth and configure it in OpenFox.',
    }

    const completion = new Promise<{ credentialRef: string }>(() => {})

    return { challenge, completion }
  }

  async saveApiKey(apiKey: string, label = 'OpenCode Go'): Promise<string> {
    const trimmed = apiKey.trim()
    if (!trimmed) throw new Error('API key is required')

    const isValid = await this.validateApiKey(trimmed)
    if (!isValid) throw new Error('Invalid OpenCode Go API key')

    return this.credentials.create({
      apiKey: trimmed,
      label,
    } satisfies OpenCodeGoCredential)
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const res = await this.request('https://opencode.ai/zen/go/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'OpenFox',
        },
      })
      return res.ok
    } catch {
      return false
    }
  }

  async getStatus(context: { providerId: string; credentialRef?: string }): Promise<ProviderAuthStatus> {
    if (!context.credentialRef) return { state: 'disconnected' }

    const raw = (await this.credentials.get(context.credentialRef)) as OpenCodeGoCredential | undefined
    if (!raw?.apiKey) return { state: 'disconnected' }

    return { state: 'connected', accountLabel: raw.label || 'OpenCode Go' }
  }

  async getAccessContext(credentialRef: string): Promise<ProviderAccessContext> {
    const credential = (await this.credentials.get(credentialRef)) as OpenCodeGoCredential | undefined
    if (!credential?.apiKey) throw new Error('OpenCode Go credentials not found')

    return {
      accessToken: credential.apiKey,
      headers: {
        Authorization: `Bearer ${credential.apiKey}`,
        'User-Agent': 'OpenFox',
        'x-opencode-session': 'openfox',
      },
    }
  }

  async logout(credentialRef: string): Promise<void> {
    await this.credentials.delete(credentialRef)
  }
}
