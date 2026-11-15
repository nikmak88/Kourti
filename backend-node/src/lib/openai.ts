import { env } from '../config/env.js';
import { ApiError } from './http.js';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOpenAIModelCandidates() {
  return Array.from(new Set([env.OPENAI_CHAT_MODEL, env.OPENAI_FALLBACK_CHAT_MODEL]));
}

function getOpenRouterModelCandidates() {
  return Array.from(new Set([env.OPENROUTER_CHAT_MODEL, env.OPENROUTER_FALLBACK_CHAT_MODEL]));
}

// OpenRouter is OpenAI-compatible; only the base URL, auth header,
// and a couple of attribution headers differ.
type OpenAICompatibleConfig = {
  label: 'OpenAI' | 'OpenRouter';
  baseUrl: string;
  apiKey: string | undefined;
  models: string[];
  extraHeaders?: Record<string, string>;
  /** Body field carrying the output-token limit. */
  tokenParam: 'max_completion_tokens' | 'max_tokens';
  configMissingCode: string;
  upstreamErrorCode: string;
  emptyResponseCode: string;
};

/** Output-length parameter for the "openai" provider (see OPENAI_TOKEN_PARAM). */
export function openAITokenParam(): 'max_completion_tokens' | 'max_tokens' {
  if (env.OPENAI_TOKEN_PARAM) return env.OPENAI_TOKEN_PARAM;
  return /^https:\/\/api\.openai\.com\//.test(env.OPENAI_BASE_URL + '/')
    ? 'max_completion_tokens'
    : 'max_tokens';
}

function openAIConfig(): OpenAICompatibleConfig {
  return {
    label: 'OpenAI',
    baseUrl: env.OPENAI_BASE_URL,
    apiKey: env.OPENAI_API_KEY,
    models: getOpenAIModelCandidates(),
    tokenParam: openAITokenParam(),
    configMissingCode: 'OPENAI_CONFIG_MISSING',
    upstreamErrorCode: 'OPENAI_UPSTREAM_ERROR',
    emptyResponseCode: 'OPENAI_EMPTY_RESPONSE',
  };
}

function openRouterConfig(): OpenAICompatibleConfig {
  return {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: env.OPENROUTER_API_KEY,
    models: getOpenRouterModelCandidates(),
    tokenParam: 'max_completion_tokens',
    extraHeaders: {
      // OpenRouter recommends these for app attribution / rankings.
      ...(env.APP_URL ? { 'HTTP-Referer': env.APP_URL } : {}),
      'X-Title': env.OPENROUTER_APP_NAME,
    },
    configMissingCode: 'OPENROUTER_CONFIG_MISSING',
    upstreamErrorCode: 'OPENROUTER_UPSTREAM_ERROR',
    emptyResponseCode: 'OPENROUTER_EMPTY_RESPONSE',
  };
}

/** Split a ChatMessage[] into an Anthropic-compatible { system, messages } pair. */
function toAnthropicMessages(messages: ChatMessage[]) {
  const systemParts: string[] = [];
  const nonSystem: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
    } else {
      nonSystem.push({ role: m.role, content: m.content });
    }
  }

  return { system: systemParts.join('\n\n') || undefined, messages: nonSystem };
}

// ---------------------------------------------------------------------------
// Anthropic chat completion (non-streaming)
// ---------------------------------------------------------------------------

async function requestAnthropicCompletion(messages: ChatMessage[], maxTokens: number) {
  if (!env.ANTHROPIC_API_KEY) return null;

  const { system, messages: anthropicMessages } = toAnthropicMessages(messages);

  const body: Record<string, unknown> = {
    model: env.ANTHROPIC_CHAT_MODEL,
    max_tokens: maxTokens,
    messages: anthropicMessages,
  };
  if (system) body.system = system;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': env.ANTHROPIC_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    model?: string;
  };

  const content = data.content?.find((b) => b.type === 'text')?.text;
  if (!content?.trim()) {
    throw new Error('Empty response from Anthropic');
  }

  const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  return { analysis: content, tokensUsed, modelUsed: data.model ?? env.ANTHROPIC_CHAT_MODEL };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible chat completion (non-streaming) — used for OpenAI + OpenRouter
// ---------------------------------------------------------------------------

async function requestOpenAICompatibleCompletion(
  cfg: OpenAICompatibleConfig,
  messages: ChatMessage[],
  maxTokens: number
) {
  if (!cfg.apiKey) {
    throw new ApiError(`${cfg.label} API key not configured`, 503, cfg.configMissingCode);
  }

  let lastError: string | null = null;

  for (const model of cfg.models) {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        ...(cfg.extraHeaders ?? {}),
      },
      body: JSON.stringify({ model, messages, [cfg.tokenParam]: maxTokens }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content?.trim()) {
        throw new ApiError(`Empty analysis content from ${cfg.label}`, 502, cfg.emptyResponseCode);
      }

      return { analysis: content, tokensUsed: data.usage?.total_tokens ?? 0, modelUsed: model };
    }

    const errorText = await response.text();
    lastError = `${response.status}: ${errorText}`;
    if ([400, 404, 422].includes(response.status)) continue;
    break;
  }

  throw new ApiError(
    `${cfg.label} request failed (${lastError || 'unknown'})`,
    502,
    cfg.upstreamErrorCode
  );
}

