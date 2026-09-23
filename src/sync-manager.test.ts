import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenCodeGoSyncManager } from './sync-manager.js'
import { DEFAULT_SETTINGS } from './settings.js'

describe('OpenCodeGoSyncManager', () => {
  let mockTransport: any
  let notifications: any[] = []

  beforeEach(() => {
    notifications = []
    mockTransport = {
      listModels: vi.fn().mockResolvedValue([
        {
          id: 'mimo-v2.5',
          name: 'MiMo-V2.5',
          quota: {
            baseRequestsPer5h: 30100,
            multiplier: 1,
            effectiveRequestsPer5h: 30100,
            isBoosted: false,
          },
        },
      ]),
    }
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('initializes with default settings', () => {
    const manager = new OpenCodeGoSyncManager({
      transport: mockTransport,
    })
    expect(manager.getSettings()).toEqual(DEFAULT_SETTINGS)
    expect(manager.getModelsRefreshIntervalMs()).toBe(60 * 60 * 1000)
    expect(manager.getPricesRefreshIntervalMs()).toBe(60 * 60 * 1000)
  })

  it('runs syncAll and discovers models and quota diffs', async () => {
    const manager = new OpenCodeGoSyncManager({
      transport: mockTransport,
      notify: (notif) => notifications.push(notif),
    })

    const initialResult = await manager.syncAll()
    expect(initialResult.models.length).toBe(1)
    expect(initialResult.priceDiffs.length).toBe(0)

    // Simulate quota multiplier update
    mockTransport.listModels.mockResolvedValue([
      {
        id: 'mimo-v2.5',
        name: 'MiMo-V2.5',
        quota: {
          baseRequestsPer5h: 30100,
          multiplier: 2,
          effectiveRequestsPer5h: 60200,
          isBoosted: true,
        },
      },
      {
        id: 'omen-alpha',
        name: 'Omen Alpha',
        quota: {
          baseRequestsPer5h: 11600,
          multiplier: 1,
          effectiveRequestsPer5h: 11600,
          isBoosted: false,
        },
      },
    ])

    const secondResult = await manager.syncAll()
    expect(secondResult.models.length).toBe(2)
    expect(secondResult.priceDiffs.length).toBe(1)
    expect(secondResult.priceDiffs[0]?.modelId).toBe('mimo-v2.5')
    expect(secondResult.priceDiffs[0]?.newMultiplier).toBe(2)
  })

  it('updates settings dynamically', () => {
    const manager = new OpenCodeGoSyncManager({
      transport: mockTransport,
    })
    manager.updateSettings({
      ...DEFAULT_SETTINGS,
      modelsRefreshIntervalMinutes: 15,
      pricesRefreshIntervalMinutes: 45,
    })
    expect(manager.getModelsRefreshIntervalMs()).toBe(15 * 60 * 1000)
    expect(manager.getPricesRefreshIntervalMs()).toBe(45 * 60 * 1000)
  })
})
