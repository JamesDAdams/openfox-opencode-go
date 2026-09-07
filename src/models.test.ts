import { describe, it, expect } from 'vitest'
import {
  OPENCODE_GO_MODELS,
  buildGoModelsList,
  parseBoostsFromHtml,
} from './models.js'

describe('OpenCode Go Models & Quotas', () => {
  it('should contain all official Go models with correct context windows', () => {
    expect(OPENCODE_GO_MODELS.length).toBeGreaterThanOrEqual(25)
    const modelIds = OPENCODE_GO_MODELS.map((m) => m.id)
    expect(modelIds).toContain('grok-4.6')
    expect(modelIds).toContain('gpt-5.6-luna')
    expect(modelIds).toContain('glm-5.3-flash')
    expect(modelIds).toContain('kimi-k3')
    expect(modelIds).toContain('deepseek-v4-flash')
    expect(modelIds).toContain('mimo-v2.5')
    expect(modelIds).toContain('muse-spark-1.3-contributor')

    const deepseek = OPENCODE_GO_MODELS.find((m) => m.id === 'deepseek-v4-flash')
    expect(deepseek?.contextWindow).toBe(1000000)

    const muse13 = OPENCODE_GO_MODELS.find((m) => m.id === 'muse-spark-1.3-contributor')
    expect(muse13?.contextWindow).toBe(128000)

    const muse12 = OPENCODE_GO_MODELS.find((m) => m.id === 'muse-spark-1.2-contributor')
    expect(muse12?.contextWindow).toBe(128000)

    const omen = OPENCODE_GO_MODELS.find((m) => m.id === 'omen-alpha')
    expect(omen?.contextWindow).toBe(128000)

    const grok = OPENCODE_GO_MODELS.find((m) => m.id === 'grok-4.6')
    expect(grok?.contextWindow).toBe(2000000)

    const minimax27 = OPENCODE_GO_MODELS.find((m) => m.id === 'minimax-m2.7')
    expect(minimax27?.contextWindow).toBe(1000000)

    const minimax25 = OPENCODE_GO_MODELS.find((m) => m.id === 'minimax-m2.5')
    expect(minimax25?.contextWindow).toBe(1000000)

    const glm51 = OPENCODE_GO_MODELS.find((m) => m.id === 'glm-5.1')
    expect(glm51?.contextWindow).toBe(1000000)

    const kimi27 = OPENCODE_GO_MODELS.find((m) => m.id === 'kimi-k2.7-code')
    expect(kimi27?.contextWindow).toBe(256000)

    const kimi = OPENCODE_GO_MODELS.find((m) => m.id === 'kimi-k3')
    expect(kimi?.contextWindow).toBe(1000000)
  })

  it('should sort models strictly by quota descending', () => {
    const list = buildGoModelsList()
    expect(list.length).toBe(OPENCODE_GO_MODELS.length)

    // Top should have highest quota (e.g. Muse Spark 1.3 Contributor with 45300 req/5h)
    expect(list[0].id).toBe('muse-spark-1.3-contributor')
    // Bottom should have lowest quota (e.g. Kimi K3 with 110 req/5h)
    expect(list[list.length - 1].id).toBe('kimi-k3')

    // Verify monotonic descending order
    for (let i = 0; i < list.length - 1; i++) {
      const q1 = (list[i] as any).quota.effectiveRequestsPer5h
      const q2 = (list[i + 1] as any).quota.effectiveRequestsPer5h
      expect(q1).toBeGreaterThanOrEqual(q2)
    }
  })

  it('should filter only available models when remote list is provided', () => {
    const available = new Set(['glm-5.3-flash', 'kimi-k3', 'non-go-model-xyz'])
    const list = buildGoModelsList(available)
    expect(list.length).toBe(2)
    expect(list.map((m) => m.id)).toEqual(['glm-5.3-flash', 'kimi-k3'])
  })

  it('should correctly parse live boost announcements from HTML', () => {
    const htmlSample = `
      <h1>Low cost coding models for everyone</h1>
      <p>GLM-5.3-Flash gets 2× usage limits for a limited time</p>
    `
    const boosts = parseBoostsFromHtml(htmlSample)
    expect(boosts.get('glm-5.3-flash')).toBe(2)
  })

  it('should re-order models dynamically when a boost is applied', () => {
    // GLM-5.3-Flash base quota is 1580.
    // With 2x boost = 3160, which should place it above kimi-k2.7-code (1350) and hy4-preview (1350)
    const boosts = new Map([['glm-5.3-flash', 2]])
    const list = buildGoModelsList(undefined, boosts)

    const glmIndex = list.findIndex((m) => m.id === 'glm-5.3-flash')
    const kimiIndex = list.findIndex((m) => m.id === 'kimi-k2.7-code')

    expect(glmIndex).toBeLessThan(kimiIndex)
    expect((list[glmIndex] as any).quota.effectiveRequestsPer5h).toBe(3160)
    expect((list[glmIndex] as any).quota.isBoosted).toBe(true)
    expect(list[glmIndex].name).toContain('(2x Boost)')
  })
})
