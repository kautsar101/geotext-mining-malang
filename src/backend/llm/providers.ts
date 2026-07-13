import type { ChatMessage } from './types';
import {
  classifyProviderFailure,
  getAvailableProviderKeys,
  markProviderKeyFailure,
  markProviderKeySuccess,
} from './groqKeyPool';

export const LLM_PROVIDERS = ['groq', 'deepseek'] as const;
export type LLMProvider = (typeof LLM_PROVIDERS)[number];

export type LLMCallConfig = {
  provider: LLMProvider;
};

export type EmbeddingResult = {
  vector: number[];
  model: string;
  prefix: 'query:';
  dimensions: 1024;
  normalized: true;
};

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';
const EMBEDDING_MODEL = 'intfloat/multilingual-e5-large';

type OpenAICompatibleResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

function readError(provider: string, status: number, body: string): Error {
  return new Error(`${provider} error (${status}): ${body.slice(0, 180)}`);
}

function providerConfig(provider: LLMProvider) {
  if (provider === 'groq') return { api: GROQ_API, model: DEFAULT_GROQ_MODEL, label: 'Groq' };
  return { api: DEEPSEEK_API, model: DEEPSEEK_MODEL, label: 'DeepSeek' };
}

async function callDatabaseKeyPool(
  provider: LLMProvider,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const keys = await getAvailableProviderKeys(provider);
  const config = providerConfig(provider);
  if (keys.length === 0) {
    throw new Error(`Tidak ada ${config.label} API key aktif yang tersedia`);
  }

  let lastError = `${config.label} tidak tersedia`;

  for (const key of keys) {
    const res = await fetch(config.api, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key.api_key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (res.ok) {
      const data = await res.json() as OpenAICompatibleResponse;
      const content = data.choices?.[0]?.message?.content || '';
      await markProviderKeySuccess(key.id);
      if (!content.trim()) throw new Error(`${config.label} empty response`);
      return content;
    }

    const errorBody = await res.text();
    const failureKind = classifyProviderFailure(res.status, errorBody);
    lastError = `${config.label} error (${res.status})`;

    if (!failureKind) throw readError(config.label, res.status, errorBody);
    await markProviderKeyFailure(key, failureKind, `status ${res.status}`);
  }

  throw new Error(`Semua ${config.label} API key gagal dipakai. Terakhir: ${lastError}`);
}

export async function callLLM(
  messages: ChatMessage[],
  maxTokens = 500,
  temperature = 0.2,
  callConfig: LLMCallConfig = { provider: 'groq' },
): Promise<string> {
  return callDatabaseKeyPool(callConfig.provider, messages, maxTokens, temperature);
}

export async function generateEmbedding(queryText: string): Promise<EmbeddingResult | null> {
  const serviceUrl = process.env.EMBEDDING_SERVICE_URL;
  if (!serviceUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(`${serviceUrl.replace(/\/$/, '')}/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.EMBEDDING_SERVICE_TOKEN
          ? { Authorization: `Bearer ${process.env.EMBEDDING_SERVICE_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        text: queryText,
        prefix: 'query:',
        model: EMBEDDING_MODEL,
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Embedding service error (${response.status})`);
    const payload = await response.json() as { embedding?: unknown; dimensions?: unknown; model?: unknown };
    if (!Array.isArray(payload.embedding) || payload.embedding.length !== 1024) {
      throw new Error('Embedding service mengembalikan vector yang bukan 1024 dimensi');
    }
    if (payload.model && payload.model !== EMBEDDING_MODEL) {
      throw new Error(`Model embedding tidak sesuai: ${String(payload.model)}`);
    }

    return {
      vector: payload.embedding.map(Number),
      model: EMBEDDING_MODEL,
      prefix: 'query:',
      dimensions: 1024,
      normalized: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}
