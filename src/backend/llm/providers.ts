import type { ChatMessage } from './types';
import {
  classifyGroqFailure,
  getAvailableGroqKeys,
  markGroqKeyFailure,
  markGroqKeySuccess,
} from './groqKeyPool';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';

export async function callLLM(
  messages: ChatMessage[],
  maxTokens = 500,
  temperature = 0.2,
): Promise<string> {
  const keys = await getAvailableGroqKeys();
  if (keys.length === 0) {
    throw new Error('Tidak ada Groq API key aktif yang tersedia');
  }

  let lastError = 'Groq tidak tersedia';

  for (const key of keys) {
    const res = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key.api_key}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      await markGroqKeySuccess(key.id);
      return data.choices?.[0]?.message?.content || '';
    }

    const err = await res.text();
    const failureKind = classifyGroqFailure(res.status, err);
    lastError = `Groq error (${res.status})`;

    if (!failureKind) {
      throw new Error(`${lastError}: ${err.slice(0, 180)}`);
    }

    await markGroqKeyFailure(key, failureKind, `status ${res.status}`);
  }

  throw new Error(`Semua Groq API key gagal dipakai. Terakhir: ${lastError}`);
}

export async function generateEmbedding(): Promise<number[] | null> {
  return null;
}
