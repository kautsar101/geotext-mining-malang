import { getSupabaseAdmin, supabase } from '@/backend/db/supabase';
import { callLLM } from './providers';
import type { ChatMessage } from './types';

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

export type ChatLogId = string | number;

export type StoredProcessStep = {
  id: string;
  label: string;
  status: 'running' | 'completed' | 'failed';
  startedAtMs: number;
  finishedAtMs?: number;
  durationMs?: number;
  error?: string;
};

type ExchangeDiagnostics = {
  route?: string;
  routingReason?: string;
  queryPlan?: unknown;
  sqlGenerated?: string;
  sqlResult?: unknown;
  sources?: unknown;
  embeddingDebug?: unknown;
  providerDebug?: unknown;
  processSteps?: StoredProcessStep[];
  currentStage?: string | null;
  lastCompletedStage?: string | null;
  failedStage?: string | null;
};

function withoutEmbeddingVector(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(withoutEmbeddingVector);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'queryVector')
      .map(([key, nestedValue]) => [key, withoutEmbeddingVector(nestedValue)]),
  );
}

export async function startExchange(input: {
  sessionId: string;
  query: string;
  provider: string;
  model: string;
  currentStage: string;
}): Promise<ChatLogId | null> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('chat_logs')
      .insert({
        session_id: input.sessionId,
        query_raw: input.query,
        provider: input.provider,
        model: input.model,
        status: 'running',
        current_stage: input.currentStage,
        process_steps: [],
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;

    const id = (data as Record<string, unknown> | null)?.id;
    return typeof id === 'string' || typeof id === 'number' ? id : null;
  } catch (error) {
    console.error('Gagal membuat chat log awal', error);
    return null;
  }
}

export async function checkpointExchange(
  logId: ChatLogId | null,
  input: ExchangeDiagnostics,
) {
  if (logId === null) return;

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.route !== undefined) payload.route = input.route;
  if (input.routingReason !== undefined) payload.routing_reason = input.routingReason;
  if (input.queryPlan !== undefined) payload.query_plan = input.queryPlan;
  if (input.sqlGenerated !== undefined) payload.sql_generated = input.sqlGenerated;
  if (input.sqlResult !== undefined) payload.sql_result = input.sqlResult;
  if (input.sources !== undefined) payload.sources = input.sources;
  if (input.embeddingDebug !== undefined) payload.embedding_debug = withoutEmbeddingVector(input.embeddingDebug);
  if (input.providerDebug !== undefined) payload.provider_debug = input.providerDebug;
  if (input.processSteps !== undefined) payload.process_steps = input.processSteps;
  if (input.currentStage !== undefined) payload.current_stage = input.currentStage;
  if (input.lastCompletedStage !== undefined) payload.last_completed_stage = input.lastCompletedStage;
  if (input.failedStage !== undefined) payload.failed_stage = input.failedStage;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from('chat_logs').update(payload).eq('id', logId);
    if (error) throw error;
  } catch (error) {
    console.error('Gagal memperbarui checkpoint chat log', error);
  }
}

export async function getSessionMemory(sessionId: string, recentTurnLimit = 0): Promise<SessionMemory> {
  if (recentTurnLimit <= 0) {
    return { summary: '', recentMessages: [], logCount: 0 };
  }

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
      .limit(recentTurnLimit);

    const recentMessages = ((data || []) as ChatLogRow[])
      .reverse()
      .flatMap((row) => {
        const messages: ChatMessage[] = [];
        if (row.query_raw) messages.push({ role: 'user', content: String(row.query_raw).slice(0, 1800) });
        if (row.response) messages.push({ role: 'assistant', content: String(row.response).slice(0, 2200) });
        return messages;
      })
      .slice(-(recentTurnLimit * 2));

    return { summary, recentMessages, logCount: count || 0 };
  } catch {
    return { summary, recentMessages: [], logCount: 0 };
  }
}

export async function recordExchange(input: {
  logId?: ChatLogId | null;
  sessionId: string;
  query: string;
  route: string;
  provider?: string;
  model?: string;
  routingReason?: string;
  queryPlan?: unknown;
  response?: string;
  sqlGenerated?: string;
  sqlResult?: unknown;
  sources?: unknown;
  embeddingDebug?: unknown;
  providerDebug?: unknown;
  processSteps?: StoredProcessStep[];
  currentStage?: string | null;
  lastCompletedStage?: string | null;
  failedStage?: string | null;
  latencyMs: number;
  error?: string;
}) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const payload = {
      session_id: input.sessionId,
      query_raw: input.query,
      route: input.route,
      provider: input.provider,
      model: input.model,
      routing_reason: input.routingReason,
      query_plan: input.queryPlan,
      response: input.response,
      sql_generated: input.sqlGenerated,
      sql_result: input.sqlResult,
      sources: input.sources,
      embedding_debug: withoutEmbeddingVector(input.embeddingDebug),
      provider_debug: input.providerDebug,
      process_steps: input.processSteps,
      status: input.error ? 'error' : 'success',
      current_stage: input.currentStage ?? null,
      last_completed_stage: input.lastCompletedStage ?? null,
      failed_stage: input.failedStage ?? null,
      latency_ms: input.latencyMs,
      error: input.error,
      updated_at: new Date().toISOString(),
    };
    const operation = input.logId !== undefined && input.logId !== null
      ? supabaseAdmin.from('chat_logs').update(payload).eq('id', input.logId)
      : supabaseAdmin.from('chat_logs').insert(payload);
    const { error } = await operation;
    if (error) throw error;
  } catch (error) {
    console.error('Gagal menyimpan chat log', error);
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
