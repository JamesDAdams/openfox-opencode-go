import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import type { ProviderCredentialStore } from '../credentials/credential-store.js'
import type { OpenCodeGoCredential } from '../types.js'
import type {
  QuotaProvider,
  QuotaSource,
  QuotaMetric,
  PluginRegistry,
} from './contract.js'

const OPENCODE_USAGE_API = 'https://opencode.ai/zen/go/v1/usage'
const CACHE_TTL_MS = 60_000

const GLOBAL_QUOTA_KEY = Symbol.for('openfox.quotaManager')
const PENDING_PROVIDERS_KEY = Symbol.for('openfox.pendingQuotaProviders')

export interface OpenCodeProviderAccount {
  id: string
  name: string
  apiKey?: string
  url?: string
  sourceId: string
  isDefault?: boolean
}

export interface OpenCodeGoQuotaProviderOptions {
  fetcher?: typeof fetch
  now?: () => number
  configDirectory?: string
}

interface CacheEntry {
  metrics: QuotaMetric[]
  name: string
  cachedAt: number
}

export class OpenCodeGoQuotaProvider implements QuotaProvider {
  readonly id = 'opencode-go'
  readonly name = 'OpenCode Go'

  private readonly request: typeof fetch
  private readonly now: () => number
  private readonly configDirectory?: string
  private readonly cache = new Map<string, CacheEntry>()

  constructor(
    private readonly credentials: ProviderCredentialStore,
    options: OpenCodeGoQuotaProviderOptions = {},
  ) {
    this.request = options.fetcher ?? fetch
    this.now = options.now ?? Date.now
    this.configDirectory = options.configDirectory
  }

  /**
   * Discover all OpenCode provider accounts configured in OpenFox
   * (config.json providers, credential store, environment variables).
   */
  async discoverProviders(): Promise<OpenCodeProviderAccount[]> {
    const discovered: OpenCodeProviderAccount[] = []
    const seenKeys = new Set<string>()
    const seenIds = new Set<string>()
    let activeCredRefs: Set<string> | null = null
    let hasConfigProviders = false

    // 1. Scan OpenFox config.json in configDirectory
    if (this.configDirectory) {
      try {
        const configPath = join(this.configDirectory, 'config.json')
        const raw = await readFile(configPath, 'utf8')
        const data = JSON.parse(raw)
        if (Array.isArray(data.providers)) {
          hasConfigProviders = true
          activeCredRefs = new Set()
          for (const p of data.providers) {
            if (!p || typeof p !== 'object') continue
            const backend = String(p.backend || '').toLowerCase()
            const transport = String(p.transport || p.transportAdapter || '').toLowerCase()
            const preset = String(p.preset || '').toLowerCase()
            const authAdapter = String(p.authAdapter || '').toLowerCase()

            const isOpencode =
              preset === 'opencode-go' ||
              preset === 'opencode' ||
              backend === 'opencode-go' ||
              backend === 'opencode' ||
              transport === 'opencode-go-transport' ||
              authAdapter === 'opencode-go-auth'

            if (isOpencode && p.credentialRef) {
              activeCredRefs.add(String(p.credentialRef))
            }
            if (isOpencode && p.apiKey && !p.credentialRef && !seenIds.has(String(p.id))) {
              seenIds.add(String(p.id))
              const key = String(p.apiKey)
              seenKeys.add(key)
              const sourceId = String(p.id).startsWith('opencode') ? String(p.id) : `opencode-${p.id}`
              discovered.push({
                id: String(p.id),
                name: String(p.name || p.id || 'OpenCode Go'),
                apiKey: key,
                url: p.url ? String(p.url) : undefined,
                sourceId,
              })
            }
          }
        }
      } catch {
        // Ignore file read / parse error
      }
    }

    // 2. Scan plugin credential store (only include credentials that belong to active providers, or if no config providers list)
    try {
      if (typeof this.credentials.listReferences === 'function') {
        const references = await this.credentials.listReferences()
        for (const ref of references) {
          if (hasConfigProviders && activeCredRefs && !activeCredRefs.has(ref)) {
            // Credential belongs to a deleted/inactive provider
            continue
          }
          const cred = (await this.credentials.get(ref)) as OpenCodeGoCredential | undefined
          if (cred?.apiKey && !seenKeys.has(cred.apiKey)) {
            seenKeys.add(cred.apiKey)
            const credId = `opencode-cred-${ref}`
            const name = cred.label ? `OpenCode Go (${cred.label})` : `OpenCode Go (${ref})`
            if (!seenIds.has(credId)) {
              seenIds.add(credId)
              discovered.push({
                id: credId,
                name,
                apiKey: cred.apiKey,
                sourceId: credId,
              })
            }
          }
        }
      }
    } catch {
      // Ignore credential read error
    }

    // 3. Scan environment variables
    const envKey = process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY
    if (envKey && !seenKeys.has(envKey)) {
      seenKeys.add(envKey)
      const envId = 'opencode-go-env'
      if (!seenIds.has(envId)) {
        seenIds.add(envId)
        discovered.push({
          id: envId,
          name: 'OpenCode Go (Env)',
          apiKey: envKey,
          sourceId: envId,
        })
      }
    }

    return discovered
  }