function requestOpenAICompletion(messages: ChatMessage[], maxTokens: number) {
  return requestOpenAICompatibleCompletion(openAIConfig(), messages, maxTokens);
}

async function requestOpenRouterCompletion(messages: ChatMessage[], maxTokens: number) {
  if (!env.OPENROUTER_API_KEY) return null;
  return requestOpenAICompatibleCompletion(openRouterConfig(), messages, maxTokens);
}

// ---------------------------------------------------------------------------
// Public: chat completion with provider fallback
// ---------------------------------------------------------------------------

export async function requestChatCompletion(messages: ChatMessage[], maxTokens = 4000) {
  const allProviders = {
    anthropic: requestAnthropicCompletion,
    openai: requestOpenAICompletion,
    openrouter: requestOpenRouterCompletion,
  } as const;

  const primary = env.LLM_PRIMARY_PROVIDER;
  const order: Array<keyof typeof allProviders> = [
    primary,
    ...(['anthropic', 'openai', 'openrouter'] as const).filter((p) => p !== primary),
  ];
  const providers = order.map((k) => allProviders[k]);

  for (const provider of providers) {
    try {
      const result = await provider(messages, maxTokens);
      if (result) return result;
    } catch (err) {
      // If this is the last provider, rethrow
      if (provider === providers[providers.length - 1]) throw err;
      // Otherwise log and try the next provider
      console.warn(
        `[LLM] Primary provider failed, falling back:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  throw new ApiError('All LLM providers failed', 502, 'LLM_ALL_PROVIDERS_FAILED');
}

// ---------------------------------------------------------------------------
// Anthropic streaming chat completion
// ---------------------------------------------------------------------------

async function streamAnthropicCompletion(
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  maxTokens: number
) {
  if (!env.ANTHROPIC_API_KEY) return null;

  const { system, messages: anthropicMessages } = toAnthropicMessages(messages);

  const body: Record<string, unknown> = {
    model: env.ANTHROPIC_CHAT_MODEL,
    max_tokens: maxTokens,
    messages: anthropicMessages,
    stream: true,
  };
  if (system) body.system = system;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': env.ANTHROPIC_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic ${response.status}: ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body from Anthropic');

  const decoder = new TextDecoder();
  let fullContent = '';
  let tokensUsed = 0;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);

      try {
        const parsed = JSON.parse(payload) as {
          type?: string;
          delta?: { type?: string; text?: string };
          usage?: { input_tokens?: number; output_tokens?: number };
        };

        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullContent += parsed.delta.text;
          onChunk(parsed.delta.text);
        }

        if (parsed.type === 'message_delta' && parsed.usage) {
          tokensUsed = (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0);
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }

  if (!fullContent.trim()) throw new Error('Empty streaming response from Anthropic');

  return {
    analysis: fullContent,
    tokensUsed,
    modelUsed: env.ANTHROPIC_CHAT_MODEL,
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible streaming chat completion — used for OpenAI + OpenRouter
// ---------------------------------------------------------------------------

async function streamOpenAICompatibleCompletion(
  cfg: OpenAICompatibleConfig,
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  maxTokens: number
) {
  if (!cfg.apiKey) {
    throw new ApiError(`${cfg.label} API key not configured`, 503, cfg.configMissingCode);
  }

  let lastError: string | null = null;

  for (const model of cfg.models) {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        ...(cfg.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model,
        messages,
        [cfg.tokenParam]: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      lastError = `${response.status}: ${errorText}`;
      if ([400, 404, 422].includes(response.status)) continue;
      break;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ApiError(`No response body from ${cfg.label}`, 502, cfg.emptyResponseCode);
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    let tokensUsed = 0;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { total_tokens?: number };
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onChunk(delta);
          }
          if (parsed.usage?.total_tokens) {
            tokensUsed = parsed.usage.total_tokens;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    if (!fullContent.trim()) {
      throw new ApiError(`Empty analysis content from ${cfg.label}`, 502, cfg.emptyResponseCode);
    }

    return { analysis: fullContent, tokensUsed, modelUsed: model };
  }

  throw new ApiError(
    `${cfg.label} request failed (${lastError || 'unknown'})`,
    502,
    cfg.upstreamErrorCode
  );
}

function streamOpenAICompletion(
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  maxTokens: number
) {
  return streamOpenAICompatibleCompletion(openAIConfig(), messages, onChunk, maxTokens);
}

async function streamOpenRouterCompletion(
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  maxTokens: number
) {
  if (!env.OPENROUTER_API_KEY) return null;
  return streamOpenAICompatibleCompletion(openRouterConfig(), messages, onChunk, maxTokens);
}

// ---------------------------------------------------------------------------
// Public: streaming chat completion with provider fallback
// ---------------------------------------------------------------------------

export async function streamChatCompletion(
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  maxTokens = 3000
): Promise<{ analysis: string; tokensUsed: number; modelUsed: string }> {
  const allProviders = {
    anthropic: streamAnthropicCompletion,
    openai: streamOpenAICompletion,
    openrouter: streamOpenRouterCompletion,
  } as const;

  const primary = env.LLM_PRIMARY_PROVIDER;
  const order: Array<keyof typeof allProviders> = [
    primary,
    ...(['anthropic', 'openai', 'openrouter'] as const).filter((p) => p !== primary),
  ];
  const providers = order.map((k) => allProviders[k]);

  for (const provider of providers) {
    try {
      const result = await provider(messages, onChunk, maxTokens);
      if (result) return result;
    } catch (err) {
      if (provider === providers[providers.length - 1]) throw err;
      console.warn(
        `[LLM] Primary streaming provider failed, falling back:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  throw new ApiError('All LLM providers failed', 502, 'LLM_ALL_PROVIDERS_FAILED');
}

// ---------------------------------------------------------------------------
// Embeddings (document search) — OpenRouter or the "openai" provider
// ---------------------------------------------------------------------------

type ServiceTarget = {
  label: 'OpenAI' | 'OpenRouter';
  url: string;
  apiKey: string | undefined;
  headers: Record<string, string>;
  missingCode: string;
  upstreamCode: string;
};

function resolveService(explicit: 'openai' | 'openrouter' | undefined): 'openai' | 'openrouter' {
  return explicit ?? (env.OPENROUTER_API_KEY ? 'openrouter' : 'openai');
}

/** Provider that serves embeddings (AI_EMBEDDINGS_PROVIDER, else auto). */
export function embeddingsProvider(): 'openai' | 'openrouter' {
  return resolveService(env.AI_EMBEDDINGS_PROVIDER);
}

/** Provider that serves voice transcription (AI_TRANSCRIPTION_PROVIDER, else auto). */
export function transcriptionProvider(): 'openai' | 'openrouter' {
  return resolveService(env.AI_TRANSCRIPTION_PROVIDER);
}

export function serviceTarget(provider: 'openai' | 'openrouter', path: string): ServiceTarget {
  if (provider === 'openrouter') {
    return {
      label: 'OpenRouter',
      url: `https://openrouter.ai/api/v1${path}`,
      apiKey: env.OPENROUTER_API_KEY,
      headers: {
        ...(env.APP_URL ? { 'HTTP-Referer': env.APP_URL } : {}),
        'X-Title': env.OPENROUTER_APP_NAME,
      },
      missingCode: 'OPENROUTER_CONFIG_MISSING',
      upstreamCode: 'OPENROUTER_UPSTREAM_ERROR',
    };
  }
  return {
    label: 'OpenAI',
    url: `${env.OPENAI_BASE_URL}${path}`,
    apiKey: env.OPENAI_API_KEY,
    headers: {},
    missingCode: 'OPENAI_CONFIG_MISSING',
    upstreamCode: 'OPENAI_UPSTREAM_ERROR',
  };
}

async function requestEmbeddings(input: string | string[], model?: string): Promise<number[][]> {
  const provider = embeddingsProvider();
  const target = serviceTarget(provider, '/embeddings');
  if (!target.apiKey) {
    throw new ApiError(
      `${target.label} API key not configured (needed for document search)`,
      503,
      target.missingCode
    );
  }
  const useModel =
    model ?? (provider === 'openrouter' ? env.OPENROUTER_EMBEDDING_MODEL : env.OPENAI_EMBEDDING_MODEL);

  const response = await fetch(target.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${target.apiKey}`,
      'Content-Type': 'application/json',
      ...target.headers,
    },
    body: JSON.stringify({ model: useModel, input }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(
      `Embedding request failed (${target.label}): ${response.status}: ${errorText}`,
      502,
      target.upstreamCode
    );
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };
  if (!data.data?.length || data.data.some((d) => !d.embedding)) {
    throw new ApiError(`No embeddings returned from ${target.label}`, 502, target.upstreamCode);
  }
  return data.data
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => d.embedding!);
}

export async function generateEmbedding(text: string, model?: string): Promise<number[]> {
  const [embedding] = await requestEmbeddings(text, model);
  return embedding;
}

export async function generateEmbeddingsBatch(texts: string[], model?: string): Promise<number[][]> {
  if (texts.length === 0) return [];
  return requestEmbeddings(texts, model);
}
