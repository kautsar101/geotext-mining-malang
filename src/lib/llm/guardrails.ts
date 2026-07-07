import type { ChatMessage } from './types';

export function sanitizeInput(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/<\/?system>/gi, '<system>')
    .replace(/<\/?assistant>/gi, '<assistant>')
    .replace(/<\/?user>/gi, '<user>')
    .trim();
}

export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    const cleaned = text.replace(/```json|```/gi, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

export function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((m) => m && typeof m === 'object')
    .map((m) => m as Record<string, unknown>)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: sanitizeInput(String(m.content)).slice(0, 2000),
    }))
    .filter((m) => m.content.length > 0)
    .slice(-5);
}

export function isGreetingOnly(query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;
  return words.every((word) =>
    ['halo', 'hai', 'hi', 'hello', 'test', 'coba', 'pagi', 'siang', 'sore', 'malam'].includes(word),
  );
}

export function cleanModelText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'Maaf, saya belum bisa membuat jawaban dari konteks yang tersedia.';
  }
  return trimmed.slice(0, 8000);
}

