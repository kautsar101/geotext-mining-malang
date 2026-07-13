import type { ChatMessage } from './types';
import { generateLocalQueryEmbedding, type QueryEmbedding } from './embedding';
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

export type { QueryEmbedding as EmbeddingResult } from './embedding';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';

type OpenAICompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
    finish_reason?: string | null;
  }>;
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
      if (!content.trim()) {
        const finishReason = data.choices?.[0]?.finish_reason || 'unknown';
        lastError = `${config.label} empty response (${finishReason})`;
        await markProviderKeyFailure(key, 'server_error', lastError);
        continue;
      }
      await markProviderKeySuccess(key.id);
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

export async function generateEmbedding(queryText: string): Promise<QueryEmbedding> {
  return generateLocalQueryEmbedding(queryText);
}
