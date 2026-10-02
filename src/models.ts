import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ModelConfig } from 'openfox/provider'

export interface OpenCodeGoModelMeta {
  id: string
  name: string
  contextWindow: number
  endpoint: '/chat/completions' | '/messages' | '/responses'
  baseRequestsPer5h: number
  supportsVision?: boolean
  reasoningEfforts?: string[]
}

export interface ModelQuotaInfo {
  modelId: string
  name: string
  baseQuota: number
  multiplier: number
  effectiveQuota: number
  isBoosted: boolean
}

export interface ModelsCacheData {
  models: OpenCodeGoModelMeta[]
  boosts?: Record<string, number>
  updatedAt: number
}

export class ModelsCacheStore {
  constructor(private readonly cachePath?: string) {}

  getCachePath(): string | undefined {
    return this.cachePath
  }

  async load(): Promise<ModelsCacheData | null> {
    if (!this.cachePath) return null
    try {
      const raw = await readFile(this.cachePath, 'utf8')
      const data = JSON.parse(raw) as ModelsCacheData
      if (Array.isArray(data.models)) {
        return data
      }
    } catch {}
    return null
  }

  async save(data: ModelsCacheData): Promise<void> {
    if (!this.cachePath) return
    try {
      await mkdir(dirname(this.cachePath), { recursive: true })
      await writeFile(this.cachePath, JSON.stringify(data, null, 2), 'utf8')
    } catch {}
  }
}

