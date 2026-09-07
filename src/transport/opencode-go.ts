import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ProviderTransportAdapter,
  ProviderRequestContext,
  ProviderAccessContext,
  ModelConfig,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamEvent,
  ToolCall,
  LLMMessage,
  LLMToolDefinition,
} from 'openfox/provider'
import type { OpenCodeGoAuthAdapter } from '../auth/opencode-auth.js'
import {
  OPENCODE_GO_MODELS_MAP,
  buildGoModelsList,
  fetchLiveBoosts,
} from '../models.js'

const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1'

const LOOKAROUND_RE = /\(\?[=!]|\(\?<[=!]/

function sanitizeSchema(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sanitizeSchema)
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === 'pattern' && typeof v === 'string' && LOOKAROUND_RE.test(v)) continue
      result[k] = sanitizeSchema(v)
    }
    return result
  }
  return obj
}

export class OpenCodeGoTransportAdapter implements ProviderTransportAdapter {
  readonly id = 'opencode-go-transport'
  private cachedModels: ModelConfig[] = []
  private readonly fetcher: typeof fetch
  private readonly configDirectory?: string

  constructor(
    private readonly auth?: OpenCodeGoAuthAdapter,
    options: { fetcher?: typeof fetch; configDirectory?: string } = {},
  ) {
    this.fetcher = options.fetcher ?? fetch
    this.configDirectory = options.configDirectory
  }

  async resolveApiKey(context?: ProviderRequestContext): Promise<string | undefined> {
    if (context?.credentialRef && this.auth) {
      try {
        const access = await this.auth.getAccessContext(context.credentialRef)
        if (access.accessToken) return access.accessToken
      } catch {}
    }

    if (context?.providerId && this.configDirectory) {
      try {
        const configPath = join(this.configDirectory, 'config.json')
        const raw = await readFile(configPath, 'utf8')
        const data = JSON.parse(raw)
        const provider = data.providers?.find((p: any) => p.id === context.providerId)
        if (provider?.apiKey) return provider.apiKey
      } catch {}
    }

    return process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY
  }