  /**
   * Fetch quota metrics for a single provider account.
   */
  async getQuotaForAccount(account: OpenCodeProviderAccount): Promise<QuotaSource> {
    const source: QuotaSource = {
      id: account.sourceId,
      name: account.name,
      metrics: [],
    }

    try {
      const cached = this.cache.get(account.id)
      if (cached && this.now() - cached.cachedAt < CACHE_TTL_MS) {
        return {
          ...source,
          name: cached.name || source.name,
          metrics: cached.metrics,
        }
      }

      let metrics: QuotaMetric[] = []

      // 1. Try direct OpenCode endpoint
      if (account.apiKey) {
        const usageUrl =
          account.url && !account.url.includes('opencode.ai')
            ? `${account.url.replace(/\/+$/, '')}/usage`
            : OPENCODE_USAGE_API

        try {
          const res = await this.request(usageUrl, {
            headers: {
              Authorization: `Bearer ${account.apiKey}`,
              Accept: 'application/json',
              'User-Agent': 'OpenFox',
            },
            signal: AbortSignal.timeout(5000),
          })

          if (res.ok) {
            const data = (await res.json()) as any
            metrics = this.parseUsageResponse(data)
          }
        } catch {
          // Direct endpoint failed
        }
      }

      // 2. If direct endpoint returned no metrics, check OmniRoute fallback
      if (metrics.length === 0) {
        metrics = await this.fetchFromOmniRouteFallback(account)
      }

      // 3. Fallback to default metrics if still empty
      if (metrics.length === 0) {
        metrics = this.getDefaultMetrics()
      }

      this.cache.set(account.id, {
        metrics,
        name: source.name,
        cachedAt: this.now(),
      })

      return { ...source, metrics }
    } catch (error) {
      console.warn(`OpenCode Go quota unavailable (${account.name})`, {
        error: error instanceof Error ? error.message : String(error),
      })
      const cached = this.cache.get(account.id)
      if (cached) {
        return { ...source, name: cached.name, metrics: cached.metrics }
      }
      return {
        ...source,
        metrics: this.getDefaultMetrics(),
      }
    }
  }