// Fallback seed catalog for initial bootstrap when offline with empty cache
export const OPENCODE_GO_MODELS: OpenCodeGoModelMeta[] = [
  { id: 'muse-spark-1.3-contributor', name: 'Muse Spark 1.3 Contributor', contextWindow: 128000, endpoint: '/responses', baseRequestsPer5h: 45300, supportsVision: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'muse-spark-1.2-contributor', name: 'Muse Spark 1.2 Contributor', contextWindow: 128000, endpoint: '/responses', baseRequestsPer5h: 45300, supportsVision: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'mimo-v2.5', name: 'MiMo-V2.5', contextWindow: 1000000, endpoint: '/chat/completions', baseRequestsPer5h: 30100, supportsVision: true },
  { id: 'omen-alpha', name: 'Omen Alpha', contextWindow: 128000, endpoint: '/chat/completions', baseRequestsPer5h: 11600, supportsVision: true, reasoningEfforts: ['low', 'high', 'max'] },
  { id: 'longcat-2.0', name: 'LongCat-2.0', contextWindow: 1000000, endpoint: '/chat/completions', baseRequestsPer5h: 11400 },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 1000000, endpoint: '/chat/completions', baseRequestsPer5h: 7600, reasoningEfforts: ['low', 'high', 'max'] },
  { id: 'qwen3.8-flash', name: 'Qwen3.8 Flash', contextWindow: 1000000, endpoint: '/messages', baseRequestsPer5h: 5400, supportsVision: true, reasoningEfforts: ['low', 'medium', 'xhigh'] },
  { id: 'qwen3.7-plus', name: 'Qwen3.7 Plus', contextWindow: 1000000, endpoint: '/messages', baseRequestsPer5h: 4300, supportsVision: true },
  { id: 'hy3', name: 'Hy3', contextWindow: 1000000, endpoint: '/chat/completions', baseRequestsPer5h: 4300, reasoningEfforts: ['low', 'high', 'max'] },
  { id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision Exp', contextWindow: 1000000, endpoint: '/chat/completions', baseRequestsPer5h: 3800, supportsVision: true, reasoningEfforts: ['low', 'high', 'max'] },
  { id: 'minimax-m2.7', name: 'MiniMax M2.7', contextWindow: 1000000, endpoint: '/messages', baseRequestsPer5h: 3400 },
  { id: 'minimax-m2.5', name: 'MiniMax M2.5', contextWindow: 1000000, endpoint: '/messages', baseRequestsPer5h: 3400 },
  { id: 'qwen3.6-plus', name: 'Qwen3.6 Plus', contextWindow: 1000000, endpoint: '/messages', baseRequestsPer5h: 3300, supportsVision: true },
  { id: 'mimo-v2.5-pro', name: 'MiMo-V2.5-Pro', contextWindow: 1000000, endpoint: '/chat/completions', baseRequestsPer5h: 3250, supportsVision: true },
  { id: 'minimax-m3', name: 'MiniMax M3', contextWindow: 1000000, endpoint: '/messages', baseRequestsPer5h: 3200 },
  { id: 'gpt-5.6-luna', name: 'GPT 5.6 Luna', contextWindow: 1000000, endpoint: '/responses', baseRequestsPer5h: 2050, supportsVision: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', contextWindow: 1000000, endpoint: '/chat/completions', baseRequestsPer5h: 1580, supportsVision: true, reasoningEfforts: ['low', 'high', 'max'] },
  { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', contextWindow: 256000, endpoint: '/chat/completions', baseRequestsPer5h: 1350, supportsVision: true },
  { id: 'hy4-preview', name: 'Hy4 preview', contextWindow: 1000000, endpoint: '/chat/completions', baseRequestsPer5h: 1350, reasoningEfforts: ['low', 'high', 'max'] },
  { id: 'kimi-k2.6', name: 'Kimi K2.6', contextWindow: 256000, endpoint: '/chat/completions', baseRequestsPer5h: 1150, supportsVision: true },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextWindow: 1000000, endpoint: '/chat/completions', baseRequestsPer5h: 1050, reasoningEfforts: ['low', 'high', 'max'] },
  { id: 'glm-5.2', name: 'GLM-5.2', contextWindow: 1000000, endpoint: '/chat/completions', baseRequestsPer5h: 880, reasoningEfforts: ['low', 'high', 'max'] },
  { id: 'glm-5.1', name: 'GLM-5.1', contextWindow: 1000000, endpoint: '/chat/completions', baseRequestsPer5h: 880 },
  { id: 'glm-5.3', name: 'GLM-5.3', contextWindow: 1000000, endpoint: '/chat/completions', baseRequestsPer5h: 220, reasoningEfforts: ['low', 'high', 'max'] },
  { id: 'qwen3.7-max', name: 'Qwen3.7 Max', contextWindow: 1000000, endpoint: '/messages', baseRequestsPer5h: 170 },
  { id: 'grok-4.6', name: 'Grok 4.6', contextWindow: 2000000, endpoint: '/responses', baseRequestsPer5h: 169, supportsVision: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'qwen3.8-max', name: 'Qwen3.8 Max', contextWindow: 1000000, endpoint: '/messages', baseRequestsPer5h: 160, supportsVision: true, reasoningEfforts: ['low', 'medium', 'xhigh'] },
  { id: 'kimi-k3', name: 'Kimi K3', contextWindow: 1000000, endpoint: '/chat/completions', baseRequestsPer5h: 110, supportsVision: true, reasoningEfforts: ['low', 'high', 'max'] },
]

export const OPENCODE_GO_MODELS_MAP = new Map<string, OpenCodeGoModelMeta>(
  OPENCODE_GO_MODELS.map((m) => [m.id, m]),
)

export function formatModelName(id: string): string {
  const specialNames: Record<string, string> = {
    'glm-5.3-flash': 'GLM-5.3-Flash',
    'glm-5.3': 'GLM-5.3',
    'glm-5.2': 'GLM-5.2',
    'glm-5.1': 'GLM-5.1',
    'glm-5': 'GLM-5',
    'mimo-v2.5': 'MiMo-V2.5',
    'mimo-v2.5-pro': 'MiMo-V2.5-Pro',
    'mimo-v2.6-flash': 'MiMo-V2.6-Flash',
    'mimo-v2.6-pro': 'MiMo-V2.6-Pro',
    'mimo-v2-pro': 'MiMo-V2-Pro',
    'mimo-v2-omni': 'MiMo-V2-Omni',
    'gpt-5.6-luna': 'GPT 5.6 Luna',
    'gpt-6-luna': 'GPT 6 Luna',
    'deepseek-v4-flash': 'DeepSeek V4 Flash',
    'deepseek-v4.1-flash': 'DeepSeek V4.1 Flash',
    'deepseek-v4-pro': 'DeepSeek V4 Pro',
    'deepseek-flash': 'DeepSeek Flash',
    'deepseek-v4-flash-vision-exp': 'DeepSeek V4 Flash Vision Exp',
    'qwen3.8-flash': 'Qwen3.8 Flash',
    'qwen3.8-max': 'Qwen3.8 Max',
    'qwen3.7-plus': 'Qwen3.7 Plus',
    'qwen3.7-max': 'Qwen3.7 Max',
    'qwen3.6-plus': 'Qwen3.6 Plus',
    'qwen3.5-plus': 'Qwen3.5 Plus',
    'kimi-k3': 'Kimi K3',
    'kimi-k2.7-code': 'Kimi K2.7 Code',
    'kimi-k2.6': 'Kimi K2.6',
    'kimi-k2.5': 'Kimi K2.5',
    'longcat-2.0': 'LongCat-2.0',
    'longcat-2.5-preview-free': 'LongCat 2.5 Preview Free',
    'space-bunny-free': 'Space Bunny Free',
    'muse-spark-1.3-contributor': 'Muse Spark 1.3 Contributor',
    'muse-spark-1.2-contributor': 'Muse Spark 1.2 Contributor',
    'omen-alpha': 'Omen Alpha',
    'grok-4.6': 'Grok 4.6',
    'grok-4.5': 'Grok 4.5',
    'grok-4.7': 'Grok 4.7',
    'hy4-preview': 'Hy4 preview',
    'hy3': 'Hy3',
    'hy3-preview': 'Hy3-preview',
    'minimax-m3': 'MiniMax M3',
    'minimax-m2.7': 'MiniMax M2.7',
    'minimax-m2.5': 'MiniMax M2.5',
  }

  if (specialNames[id]) return specialNames[id]

  return id
    .split('-')
    .map((part) => {
      if (/^v?\d+(\.\d+)*$/i.test(part)) return part
      const lower = part.toLowerCase()
      if (lower === 'gpt') return 'GPT'
      if (lower === 'glm') return 'GLM'
      if (lower === 'deepseek') return 'DeepSeek'
      if (lower === 'minimax') return 'MiniMax'
      if (lower === 'mimo') return 'MiMo'
      if (lower === 'qwen') return 'Qwen'
      if (lower === 'kimi') return 'Kimi'
      if (lower === 'longcat') return 'LongCat'
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

export function inferEndpoint(id: string): '/chat/completions' | '/messages' | '/responses' {
  const known = OPENCODE_GO_MODELS_MAP.get(id)
  if (known) return known.endpoint

  const lower = id.toLowerCase()
  if (lower.startsWith('grok') || lower.startsWith('muse') || lower.startsWith('gpt-')) {
    return '/responses'
  }
  if (lower.startsWith('qwen') || lower.startsWith('minimax')) {
    return '/messages'
  }
  return '/chat/completions'
}

export function inferContextWindow(id: string): number {
  const known = OPENCODE_GO_MODELS_MAP.get(id)
  if (known) return known.contextWindow

  const lower = id.toLowerCase()
  if (lower.includes('2000') || lower.includes('2m') || lower.startsWith('grok')) {
    return 2_000_000
  }
  if (lower.startsWith('muse') || lower.startsWith('omen')) {
    return 128_000
  }
  if (lower.startsWith('kimi-k2')) {
    return 256_000
  }
  return 1_000_000
}

export function inferReasoningEfforts(id: string): string[] | undefined {
  const known = OPENCODE_GO_MODELS_MAP.get(id)
  if (known?.reasoningEfforts) return known.reasoningEfforts

  const lower = id.toLowerCase()
  if (lower.includes('spark') || lower.includes('luna') || lower.includes('grok')) {
    return ['low', 'medium', 'high', 'xhigh']
  }
  if (
    lower.includes('flash') ||
    lower.includes('pro') ||
    lower.includes('alpha') ||
    lower.includes('hy3') ||
    lower.includes('hy4') ||
    lower.includes('kimi-k3')
  ) {
    return ['low', 'high', 'max']
  }
  return undefined
}

export function parseModelsFromHtml(html: string): Map<string, { name: string; baseRequestsPer5h: number }> {
  const models = new Map<string, { name: string; baseRequestsPer5h: number }>()
  if (!html) return models

  const trMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) || []
  for (const tr of trMatches) {
    const nameMatch = /<bdi>([^<]+)<\/bdi>/i.exec(tr) || /<th[^>]*>([^<]+)<\/th>/i.exec(tr)
    if (!nameMatch) continue
    const name = nameMatch[1]?.trim()
    if (!name || name.toLowerCase() === 'model') continue

    const numMatch = /<td[^>]*data-slot="number"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/i.exec(tr)
    let baseRequestsPer5h = 5000
    if (numMatch && numMatch[1]) {
      const quotaStr = numMatch[1].trim()
      if (quotaStr === '∞' || quotaStr.toLowerCase() === 'infinity') {
        baseRequestsPer5h = 100_000
      } else {
        const num = parseFloat(quotaStr.replace(/,/g, ''))
        if (!isNaN(num) && num > 0) {
          baseRequestsPer5h = Math.round(num)
        }
      }
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '')
    models.set(slug, { name, baseRequestsPer5h })
  }

  return models
}

export function parseBoostsFromHtml(html: string): Map<string, number> {
  const boosts = new Map<string, number>()
  if (!html) return boosts

  const regex = /([A-Za-z0-9.-]+)\s+(?:gets|has)\s+([0-9.]+)[x×]\s+usage/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    const rawName = match[1]?.toLowerCase().replace(/\s+/g, '-')
    const multiplier = parseFloat(match[2] ?? '')
    if (rawName && !isNaN(multiplier) && multiplier > 0) {
      boosts.set(rawName, multiplier)
    }
  }

  const inlineRegex = /([A-Za-z0-9.-]+)\s*([0-9.]+)[x×]\s*usage/gi
  while ((match = inlineRegex.exec(html)) !== null) {
    const rawName = match[1]?.toLowerCase().replace(/\s+/g, '-')
    const multiplier = parseFloat(match[2] ?? '')
    if (rawName && !isNaN(multiplier) && multiplier > 0) {
      boosts.set(rawName, multiplier)
    }
  }

  return boosts
}

export async function fetchLiveBoosts(fetcher: typeof fetch = fetch): Promise<Map<string, number>> {
  try {
    const res = await fetcher('https://opencode.ai/go', {
      headers: { 'User-Agent': 'OpenFox' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return new Map()
    const text = await res.text()
    return parseBoostsFromHtml(text)
  } catch {
    return new Map()
  }
}

export async function fetchLiveModelsAndBoosts(
  fetcher: typeof fetch = fetch,
  options: { apiKey?: string; cacheStore?: ModelsCacheStore } = {},
): Promise<{ models: OpenCodeGoModelMeta[]; boosts: Map<string, number> }> {
  let remoteModelIds: string[] = []
  let htmlTableModels = new Map<string, { name: string; baseRequestsPer5h: number }>()
  let boosts = new Map<string, number>()

  // 1. Fetch /models API
  try {
    const headers: Record<string, string> = { 'User-Agent': 'OpenFox' }
    if (options.apiKey) {
      headers['Authorization'] = `Bearer ${options.apiKey}`
    }
    const res = await fetcher('https://opencode.ai/zen/go/v1/models', {
      headers,
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const json = (await res.json()) as { data?: Array<{ id: string }> } | Array<{ id: string }>
      const list = Array.isArray(json) ? json : json.data
      if (Array.isArray(list)) {
        remoteModelIds = list.map((m) => m.id).filter(Boolean)
      }
    }
  } catch {}

  // 2. Fetch marketing page for live limits & boosts
  try {
    const res = await fetcher('https://opencode.ai/go', {
      headers: { 'User-Agent': 'OpenFox' },
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const html = await res.text()
      htmlTableModels = parseModelsFromHtml(html)
      boosts = parseBoostsFromHtml(html)
    }
  } catch {}

  // 3. If API and HTML both failed or returned empty, try loading from disk cache
  if (remoteModelIds.length === 0 && htmlTableModels.size === 0) {
    if (options.cacheStore) {
      const cached = await options.cacheStore.load()
      if (cached?.models && cached.models.length > 0) {
        const cachedBoosts = new Map<string, number>()
        if (cached.boosts) {
          for (const [k, v] of Object.entries(cached.boosts)) {
            cachedBoosts.set(k, v)
          }
        }
        return { models: cached.models, boosts: cachedBoosts }
      }
    }
    return { models: [], boosts: new Map() }
  }

  // 4. Merge all discovered model IDs
  const allIds = new Set<string>([...remoteModelIds, ...htmlTableModels.keys()])

  const modelMetas: OpenCodeGoModelMeta[] = []
  for (const id of allIds) {
    const tableInfo = htmlTableModels.get(id)
    const knownMeta = OPENCODE_GO_MODELS_MAP.get(id)
    const name = tableInfo?.name || knownMeta?.name || formatModelName(id)
    const baseQuota =
      tableInfo?.baseRequestsPer5h ??
      knownMeta?.baseRequestsPer5h ??
      (id.includes('free') ? 100_000 : 3_000)

    modelMetas.push({
      id,
      name,
      contextWindow: knownMeta?.contextWindow ?? inferContextWindow(id),
      endpoint: knownMeta?.endpoint ?? inferEndpoint(id),
      baseRequestsPer5h: baseQuota,
      supportsVision: knownMeta?.supportsVision ?? true,
      reasoningEfforts: knownMeta?.reasoningEfforts ?? inferReasoningEfforts(id),
    })
  }

  // 5. Save to cache
  if (options.cacheStore && modelMetas.length > 0) {
    const boostsObj: Record<string, number> = {}
    for (const [k, v] of boosts.entries()) {
      boostsObj[k] = v
    }
    await options.cacheStore.save({
      models: modelMetas,
      boosts: boostsObj,
      updatedAt: Date.now(),
    })
  }

  return { models: modelMetas, boosts }
}

export function buildGoModelsList(
  modelsOrAvailableIds?: OpenCodeGoModelMeta[] | Set<string>,
  availableIdsOrBoosts?: Set<string> | Map<string, number>,
  boostsOrModels?: Map<string, number> | OpenCodeGoModelMeta[],
): ModelConfig[] {
  let models: OpenCodeGoModelMeta[]
  let availableModelIds: Set<string> | undefined
  let boosts = new Map<string, number>()

  if (Array.isArray(modelsOrAvailableIds)) {
    models = modelsOrAvailableIds
    if (availableIdsOrBoosts instanceof Set) {
      availableModelIds = availableIdsOrBoosts
      if (boostsOrModels instanceof Map) {
        boosts = boostsOrModels
      }
    } else if (availableIdsOrBoosts instanceof Map) {
      boosts = availableIdsOrBoosts
    }
  } else if (modelsOrAvailableIds instanceof Set) {
    availableModelIds = modelsOrAvailableIds
    if (availableIdsOrBoosts instanceof Map) {
      boosts = availableIdsOrBoosts
    }
    if (Array.isArray(boostsOrModels)) {
      models = boostsOrModels
    } else {
      models = OPENCODE_GO_MODELS
    }
  } else {
    if (availableIdsOrBoosts instanceof Map) {
      boosts = availableIdsOrBoosts
    }
    if (Array.isArray(boostsOrModels)) {
      models = boostsOrModels
    } else {
      models = OPENCODE_GO_MODELS
    }
  }

  const candidates = models.filter((m) => {
    if (!availableModelIds || availableModelIds.size === 0) return true
    return availableModelIds.has(m.id)
  })

  const candidatesWithIndex = candidates.map((m, originalIndex) => {
    let multiplier = boosts.get(m.id) ?? 1
    if (multiplier === 1) {
      for (const [boostId, mult] of boosts.entries()) {
        if (m.id.toLowerCase().includes(boostId.toLowerCase()) || boostId.toLowerCase().includes(m.id.toLowerCase())) {
          multiplier = mult
          break
        }
      }
    }
    const effectiveQuota = Math.round(m.baseRequestsPer5h * multiplier)
    return {
      meta: m,
      multiplier,
      effectiveQuota,
      originalIndex,
    }
  })

  candidatesWithIndex.sort((a, b) => {
    if (b.effectiveQuota !== a.effectiveQuota) {
      return b.effectiveQuota - a.effectiveQuota
    }
    return a.originalIndex - b.originalIndex
  })

  return candidatesWithIndex.map(({ meta, multiplier, effectiveQuota }) => {
    const mc: ModelConfig & {
      quota?: {
        baseRequestsPer5h: number
        multiplier: number
        effectiveRequestsPer5h: number
        isBoosted: boolean
      }
    } = {
      id: meta.id,
      name: meta.name + (multiplier > 1 ? ` (${multiplier}x Boost)` : ''),
      contextWindow: meta.contextWindow,
      source: 'backend',
      requestBody: { endpoint: meta.endpoint },
      ...(meta.supportsVision ? { supportsVision: true } : {}),
      ...(meta.reasoningEfforts?.length ? { reasoningEfforts: meta.reasoningEfforts } : {}),
      quota: {
        baseRequestsPer5h: meta.baseRequestsPer5h,
        multiplier,
        effectiveRequestsPer5h: effectiveQuota,
        isBoosted: multiplier > 1,
      },
    }
    return mc
  })
}
