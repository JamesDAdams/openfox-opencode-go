import { describe, it, expect } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  OPENCODE_GO_MODELS,
  ModelsCacheStore,
  buildGoModelsList,
  parseBoostsFromHtml,
  parseModelsFromHtml,
  fetchLiveModelsAndBoosts,
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
    const boosts = new Map([['glm-5.3-flash', 2]])
    const list = buildGoModelsList(undefined, boosts)

    const glmIndex = list.findIndex((m) => m.id === 'glm-5.3-flash')
    const kimiIndex = list.findIndex((m) => m.id === 'kimi-k2.7-code')

    expect(glmIndex).toBeLessThan(kimiIndex)
    expect((list[glmIndex] as any).quota.effectiveRequestsPer5h).toBe(3160)
    expect((list[glmIndex] as any).quota.isBoosted).toBe(true)
    expect(list[glmIndex].name).toContain('(2x Boost)')
  })

  it('should parse models and unlimited/free quotas from HTML table', () => {
    const html = `
      <table>
        <tbody>
          <tr>
            <th scope="row"><bdi>LongCat 2.5 Preview Free</bdi></th>
            <td data-slot="bars"></td>
            <td data-slot="number"><span>∞</span><span>∞</span></td>
          </tr>
          <tr>
            <th scope="row"><bdi>MiMo-V2.6-Flash</bdi></th>
            <td data-slot="bars"></td>
            <td data-slot="number"><span>30,100</span><span>60,200</span></td>
          </tr>
        </tbody>
      </table>
    `
    const models = parseModelsFromHtml(html)
    expect(models.has('longcat-2.5-preview-free')).toBe(true)
    expect(models.get('longcat-2.5-preview-free')?.name).toBe('LongCat 2.5 Preview Free')
    expect(models.get('longcat-2.5-preview-free')?.baseRequestsPer5h).toBe(100000)

    expect(models.has('mimo-v2.6-flash')).toBe(true)
    expect(models.get('mimo-v2.6-flash')?.baseRequestsPer5h).toBe(30100)
  })

  it('should save and load models cache to/from disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'models-cache-test-'))
    const cachePath = join(dir, 'models-cache.json')
    const store = new ModelsCacheStore(cachePath)

    const initial = await store.load()
    expect(initial).toBeNull()

    const data = {
      models: [
        {
          id: 'longcat-2.5-preview-free',
          name: 'LongCat 2.5 Preview Free',
          contextWindow: 1000000,
          endpoint: '/chat/completions' as const,
          baseRequestsPer5h: 100000,
        },
      ],
      boosts: { 'longcat-2.5-preview-free': 1 },
      updatedAt: Date.now(),
    }

    await store.save(data)
    const reloaded = await store.load()
    expect(reloaded).not.toBeNull()
    expect(reloaded?.models).toHaveLength(1)
    expect(reloaded?.models[0]?.id).toBe('longcat-2.5-preview-free')
    expect(reloaded?.models[0]?.name).toBe('LongCat 2.5 Preview Free')

    await rm(dir, { recursive: true, force: true })
  })

  it('should fetch live models and persist to cache, including unlisted new models', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'models-live-test-'))
    const cachePath = join(dir, 'models-cache.json')
    const store = new ModelsCacheStore(cachePath)

    const mockFetcher = async (url: string | URL | Request) => {
      const urlStr = url.toString()
      if (urlStr.includes('/models')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'space-bunny-free' },
              { id: 'longcat-2.5-preview-free' },
              { id: 'new-unlisted-model-v1' },
            ],
          }),
          { status: 200 },
        )
      }
      if (urlStr.includes('/go')) {
        return new Response(
          `
            <table>
              <tr>
                <th scope="row"><bdi>LongCat 2.5 Preview Free</bdi></th>
                <td data-slot="number"><span>∞</span></td>
              </tr>
            </table>
            <p>Space-Bunny-Free gets 2x usage limits</p>
          `,
          { status: 200 },
        )
      }
      return new Response('', { status: 404 })
    }

    const { models } = await fetchLiveModelsAndBoosts(mockFetcher as any, {
      cacheStore: store,
    })

    expect(models.length).toBe(3)
    const modelIds = models.map((m) => m.id)
    expect(modelIds).toContain('space-bunny-free')
    expect(modelIds).toContain('longcat-2.5-preview-free')
    expect(modelIds).toContain('new-unlisted-model-v1')

    const longcat = models.find((m) => m.id === 'longcat-2.5-preview-free')
    expect(longcat?.name).toBe('LongCat 2.5 Preview Free')
    expect(longcat?.baseRequestsPer5h).toBe(100000)

    // Verify cache file was written to disk
    const diskCache = await store.load()
    expect(diskCache?.models.length).toBe(3)
    expect(diskCache?.boosts?.['space-bunny-free']).toBe(2)

    // Test fallback when offline
    const failingFetcher = async () => new Response('', { status: 500 })
    const offlineResult = await fetchLiveModelsAndBoosts(failingFetcher as any, {
      cacheStore: store,
    })
    expect(offlineResult.models.length).toBe(3)

    await rm(dir, { recursive: true, force: true })
  })
})
