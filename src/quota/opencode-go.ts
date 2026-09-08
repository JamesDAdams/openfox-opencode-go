import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProviderCredentialStore } from '../credentials/credential-store.js'
import type { OpenCodeGoCredential } from '../types.js'
import type { QuotaProvider, QuotaSource, QuotaMetric } from './contract.js'
import { OPENCODE_GO_MODELS, fetchLiveBoosts } from '../models.js'

const OPENCODE_USAGE_API = 'https://opencode.ai/zen/go/v1/usage'
const CACHE_TTL_MS = 60_000

export interface OpenCodeGoQuotaProviderOptions {
  fetcher?: typeof fetch
  now?: () => number
  configDirectory?: string
}

export class OpenCodeGoQuotaProvider implements QuotaProvider {
  readonly id = 'opencode-go'
  readonly name = 'OpenCode Go'

  private readonly request: typeof fetch
  private readonly now: () => number
  private readonly configDirectory?: string
  private cachedMetrics: QuotaMetric[] | null = null
  private cachedName: string | null = null
  private cachedAt = 0

  constructor(
    private readonly credentials: ProviderCredentialStore,
    options: OpenCodeGoQuotaProviderOptions = {},
  ) {
    this.request = options.fetcher ?? fetch
    this.now = options.now ?? Date.now
    this.configDirectory = options.configDirectory
  }

  private async resolveCredentials(): Promise<{ apiKey?: string; label?: string }> {
    // 1. Check plugin credential store
    try {
      const references = await this.credentials.listReferences()
      for (const ref of references) {
        const cred = (await this.credentials.get(ref)) as OpenCodeGoCredential | undefined
        if (cred?.apiKey) {
          return { apiKey: cred.apiKey, label: cred.label }
        }
      }
    } catch {}

    // 2. Check OpenFox config.json in configDirectory
    if (this.configDirectory) {
      try {
        const configPath = join(this.configDirectory, 'config.json')
        const raw = await readFile(configPath, 'utf8')
        const data = JSON.parse(raw)
        const provider = data.providers?.find(
          (p: any) => p.backend === 'opencode-go' || p.id === 'opencode-go' || p.name?.toLowerCase().includes('opencode go'),
        )
        if (provider?.apiKey) {
          return { apiKey: provider.apiKey, label: provider.name }
        }
      } catch {}
    }

    // 3. Check environment variables
    const envKey = process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY
    if (envKey) {
      return { apiKey: envKey }
    }

    return {}
  }

  async getQuota(): Promise<QuotaSource> {
    const source: QuotaSource = {
      id: this.id,
      name: this.name,
      metrics: [],
    }

    try {
      if (this.cachedMetrics && this.now() - this.cachedAt < CACHE_TTL_MS) {
        return { ...source, name: this.cachedName ?? source.name, metrics: this.cachedMetrics }
      }

      const { apiKey, label } = await this.resolveCredentials()

      if (!apiKey) {
        // Return catalog model quotas when unauthenticated
        const metrics = await this.generateCatalogMetrics()
        this.cachedMetrics = metrics
        this.cachedName = source.name
        this.cachedAt = this.now()
        return { ...source, metrics }
      }

      const accountName = label && label !== 'OpenCode Go' ? `OpenCode Go (${label})` : 'OpenCode Go'
      source.name = accountName

      let metrics: QuotaMetric[] = []
      try {
        const res = await this.request(OPENCODE_USAGE_API, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
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
        // Network or endpoint error, fallback to catalog
      }

      if (metrics.length === 0) {
        metrics = await this.generateCatalogMetrics()
      }

      this.cachedMetrics = metrics
      this.cachedName = source.name
      this.cachedAt = this.now()

      return { ...source, metrics }
    } catch (error) {
      console.warn('OpenCode Go quota unavailable', {
        error: error instanceof Error ? error.message : String(error),
      })
      if (this.cachedMetrics) return { ...source, name: this.cachedName ?? source.name, metrics: this.cachedMetrics }
      return {
        ...source,
        metrics: [{ kind: 'token-balance', label: 'Quota unavailable', total: 0, remaining: 0 }],
      }
    }
  }

  private parseUsageResponse(data: any): QuotaMetric[] {
    const metrics: QuotaMetric[] = []
    if (!data || typeof data !== 'object') return metrics

    const usage = data.usage || data

    // Rolling window (Session 5h)
    if (usage.rolling && typeof usage.rolling === 'object') {
      const r = usage.rolling
      const pct = typeof r.percent === 'number' ? r.percent : (r.status === 'rate-limited' ? 100 : 0)
      metrics.push({
        kind: 'windowed',
        label: 'Rolling (5h)',
        used: pct,
        limit: 100,
        window: 'hour',
        ...(r.resetsAt ? { resetsAt: r.resetsAt } : {}),
      })
    }

    // Weekly window
    if (usage.weekly && typeof usage.weekly === 'object') {
      const w = usage.weekly
      const pct = typeof w.percent === 'number' ? w.percent : (w.status === 'rate-limited' ? 100 : 0)
      metrics.push({
        kind: 'windowed',
        label: 'Weekly',
        used: pct,
        limit: 100,
        window: 'week',
        ...(w.resetsAt ? { resetsAt: w.resetsAt } : {}),
      })
    }

    // Monthly window
    if (usage.monthly && typeof usage.monthly === 'object') {
      const m = usage.monthly
      const pct = typeof m.percent === 'number' ? m.percent : (m.status === 'rate-limited' ? 100 : 0)
      metrics.push({
        kind: 'windowed',
        label: 'Monthly',
        used: pct,
        limit: 100,
        window: 'month',
        ...(m.resetsAt ? { resetsAt: m.resetsAt } : {}),
      })
    }

    // Fallback: snapshots support if custom shape returned
    if (metrics.length === 0 && data.quota_snapshots && typeof data.quota_snapshots === 'object') {
      const resetsAt = data.quota_reset_date_utc || data.resets_at
      for (const [key, snapshot] of Object.entries(data.quota_snapshots as Record<string, any>)) {
        if (snapshot.unlimited) continue
        const limit = Math.round(snapshot.entitlement ?? snapshot.limit ?? 100)
        const remaining = Math.round(snapshot.remaining ?? snapshot.quota_remaining ?? 0)
        const used = Math.max(0, limit - remaining)
        metrics.push({
          kind: 'windowed',
          label: snapshot.label ?? key,
          used,
          limit,
          window: snapshot.window ?? 'hour',
          ...(resetsAt ? { resetsAt } : {}),
        })
      }
    }

    return metrics
  }

  private async generateCatalogMetrics(): Promise<QuotaMetric[]> {
    const boosts = await fetchLiveBoosts(this.request).catch(() => new Map<string, number>())
    const metrics: QuotaMetric[] = []

    for (const model of OPENCODE_GO_MODELS) {
      const multiplier = boosts.get(model.id) ?? 1
      const effectiveLimit = Math.round(model.baseRequestsPer5h * multiplier)
      const label = model.name + (multiplier > 1 ? ` (${multiplier}x Boost)` : '')

      metrics.push({
        kind: 'windowed',
        label,
        model: model.name,
        used: 0,
        limit: effectiveLimit,
        window: 'hour',
      })
    }

    return metrics
  }
}
