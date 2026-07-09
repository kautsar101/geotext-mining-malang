import { supabase } from '@/backend/db/supabase';
import { callLLM } from './providers';
import type { ChatMessage } from './types';

const RECENT_LIMIT = 5;
const COMPACT_AFTER_LOGS = 14;

export type SessionMemory = {
  summary: string;
  recentMessages: ChatMessage[];
  logCount: number;
};

type ChatLogRow = {
  query_raw?: string | null;
  response?: string | null;
};

export async function getSessionMemory(sessionId: string): Promise<SessionMemory> {
  let summary = '';

  try {
    const { data } = await supabase
      .from('chat_sessions')
      .select('summary')
      .eq('session_id', sessionId)
      .maybeSingle();
    summary = typeof data?.summary === 'string' ? data.summary : '';
  } catch {
    summary = '';
  }

  try {
    const { data, count } = await supabase
      .from('chat_logs')
      .select('query_raw,response', { count: 'exact' })
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT);

    const recentMessages = ((data || []) as ChatLogRow[])
      .reverse()
      .flatMap((row) => {
        const messages: ChatMessage[] = [];
        if (row.query_raw) messages.push({ role: 'user', content: String(row.query_raw).slice(0, 1800) });
        if (row.response) messages.push({ role: 'assistant', content: String(row.response).slice(0, 2200) });
        return messages;
      })
      .slice(-RECENT_LIMIT);

    return { summary, recentMessages, logCount: count || 0 };
  } catch {
    return { summary, recentMessages: [], logCount: 0 };
  }
}

export async function recordExchange(input: {
  sessionId: string;
  query: string;
  route: string;
  response?: string;
  sqlGenerated?: string;
  sqlResult?: unknown;
  sources?: unknown;
  latencyMs: number;
  error?: string;
}) {
  try {
    await supabase.from('chat_logs').insert({
      session_id: input.sessionId,
      query_raw: input.query,
      route: input.route,
      response: input.response,
      sql_generated: input.sqlGenerated,
      sql_result: input.sqlResult,
      sources: input.sources,
      latency_ms: input.latencyMs,
      error: input.error,
    });
  } catch {
    // Logging must never break chat.
  }
}

export async function compactSessionMemory(
  sessionId: string,
  existingSummary: string,
  logCount: number,
) {
  if (logCount < COMPACT_AFTER_LOGS || logCount % 6 !== 0) return;

  try {
    const { data } = await supabase
      .from('chat_logs')
      .select('query_raw,response')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(18);

    const transcript = ((data || []) as ChatLogRow[])
      .reverse()
      .map((row) => `User: ${row.query_raw || '-'}\nAssistant: ${row.response || '-'}`)
      .join('\n\n');

    const prompt = `Ringkas memory session chat ini untuk dipakai sebagai konteks masa depan.

Aturan:
- Bahasa Indonesia.
- Maksimal 10 bullet pendek.
- Simpan preferensi user, konteks penting, dan keputusan teknis.
- Jangan simpan API key atau data sensitif.

Summary lama:
${existingSummary || '-'}

Percakapan terbaru:
${transcript}`;

    const summary = await callLLM([{ role: 'user', content: prompt }], 350, 0.1);
    if (!summary.trim()) return;

    await supabase.from('chat_sessions').upsert({
      session_id: sessionId,
      summary: summary.trim().slice(0, 4000),
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Summary table is optional; chat still works without it.
  }
}
