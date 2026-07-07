import type { ChatMessage, ProviderId } from './types';

type ProviderConfig = {
  api: string;
  model: string;
  openaiCompat: boolean;
  needsKey: boolean;
};

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  gemini: {
    api: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.0-flash',
    openaiCompat: true,
    needsKey: true,
  },
  groq: {
    api: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    openaiCompat: true,
    needsKey: true,
  },
  deepseek: {
    api: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    openaiCompat: true,
    needsKey: true,
  },
  openai: {
    api: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    openaiCompat: true,
    needsKey: true,
  },
  claude: {
    api: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-haiku-20240307',
    openaiCompat: false,
    needsKey: true,
  },
};

export function isProviderId(value: string): value is ProviderId {
  return value in PROVIDERS;
}

export async function callLLM(
  provider: ProviderId,
  apiKey: string,
  messages: ChatMessage[],
  maxTokens = 500,
  temperature = 0.2,
): Promise<string> {
  const cfg = PROVIDERS[provider];

  if (cfg.openaiCompat) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.needsKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetch(cfg.api, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${provider} error (${res.status}): ${err.slice(0, 220)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  const system = messages.find((m) => m.role === 'system')?.content || '';
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch(cfg.api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      system,
      messages: chatMessages,
      temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude error (${res.status}): ${err.slice(0, 220)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

export async function generateEmbedding(
  provider: ProviderId,
  apiKey: string,
  text: string,
): Promise<number[] | null> {
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.embedding?.values || null;
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  }

  return null;
}

