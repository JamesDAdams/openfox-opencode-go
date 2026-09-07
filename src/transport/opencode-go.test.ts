import { describe, it, expect, vi } from 'vitest'
import { MemoryProviderCredentialStore } from '../credentials/credential-store.js'
import { OpenCodeGoAuthAdapter } from '../auth/opencode-auth.js'
import { OpenCodeGoTransportAdapter } from './opencode-go.js'

describe('OpenCodeGoTransportAdapter', () => {
  it('should list models sorted by quota without pricing info', async () => {
    const credentials = new MemoryProviderCredentialStore()
    const credRef = await credentials.create({ apiKey: 'key-123' })
    const auth = new OpenCodeGoAuthAdapter(credentials)

    const mockFetcher = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString()
      if (urlStr.includes('/models')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'kimi-k3' },
              { id: 'glm-5.3-flash' },
              { id: 'mimo-v2.5' },
            ],
          }),
          { status: 200 },
        )
      }
      return new Response('', { status: 200 })
    }) as any

    const transport = new OpenCodeGoTransportAdapter(auth, { fetcher: mockFetcher })
    const models = await transport.listModels({ providerId: 'opencode-go', credentialRef: credRef })

    expect(models.length).toBe(3)
    // mimo-v2.5 (30100) > glm-5.3-flash (1580) > kimi-k3 (110)
    expect(models[0].id).toBe('mimo-v2.5')
    expect(models[1].id).toBe('glm-5.3-flash')
    expect(models[2].id).toBe('kimi-k3')

    // Verify pricing is not present on model configs
    expect((models[0] as any).pricing).toBeUndefined()
  })

  it('should stream chat completions successfully', async () => {
    const credentials = new MemoryProviderCredentialStore()
    const credRef = await credentials.create({ apiKey: 'key-123' })
    const auth = new OpenCodeGoAuthAdapter(credentials)

    const sseBody = [
      'data: {"choices":[{"delta":{"content":"Hello "}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"world!"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const mockFetcher = vi.fn(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseBody))
          controller.close()
        },
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }) as any

    const transport = new OpenCodeGoTransportAdapter(auth, { fetcher: mockFetcher })

    const response = await transport.complete(
      {
        messages: [{ role: 'user', content: 'Say hello' }],
      },
      {
        providerId: 'opencode-go',
        credentialRef: credRef,
        model: 'mimo-v2.5',
      },
    )

    expect(response.content).toBe('Hello world!')
    expect(response.finishReason).toBe('stop')
    expect(response.usage?.totalTokens).toBe(15)
  })

  it('should stream messages (Anthropic format) successfully', async () => {
    const credentials = new MemoryProviderCredentialStore()
    const credRef = await credentials.create({ apiKey: 'key-123' })
    const auth = new OpenCodeGoAuthAdapter(credentials)

    const sseBody = [
      'data: {"type":"message_start","message":{"id":"msg-1","usage":{"input_tokens":12}}}',
      '',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      '',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Anthropic response"}}',
      '',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":8}}',
      '',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n')

    const mockFetcher = vi.fn(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseBody))
          controller.close()
        },
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }) as any

    const transport = new OpenCodeGoTransportAdapter(auth, { fetcher: mockFetcher })

    const response = await transport.complete(
      {
        messages: [{ role: 'user', content: 'Hi' }],
      },
      {
        providerId: 'opencode-go',
        credentialRef: credRef,
        model: 'qwen3.8-flash',
      },
    )

    expect(response.content).toBe('Anthropic response')
    expect(response.usage?.promptTokens).toBe(12)
    expect(response.usage?.completionTokens).toBe(8)
  })
})