  async listModels(context: ProviderRequestContext): Promise<ModelConfig[]> {
    try {
      const apiKey = await this.resolveApiKey(context)
      const headers: Record<string, string> = {
        'User-Agent': 'OpenFox',
      }
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`
      }

      let availableIds: Set<string> | undefined
      try {
        const res = await this.fetcher(`${OPENCODE_GO_BASE_URL}/models`, {
          headers,
          signal: AbortSignal.timeout(5000),
        })

        if (res.ok) {
          const json = (await res.json()) as { data?: Array<{ id: string }> } | Array<{ id: string }>
          const list = Array.isArray(json) ? json : json.data
          if (Array.isArray(list)) {
            availableIds = new Set(list.map((m) => m.id))
          }
        }
      } catch {
        // Fallback to static catalog if network call fails
      }

      const boosts = await fetchLiveBoosts(this.fetcher)
      const models = buildGoModelsList(availableIds, boosts)

      if (models.length > 0) {
        this.cachedModels = models
        return models
      }
    } catch {
      // Fallback
    }

    if (this.cachedModels.length > 0) {
      return this.cachedModels
    }

    return buildGoModelsList()
  }

  async complete(request: LLMCompletionRequest, context: ProviderRequestContext): Promise<LLMCompletionResponse> {
    let result: LLMCompletionResponse | undefined
    for await (const event of this.stream(request, context)) {
      if (event.type === 'done') result = event.response
      if (event.type === 'error') throw new Error(event.error)
    }
    if (!result) throw new Error('OpenCode Go response completed without a final response')
    return result
  }

  async *stream(request: LLMCompletionRequest, context: ProviderRequestContext): AsyncIterable<LLMStreamEvent> {
    const apiKey = await this.resolveApiKey(context)
    const headers: Record<string, string> = {
      'User-Agent': 'OpenFox',
      'x-opencode-session': 'openfox',
    }

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const access: ProviderAccessContext = {
      accessToken: apiKey,
      headers,
    }

    const model = context.model || 'qwen3.8-flash'
    const meta = OPENCODE_GO_MODELS_MAP.get(model)
    const endpoint = meta?.endpoint || '/chat/completions'

    try {
      if (endpoint === '/messages') {
        yield* this.streamMessages(request, access, model)
      } else if (endpoint === '/responses') {
        yield* this.streamResponses(request, access, model)
      } else {
        yield* this.streamChatCompletions(request, access, model)
      }
    } catch (error: any) {
      if (request.signal?.aborted) {
        yield { type: 'error', error: 'Request aborted' }
        return
      }
      yield { type: 'error', error: error.message || String(error) }
    }
  }

  private async *streamChatCompletions(
    request: LLMCompletionRequest,
    access: ProviderAccessContext,
    model: string,
  ): AsyncIterable<LLMStreamEvent> {
    const convertMessage = (m: LLMMessage) => {
      const base: Record<string, unknown> = {
        role: m.role,
        content: m.content === '' ? null : m.content,
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        base.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        }))
      }
      if (m.role === 'tool' && m.toolCallId) {
        base.tool_call_id = m.toolCallId
      }
      if (m.name) base.name = m.name
      return base
    }

    const body: Record<string, unknown> = {
      model,
      messages: request.messages.map(convertMessage),
      stream: true,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    }
    if (request.tools?.length) {
      body.tools = request.tools.map((t: LLMToolDefinition) => ({
        type: 'function',
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: sanitizeSchema(t.function.parameters),
        },
      }))
    }
    if (request.toolChoice) body.tool_choice = request.toolChoice
    if (request.reasoningEffort) body.reasoning_effort = request.reasoningEffort

    const res = await this.fetcher(`${OPENCODE_GO_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...access.headers,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    })

    if (!res.ok) {
      const errorDetail = await res.text()
      yield { type: 'error', error: `OpenCode Go API error (${res.status}): ${errorDetail}` }
      return
    }

    if (!res.body) {
      yield { type: 'error', error: 'Response body is empty' }
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let fullContent = ''
    let fullThinking = ''
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>()
    let finishReason: LLMCompletionResponse['finishReason'] = 'stop'
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    let responseId = 'opencode-go-' + crypto.randomUUID()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const cleaned = line.trim()
          if (!cleaned) continue
          if (cleaned === 'data: [DONE]') continue

          if (cleaned.startsWith('data: ')) {
            const dataStr = cleaned.slice(6)
            try {
              const parsed = JSON.parse(dataStr) as {
                id?: string
                usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
                choices?: Array<{
                  finish_reason?: string | null
                  delta?: {
                    content?: string | null
                    reasoning_content?: string | null
                    reasoning?: string | null
                    thinking?: string | null
                    tool_calls?: Array<{
                      index: number
                      id?: string
                      function?: { name?: string; arguments?: string }
                    }>
                  }
                }>
              }

              if (parsed.id) responseId = parsed.id
              if (parsed.usage) {
                usage = {
                  promptTokens: parsed.usage.prompt_tokens ?? 0,
                  completionTokens: parsed.usage.completion_tokens ?? 0,
                  totalTokens: parsed.usage.total_tokens ?? 0,
                }
              }

              const choice = parsed.choices?.[0]
              if (!choice) continue

              if (choice.finish_reason) {
                switch (choice.finish_reason) {
                  case 'stop': finishReason = 'stop'; break
                  case 'tool_calls': finishReason = 'tool_calls'; break
                  case 'length': finishReason = 'length'; break
                  case 'content_filter': finishReason = 'content_filter'; break
                }
              }

              const delta = choice.delta
              if (!delta) continue

              const thinking = delta.reasoning_content || delta.reasoning || delta.thinking
              if (thinking) {
                fullThinking += thinking
                yield { type: 'thinking_delta', content: thinking }
              }

              if (delta.content) {
                fullContent += delta.content
                yield { type: 'text_delta', content: delta.content }
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const existing = toolCalls.get(tc.index)
                  if (!existing) {
                    toolCalls.set(tc.index, {
                      id: tc.id ?? '',
                      name: tc.function?.name ?? '',
                      arguments: tc.function?.arguments ?? '',
                    })
                  } else {
                    if (tc.id) existing.id = tc.id
                    if (tc.function?.name) existing.name += tc.function.name
                    if (tc.function?.arguments) existing.arguments += tc.function.arguments
                  }

                  yield {
                    type: 'tool_call_delta',
                    index: tc.index,
                    ...(tc.id ? { id: tc.id } : {}),
                    ...(tc.function?.name ? { name: tc.function.name } : {}),
                    ...(tc.function?.arguments ? { arguments: tc.function.arguments } : {})
                  }
                }
              }
            } catch {
              // Ignore parse errors on chunk boundaries
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    const parsedToolCalls: ToolCall[] = []
    for (const [, tc] of toolCalls) {
      try {
        parsedToolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: JSON.parse(tc.arguments) as Record<string, unknown>,
        })
      } catch (error) {
        parsedToolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: {},
          parseError: error instanceof Error ? error.message : 'Unknown JSON parse error',
          rawArguments: tc.arguments,
        })
      }
    }

    yield {
      type: 'done',
      response: {
        id: responseId,
        content: fullContent,
        ...(fullThinking && { thinkingContent: fullThinking }),
        ...(parsedToolCalls.length > 0 && { toolCalls: parsedToolCalls }),
        finishReason,
        usage,
      },
    }
  }

  private async *streamMessages(
    request: LLMCompletionRequest,
    access: ProviderAccessContext,
    model: string,
  ): AsyncIterable<LLMStreamEvent> {
    const systemMessages: string[] = []
    const anthropicMessages: any[] = []

    for (const m of request.messages) {
      if (m.role === 'system') {
        if (m.content) systemMessages.push(m.content)
      } else if (m.role === 'tool') {
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.toolCallId,
              content: m.content || '',
            },
          ],
        })
      } else if (m.role === 'assistant') {
        const contentBlocks: any[] = []
        if (m.content) {
          contentBlocks.push({ type: 'text', text: m.content })
        }
        if (m.toolCalls?.length) {
          for (const tc of m.toolCalls) {
            contentBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            })
          }
        }
        anthropicMessages.push({
          role: 'assistant',
          content: contentBlocks.length === 1 && contentBlocks[0].type === 'text'
            ? contentBlocks[0].text
            : contentBlocks,
        })
      } else {
        anthropicMessages.push({
          role: 'user',
          content: m.content || '',
        })
      }
    }

    const body: Record<string, unknown> = {
      model,
      messages: anthropicMessages,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
    }

    if (systemMessages.length > 0) {
      body.system = systemMessages.join('\n\n')
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    if (request.tools?.length) {
      body.tools = request.tools.map((t: LLMToolDefinition) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: sanitizeSchema(t.function.parameters),
      }))
    }

    const res = await this.fetcher(`${OPENCODE_GO_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...access.headers,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    })

    if (!res.ok) {
      const errorDetail = await res.text()
      yield { type: 'error', error: `OpenCode Go Messages API error (${res.status}): ${errorDetail}` }
      return
    }

    if (!res.body) {
      yield { type: 'error', error: 'Response body is empty' }
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let fullContent = ''
    let fullThinking = ''
    let responseId = 'opencode-go-msg-' + crypto.randomUUID()
    let finishReason: LLMCompletionResponse['finishReason'] = 'stop'
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>()
    let currentBlockIndex = 0
    let currentBlockType = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const cleaned = line.trim()
          if (!cleaned) continue

          if (cleaned.startsWith('data: ')) {
            const dataStr = cleaned.slice(6)
            try {
              const data = JSON.parse(dataStr)

              if (data.type === 'message_start' && data.message) {
                if (data.message.id) responseId = data.message.id
                if (data.message.usage) {
                  usage.promptTokens = data.message.usage.input_tokens || 0
                }
              } else if (data.type === 'content_block_start') {
                currentBlockIndex = data.index ?? currentBlockIndex
                currentBlockType = data.content_block?.type || ''
                if (currentBlockType === 'tool_use') {
                  toolCalls.set(currentBlockIndex, {
                    id: data.content_block.id || '',
                    name: data.content_block.name || '',
                    arguments: '',
                  })
                }
              } else if (data.type === 'content_block_delta') {
                const delta = data.delta
                if (delta) {
                  if (delta.type === 'text_delta' && delta.text) {
                    fullContent += delta.text
                    yield { type: 'text_delta', content: delta.text }
                  } else if (delta.type === 'thinking_delta' && delta.thinking) {
                    fullThinking += delta.thinking
                    yield { type: 'thinking_delta', content: delta.thinking }
                  } else if (delta.type === 'input_json_delta' && delta.partial_json) {
                    const existing = toolCalls.get(data.index ?? currentBlockIndex)
                    if (existing) {
                      existing.arguments += delta.partial_json
                      yield {
                        type: 'tool_call_delta',
                        index: data.index ?? currentBlockIndex,
                        arguments: delta.partial_json,
                      }
                    }
                  }
                }
              } else if (data.type === 'message_delta') {
                if (data.delta?.stop_reason) {
                  if (data.delta.stop_reason === 'tool_use') finishReason = 'tool_calls'
                  else if (data.delta.stop_reason === 'max_tokens') finishReason = 'length'
                  else finishReason = 'stop'
                }
                if (data.usage) {
                  usage.completionTokens = data.usage.output_tokens || 0
                  usage.totalTokens = usage.promptTokens + usage.completionTokens
                }
              }
            } catch {
              // Ignore parse errors on chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    const parsedToolCalls: ToolCall[] = []
    for (const [, tc] of toolCalls) {
      try {
        parsedToolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments ? (JSON.parse(tc.arguments) as Record<string, unknown>) : {},
        })
      } catch (error) {
        parsedToolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: {},
          parseError: error instanceof Error ? error.message : 'Unknown JSON parse error',
          rawArguments: tc.arguments,
        })
      }
    }

    yield {
      type: 'done',
      response: {
        id: responseId,
        content: fullContent,
        ...(fullThinking && { thinkingContent: fullThinking }),
        ...(parsedToolCalls.length > 0 && { toolCalls: parsedToolCalls }),
        finishReason,
        usage,
      },
    }
  }

  private async *streamResponses(
    request: LLMCompletionRequest,
    access: ProviderAccessContext,
    model: string,
  ): AsyncIterable<LLMStreamEvent> {
    const input: any[] = []
    for (const m of request.messages) {
      if (m.role === 'assistant' && !m.content && m.toolCalls?.length) continue
      if (m.role === 'tool') {
        input.push({
          role: 'user',
          content: `[Tool result for ${(m.toolCallId || '').slice(0, 64)}]: ${m.content || ''}`,
        })
      } else {
        const msg: any = { role: m.role, content: m.content === '' ? '' : m.content }
        if (m.name) msg.name = m.name
        input.push(msg)
      }
    }

    const body: Record<string, unknown> = {
      model,
      input,
      max_output_tokens: request.maxTokens ?? 100000,
      stream: true,
    }
    if (request.temperature !== undefined) body.temperature = request.temperature
    if (request.tools?.length) {
      body.tools = request.tools.map((t: LLMToolDefinition) => ({
        type: 'function',
        name: t.function.name,
        description: t.function.description,
        parameters: sanitizeSchema(t.function.parameters),
      }))
    }
    if (request.toolChoice) body.tool_choice = request.toolChoice
    if (request.reasoningEffort) body.reasoning_effort = request.reasoningEffort

    const res = await this.fetcher(`${OPENCODE_GO_BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...access.headers,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    })

    if (!res.ok) {
      const errorDetail = await res.text()
      yield { type: 'error', error: `OpenCode Go Responses API error (${res.status}): ${errorDetail}` }
      return
    }

    if (!res.body) {
      yield { type: 'error', error: 'Response body is empty' }
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let fullContent = ''
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    let responseId = 'opencode-go-resp-' + crypto.randomUUID()
    const toolCalls = new Map<string, { id: string; name: string; arguments: string }>()
    let pendingToolId = ''
    let pendingToolName = ''
    let pendingToolArgs = ''
    let toolCallIdx = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const cleaned = line.trim()
          if (!cleaned || cleaned.startsWith('event: ')) continue

          if (cleaned.startsWith('data: ')) {
            const dataStr = cleaned.slice(6)
            try {
              const d = JSON.parse(dataStr)

              if (d.response?.id) responseId = d.response.id
              if (d.type === 'response.output_text.delta' && d.delta) {
                fullContent += d.delta
                yield { type: 'text_delta', content: d.delta }
              } else if (d.type === 'response.output_item.added' && d.item?.type === 'function_call') {
                pendingToolId = d.item.id || `tc-${toolCallIdx}`
                pendingToolName = d.item.name || ''
                pendingToolArgs = ''
              } else if (d.type === 'response.function_call_arguments.delta' && d.delta) {
                pendingToolArgs += d.delta
                yield {
                  type: 'tool_call_delta',
                  index: toolCallIdx,
                  arguments: d.delta,
                }
              } else if (d.type === 'response.output_item.done' && d.item?.type === 'function_call') {
                const id = d.item.id || pendingToolId
                toolCalls.set(id, {
                  id,
                  name: d.item.name || pendingToolName,
                  arguments: d.item.arguments || pendingToolArgs,
                })
                pendingToolId = ''
                pendingToolName = ''
                pendingToolArgs = ''
                toolCallIdx++
              } else if (d.type === 'response.completed') {
                const resp = d.response || d
                if (resp.usage) {
                  usage = {
                    promptTokens: resp.usage.input_tokens || 0,
                    completionTokens: resp.usage.output_tokens || 0,
                    totalTokens: (resp.usage.input_tokens || 0) + (resp.usage.output_tokens || 0),
                  }
                }
              }
            } catch {
              // Ignore json parse error
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    const parsedToolCalls: ToolCall[] = []
    for (const [, tc] of toolCalls) {
      try {
        parsedToolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: JSON.parse(tc.arguments) as Record<string, unknown>,
        })
      } catch (error) {
        parsedToolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: {},
          parseError: error instanceof Error ? error.message : 'Unknown JSON parse error',
          rawArguments: tc.arguments,
        })
      }
    }

    yield {
      type: 'done',
      response: {
        id: responseId,
        content: fullContent,
        ...(parsedToolCalls.length > 0 && { toolCalls: parsedToolCalls }),
        finishReason: parsedToolCalls.length > 0 ? 'tool_calls' : 'stop',
        usage,
      },
    }
  }
}
