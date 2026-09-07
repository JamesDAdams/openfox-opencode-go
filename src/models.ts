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

// Officially supported OpenCode Go models with their specifications and base 5-hour quota
export const OPENCODE_GO_MODELS: OpenCodeGoModelMeta[] = [
  {
    id: 'muse-spark-1.3-contributor',
    name: 'Muse Spark 1.3 Contributor',
    contextWindow: 128000,
    endpoint: '/responses',
    baseRequestsPer5h: 45300,
    supportsVision: true,
    reasoningEfforts: ['minimal', 'low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'muse-spark-1.2-contributor',
    name: 'Muse Spark 1.2 Contributor',
    contextWindow: 128000,
    endpoint: '/responses',
    baseRequestsPer5h: 45300,
    supportsVision: true,
    reasoningEfforts: ['minimal', 'low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'mimo-v2.5',
    name: 'MiMo-V2.5',
    contextWindow: 1000000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 30100,
    supportsVision: true,
  },
  {
    id: 'omen-alpha',
    name: 'Omen Alpha',
    contextWindow: 128000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 11600,
    supportsVision: true,
    reasoningEfforts: ['low', 'high'],
  },
  {
    id: 'longcat-2.0',
    name: 'LongCat-2.0',
    contextWindow: 1000000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 11400,
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    contextWindow: 1000000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 7600,
    reasoningEfforts: ['low', 'high', 'max'],
  },
  {
    id: 'qwen3.8-flash',
    name: 'Qwen3.8 Flash',
    contextWindow: 1000000,
    endpoint: '/messages',
    baseRequestsPer5h: 5400,
    supportsVision: true,
    reasoningEfforts: ['low', 'medium', 'xhigh'],
  },
  {
    id: 'qwen3.7-plus',
    name: 'Qwen3.7 Plus',
    contextWindow: 1000000,
    endpoint: '/messages',
    baseRequestsPer5h: 4300,
    supportsVision: true,
  },
  {
    id: 'hy3',
    name: 'Hy3',
    contextWindow: 1000000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 4300,
    reasoningEfforts: ['none', 'low', 'high'],
  },
  {
    id: 'deepseek-v4-flash-vision-exp',
    name: 'DeepSeek V4 Flash Vision Exp',
    contextWindow: 1000000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 3800,
    supportsVision: true,
    reasoningEfforts: ['low', 'high', 'max'],
  },
  {
    id: 'minimax-m2.7',
    name: 'MiniMax M2.7',
    contextWindow: 1000000,
    endpoint: '/messages',
    baseRequestsPer5h: 3400,
  },
  {
    id: 'minimax-m2.5',
    name: 'MiniMax M2.5',
    contextWindow: 1000000,
    endpoint: '/messages',
    baseRequestsPer5h: 3400,
  },
  {
    id: 'qwen3.6-plus',
    name: 'Qwen3.6 Plus',
    contextWindow: 1000000,
    endpoint: '/messages',
    baseRequestsPer5h: 3300,
    supportsVision: true,
  },
  {
    id: 'mimo-v2.5-pro',
    name: 'MiMo-V2.5-Pro',
    contextWindow: 1000000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 3250,
    supportsVision: true,
  },
  {
    id: 'minimax-m3',
    name: 'MiniMax M3',
    contextWindow: 1000000,
    endpoint: '/messages',
    baseRequestsPer5h: 3200,
  },
  {
    id: 'gpt-5.6-luna',
    name: 'GPT 5.6 Luna',
    contextWindow: 1000000,
    endpoint: '/responses',
    baseRequestsPer5h: 2050,
    supportsVision: true,
    reasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'glm-5.3-flash',
    name: 'GLM-5.3-Flash',
    contextWindow: 1000000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 1580,
    supportsVision: true,
    reasoningEfforts: ['low', 'high', 'max'],
  },
  {
    id: 'kimi-k2.7-code',
    name: 'Kimi K2.7 Code',
    contextWindow: 256000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 1350,
    supportsVision: true,
  },
  {
    id: 'hy4-preview',
    name: 'Hy4 preview',
    contextWindow: 1000000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 1350,
    reasoningEfforts: ['none', 'high'],
  },
  {
    id: 'kimi-k2.6',
    name: 'Kimi K2.6',
    contextWindow: 256000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 1150,
    supportsVision: true,
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    contextWindow: 1000000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 1050,
    reasoningEfforts: ['high', 'max'],
  },
  {
    id: 'glm-5.2',
    name: 'GLM-5.2',
    contextWindow: 1000000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 880,
    reasoningEfforts: ['high', 'max'],
  },
  {
    id: 'glm-5.1',
    name: 'GLM-5.1',
    contextWindow: 1000000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 880,
  },
  {
    id: 'glm-5.3',
    name: 'GLM-5.3',
    contextWindow: 1000000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 220,
    reasoningEfforts: ['low', 'high', 'max'],
  },
  {
    id: 'qwen3.7-max',
    name: 'Qwen3.7 Max',
    contextWindow: 1000000,
    endpoint: '/messages',
    baseRequestsPer5h: 170,
  },
  {
    id: 'grok-4.6',
    name: 'Grok 4.6',
    contextWindow: 2000000,
    endpoint: '/responses',
    baseRequestsPer5h: 169,
    supportsVision: true,
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'qwen3.8-max',
    name: 'Qwen3.8 Max',
    contextWindow: 1000000,
    endpoint: '/messages',
    baseRequestsPer5h: 160,
    supportsVision: true,
    reasoningEfforts: ['low', 'medium', 'xhigh'],
  },
  {
    id: 'kimi-k3',
    name: 'Kimi K3',
    contextWindow: 1000000,
    endpoint: '/chat/completions',
    baseRequestsPer5h: 110,
    supportsVision: true,
    reasoningEfforts: ['max'],
  },
]

export const OPENCODE_GO_MODELS_MAP = new Map<string, OpenCodeGoModelMeta>(
  OPENCODE_GO_MODELS.map((m) => [m.id, m]),
)

export function parseBoostsFromHtml(html: string): Map<string, number> {
  const boosts = new Map<string, number>()
  if (!html) return boosts

  // Look for patterns like "GLM-5.3-Flash gets 2× usage limits" or "GLM-5.3-Flash gets 2x usage limits"
  const regex = /([A-Za-z0-9.-]+)\s+(?:gets|has)\s+([0-9.]+)[x×]\s+usage/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    const rawName = match[1].toLowerCase().replace(/\s+/g, '-')
    const multiplier = parseFloat(match[2])
    if (!isNaN(multiplier) && multiplier > 0) {
      // Find matching model ID
      for (const [id, meta] of OPENCODE_GO_MODELS_MAP.entries()) {
        if (
          id.toLowerCase() === rawName ||
          meta.name.toLowerCase().replace(/\s+/g, '-') === rawName ||
          id.toLowerCase().includes(rawName) ||
          rawName.includes(id.toLowerCase())
        ) {
          boosts.set(id, multiplier)
        }
      }
    }
  }

  // Also check inline patterns like "GLM-5.3-Flash2x usage" or "GLM-5.3-Flash 2x usage"
  const inlineRegex = /([A-Za-z0-9.-]+)\s*([0-9.]+)[x×]\s*usage/gi
  while ((match = inlineRegex.exec(html)) !== null) {
    const rawName = match[1].toLowerCase().replace(/\s+/g, '-')
    const multiplier = parseFloat(match[2])
    if (!isNaN(multiplier) && multiplier > 0) {
      for (const [id, meta] of OPENCODE_GO_MODELS_MAP.entries()) {
        if (
          id.toLowerCase() === rawName ||
          meta.name.toLowerCase().replace(/\s+/g, '-') === rawName
        ) {
          boosts.set(id, multiplier)
        }
      }
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

export function buildGoModelsList(
  availableModelIds?: Set<string>,
  boosts: Map<string, number> = new Map(),
): ModelConfig[] {
  // Filter only models that are officially part of OpenCode Go
  const candidates = OPENCODE_GO_MODELS.filter((m) => {
    if (!availableModelIds || availableModelIds.size === 0) return true
    return availableModelIds.has(m.id)
  })

  // Sort strictly by effective quota in descending order (highest quota first)
  // When quotas are equal, preserve canonical catalog order
  const candidatesWithIndex = candidates.map((m, originalIndex) => {
    const multiplier = boosts.get(m.id) ?? 1
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

  // Convert to OpenFox ModelConfig
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
