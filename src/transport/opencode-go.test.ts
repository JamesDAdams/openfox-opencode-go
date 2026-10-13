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

  describe('multimodal image attachments', () => {
    const imageDataUrl = 'data:image/png;base64,AAAA'
    const imageAttachment = {
      id: 'img-1',
      filename: 'shot.png',
      mimeType: 'image/png',
      size: 100,
      data: imageDataUrl,
    }

    async function captureBody(model: string, messages: any[]) {
      const credentials = new MemoryProviderCredentialStore()
      const credRef = await credentials.create({ apiKey: 'key-123' })
      const auth = new OpenCodeGoAuthAdapter(credentials)

      let captured: any
      const mockFetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        captured = JSON.parse(String(init?.body))
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
            controller.close()
          },
        })
        return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      }) as any

      const transport = new OpenCodeGoTransportAdapter(auth, { fetcher: mockFetcher })
      await transport.complete({ messages }, { providerId: 'opencode-go', credentialRef: credRef, model })
      return captured
    }

    it('serializes an image into an image_url part on /chat/completions', async () => {
      const body = await captureBody('deepseek-v4-flash', [
        { role: 'user', content: 'look', attachments: [imageAttachment] },
      ])

      expect(body.messages[0]).toEqual({
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      })
    })

    it('serializes an image into an Anthropic image block on /messages', async () => {
      const body = await captureBody('qwen3.8-flash', [
        { role: 'user', content: 'look', attachments: [imageAttachment] },
      ])

      expect(body.messages[0]).toEqual({
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
        ],
      })
    })

    it('serializes an image into an input_image part on /responses', async () => {
      const body = await captureBody('grok-4.6', [
        { role: 'user', content: 'look', attachments: [imageAttachment] },
      ])

      expect(body.input[0]).toEqual({
        role: 'user',
        content: [
          { type: 'input_text', text: 'look' },
          { type: 'input_image', image_url: imageDataUrl },
        ],
      })
    })

    it('keeps a plain string content when there are no attachments', async () => {
      for (const model of ['deepseek-v4-flash', 'qwen3.8-flash', 'grok-4.6']) {
        const body = await captureBody(model, [{ role: 'user', content: 'hello' }])
        const list = body.messages ?? body.input
        expect(list[0]).toEqual({ role: 'user', content: 'hello' })
      }
    })

    it('does not turn non-image attachments into image parts', async () => {
      const body = await captureBody('deepseek-v4-flash', [
        {
          role: 'user',
          content: 'notes',
          attachments: [
            { id: 't1', filename: 'a.txt', mimeType: 'text/plain', size: 3, data: 'hi!' },
          ],
        },
      ])

      expect(typeof body.messages[0].content).toBe('string')
    })
  })
})