  /**
   * Fallback to query OmniRoute proxy if configured in OpenFox.
   */
  private async fetchFromOmniRouteFallback(_account: OpenCodeProviderAccount): Promise<QuotaMetric[]> {
    if (!this.configDirectory) return []

    try {
      let omniBaseUrl: string | undefined
      let omniApiKey: string | undefined

      // A. Check sessions.db for openfox-omniroute-quota settings
      try {
        const dbPath = join(this.configDirectory, 'sessions.db')
        let DatabaseConstructor: any
        try {
          const req = createRequire(import.meta.url)
          DatabaseConstructor = req('better-sqlite3')
        } catch {
          const sqlite = (globalThis as any).betterSqlite3 ?? (await import('better-sqlite3').catch(() => null))
          DatabaseConstructor = sqlite?.default || sqlite
        }

        if (DatabaseConstructor) {
          const db = new DatabaseConstructor(dbPath, { readonly: true })
          const rows = db
            .prepare("SELECT key, value FROM settings WHERE key LIKE '%omniroute%'")
            .all() as Array<{ key: string; value: string }>
          db.close()

          for (const r of rows) {
            if (r.key.includes('apiKey') && !omniApiKey) {
              omniApiKey = r.value.replace(/^"|"$/g, '')
            }
            if (r.key.includes('baseUrl') && !omniBaseUrl) {
              omniBaseUrl = r.value.replace(/^"|"$/g, '')
            }
            if (r.key === 'plugin_settings:openfox-omniroute-quota') {
              try {
                const parsed = JSON.parse(r.value)
                if (parsed?.baseUrl) omniBaseUrl = parsed.baseUrl
                if (parsed?.apiKey) omniApiKey = parsed.apiKey
              } catch {}
            }
          }
        }
      } catch {}

      // B. Check config.json for OmniRoute provider
      if (!omniBaseUrl || !omniApiKey) {
        try {
          const configPath = join(this.configDirectory, 'config.json')
          const raw = await readFile(configPath, 'utf8')
          const data = JSON.parse(raw)
          const omniProvider = data.providers?.find(
            (p: any) =>
              p.url?.toLowerCase().includes('omniroute') ||
              p.name?.toLowerCase().includes('omniroute'),
          )
          if (omniProvider?.url) {
            try {
              omniBaseUrl = new URL(omniProvider.url).origin
            } catch {}
            if (!omniApiKey) omniApiKey = omniProvider.apiKey
          }
        } catch {}
      }

      if (!omniBaseUrl || !omniApiKey) return []

      const url = `${omniBaseUrl.replace(/\/+$/, '')}/api/usage/provider-limits`
      const res = await this.request(url, {
        headers: {
          Authorization: `Bearer ${omniApiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      })

      if (!res.ok) return []

      const data = (await res.json()) as any
      const caches = data?.caches ?? {}

      // Look for OpenCode cache entry
      for (const connData of Object.values(caches) as any[]) {
        if (!connData || typeof connData !== 'object') continue
        const plan = String(connData.plan || '').toLowerCase()
        if (plan.includes('opencode') && connData.quotas) {
          const metrics = this.parseUsageResponse(connData.quotas)
          if (metrics.length > 0) {
            return metrics
          }
        }
      }
    } catch {
      // Ignore fallback errors
    }

    return []
  }

  /**
   * Fetch and aggregate quota sources across all discovered OpenCode provider accounts.
   */
  async getAllQuotaSources(): Promise<QuotaSource[]> {
    const accounts = await this.discoverProviders()
    const sources = await Promise.all(accounts.map((acc) => this.getQuotaForAccount(acc)))
    return sources
  }

  /**
   * Main getQuota method implementing QuotaProvider contract.
   * Submits all discovered sources to openfox-quota manager and returns primary source.
   */
  async getQuota(): Promise<QuotaSource> {
    const accounts = await this.discoverProviders()
    if (accounts.length === 0) {
      this.submitSourcesToGlobalManager(accounts, [])
      return { id: this.id, name: this.name, metrics: [] }
    }
    const sources = await Promise.all(accounts.map((acc) => this.getQuotaForAccount(acc)))

    // Submit all sources in openfox-quota
    this.submitSourcesToGlobalManager(accounts, sources)

    const firstWithMetrics = sources.find((s) => s.metrics && s.metrics.length > 0)
    if (firstWithMetrics) {
      return firstWithMetrics
    }
    return sources[0] ?? { id: this.id, name: this.name, metrics: [] }
  }

  /**
   * Synchronize quota sources with openfox-quota plugin.
   */
  async syncQuota(registry?: PluginRegistry): Promise<{ success: boolean; sources: QuotaSource[] }> {
    this.cache.clear()
    const accounts = await this.discoverProviders()
    const sources = accounts.length > 0
      ? await Promise.all(accounts.map((acc) => this.getQuotaForAccount(acc)))
      : []

    this.submitSourcesToGlobalManager(accounts, sources)

    if (registry && typeof registry.registerQuotaProvider === 'function') {
      await this.registerProviders(registry)
    }

    return { success: true, sources }
  }

  /**
   * Register with openfox-quota (via pending list, global manager, registry).
   */
  async registerProviders(registry?: PluginRegistry): Promise<void> {
    // 1. Put in pending list so openfox-quota picks it up whenever it loads
    const pending = ((globalThis as any)[PENDING_PROVIDERS_KEY] ??= [])
    if (!pending.some((p: any) => p && p.id === this.id)) {
      pending.push(this)
    }

    // 2. Register with openfox-quota via global quota manager if present
    const globalMgr = (globalThis as any)[GLOBAL_QUOTA_KEY]
    if (globalMgr && typeof globalMgr.registerProvider === 'function') {
      globalMgr.registerProvider(this)
    }

    // 3. Register via registry.registerQuotaProvider if present
    if (registry && typeof registry.registerQuotaProvider === 'function') {
      registry.registerQuotaProvider(this)
    }

    // 4. Eagerly sync quota sources with openfox-quota
    void this.getQuota().catch(() => {})
  }

  private submitSourcesToGlobalManager(
    accounts: OpenCodeProviderAccount[],
    sources: QuotaSource[],
  ): void {
    const globalMgr = (globalThis as any)[GLOBAL_QUOTA_KEY]
    if (!globalMgr) return

    if (typeof globalMgr.clearPushedSources === 'function') {
      globalMgr.clearPushedSources((id: string) => id.startsWith('opencode'))
    } else if (globalMgr.pushedSources instanceof Map) {
      for (const key of Array.from(globalMgr.pushedSources.keys())) {
        if (typeof key === 'string' && key.startsWith('opencode')) {
          globalMgr.pushedSources.delete(key)
        }
      }
    }

    if (accounts.length > 1) {
      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i]
        const src = sources[i]
        if (!acc || !src) continue
        if (src.id === this.id) continue

        if (typeof globalMgr.submitSource === 'function') {
          globalMgr.submitSource(src)
        }
      }
    }
  }

  private parseUsageResponse(data: any): QuotaMetric[] {
    const metrics: QuotaMetric[] = []
    if (!data || typeof data !== 'object') return metrics

    const container = data.quotas || data.usage || data.quota_snapshots || data
    if (!container || typeof container !== 'object') return metrics

    for (const [key, raw] of Object.entries(container as Record<string, any>)) {
      if (!raw || typeof raw !== 'object') continue
      if (raw.unlimited) continue

      const label =
        raw.displayName ||
        raw.label ||
        (key === 'rolling' || key === 'session' || key === '5-hour rolling'
          ? '5-hour rolling'
          : key === 'mcp_monthly' || key === 'monthly'
            ? 'Monthly'
            : key === 'weekly'
              ? 'Weekly'
              : key.charAt(0).toUpperCase() + key.slice(1))

      const total =
        typeof raw.total === 'number'
          ? raw.total
          : typeof raw.limit === 'number'
            ? raw.limit
            : typeof raw.quotaTotal === 'number'
              ? raw.quotaTotal
              : typeof raw.entitlement === 'number'
                ? raw.entitlement
                : undefined

      const used =
        typeof raw.used === 'number'
          ? raw.used
          : typeof raw.quotaUsed === 'number'
            ? raw.quotaUsed
            : typeof raw.consumed === 'number'
              ? raw.consumed
              : total !== undefined && typeof raw.remaining === 'number'
                ? Math.max(0, total - raw.remaining)
                : typeof raw.percent === 'number' && total !== undefined
                  ? Math.round((raw.percent / 100) * total)
                  : typeof raw.percent === 'number'
                    ? raw.percent
                    : raw.status === 'rate-limited'
                      ? total ?? 100
                      : 0

      const limit = total !== undefined ? total : 100

      const resetsAt =
        raw.resetAt ||
        raw.resetsAt ||
        raw.reset_at ||
        raw.resets_at ||
        data.quota_reset_date_utc ||
        data.resets_at

      let window: 'hour' | 'week' | 'month' = 'hour'
      const lowerKey = (key + ' ' + (raw.window || '') + ' ' + (raw.period || '')).toLowerCase()
      if (lowerKey.includes('month')) {
        window = 'month'
      } else if (lowerKey.includes('week')) {
        window = 'week'
      } else {
        window = 'hour'
      }

      metrics.push({
        kind: 'windowed',
        label,
        used,
        limit,
        window,
        ...(resetsAt ? { resetsAt: String(resetsAt) } : {}),
      })
    }

    const windowOrder: Record<string, number> = { hour: 1, week: 2, month: 3 }
    metrics.sort((a, b) => {
      const wA = a.kind === 'windowed' ? a.window : ''
      const wB = b.kind === 'windowed' ? b.window : ''
      return (windowOrder[wA] || 9) - (windowOrder[wB] || 9)
    })

    return metrics
  }

  private getDefaultMetrics(): QuotaMetric[] {
    return [
      {
        kind: 'windowed',
        label: '5-hour rolling',
        used: 0,
        limit: 100,
        window: 'hour',
      },
      {
        kind: 'windowed',
        label: 'Weekly',
        used: 0,
        limit: 100,
        window: 'week',
      },
      {
        kind: 'windowed',
        label: 'Monthly',
        used: 0,
        limit: 100,
        window: 'month',
      },
    ]
  }
}
