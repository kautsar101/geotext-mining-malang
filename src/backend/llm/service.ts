import {
  cleanModelText,
  isGreetingOnly,
  isInProjectContext,
  OUT_OF_CONTEXT_RESPONSE,
  sanitizeInput,
} from './guardrails';
import {
  checkpointExchange,
  getSessionMemory,
  recordExchange,
  startExchange,
  type ChatLogId,
  type StoredProcessStep,
} from './memory';
import { buildFinalMessages } from './prompts';
import { callLLM, getLLMModel, type LLMCallConfig } from './providers';
import { classifyIntents, type QueryPlan } from './router';
import { compilePlanToSQL, executeQueryPlan } from './sql';
import { parseRetrievalQuery, retrieveSources } from './retriever';
import type { LLMIntent, LLMProcessStep, LLMProcessStepId, Source } from './types';

type LLMRequestBody = {
  query?: unknown;
  sessionId?: unknown;
  messages?: unknown;
  debug?: unknown;
};

export type LLMMode = 'guest' | 'admin';

type LLMServiceResult = {
  body: Record<string, unknown>;
  status?: number;
};

type LLMServiceOptions = {
  onStep?: (step: LLMProcessStep) => void;
  mode?: LLMMode;
};

type TablePanelRow = {
  reference: number;
  title: string;
  url: string;
  content: string;
};

type TablePanel = {
  type: 'sql' | 'rag';
  rows: TablePanelRow[];
};

const KECAMATAN_LABELS: Record<string, string> = {
  ampelgading: 'Ampelgading',
  bantur: 'Bantur',
  bululawang: 'Bululawang',
  dampit: 'Dampit',
  dau: 'Dau',
  donomulyo: 'Donomulyo',
  gedangan: 'Gedangan',
  gondanglegi: 'Gondanglegi',
  jabung: 'Jabung',
  kalipare: 'Kalipare',
  karangploso: 'Karangploso',
  kasembon: 'Kasembon',
  kepanjen: 'Kepanjen',
  kromengan: 'Kromengan',
  lawang: 'Lawang',
  ngajum: 'Ngajum',
  ngantang: 'Ngantang',
  pagak: 'Pagak',
  pagelaran: 'Pagelaran',
  pakis: 'Pakis',
  pakisaji: 'Pakisaji',
  poncokusumo: 'Poncokusumo',
  pujon: 'Pujon',
  singosari: 'Singosari',
  'sumbermanjing wetan': 'Sumbermanjing Wetan',
  sumberpucung: 'Sumberpucung',
  tajinan: 'Tajinan',
  tirtoyudo: 'Tirtoyudo',
  tumpang: 'Tumpang',
  turen: 'Turen',
  wagir: 'Wagir',
  wajak: 'Wajak',
  wonosari: 'Wonosari',
};

function formatFilterScope(plan: QueryPlan): string {
  const details: string[] = [];
  if (plan.filters.kategori) details.push(`kategori ${plan.filters.kategori}`);
  if (plan.filters.sentimen) {
    const labels = { positive: 'positif', negative: 'negatif', neutral: 'netral' };
    details.push(`sentimen ${labels[plan.filters.sentimen]}`);
  }
  if (plan.filters.kecamatan) details.push(`Kecamatan ${KECAMATAN_LABELS[plan.filters.kecamatan] || plan.filters.kecamatan}`);
  if (plan.filters.temporalLabel) details.push(plan.filters.temporalLabel);
  return details.length > 0 ? ` untuk ${details.join(', ')}` : '';
}

function formatDirectCountAnswer(plan: QueryPlan, sqlResult: unknown): string | null {
  if (!Array.isArray(sqlResult)) return null;
  const firstRow = sqlResult[0] as Record<string, unknown> | undefined;
  const count = Number(firstRow?.count);
  if (!Number.isFinite(count)) return null;
  const scope = formatFilterScope(plan);
  return count === 0
    ? `Tidak ditemukan berita${scope}.`
    : `Terdapat ${count} berita${scope}.`;
}

function summarizeContent(value: unknown): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  const firstSentence = normalized.match(/^.{1,320}?[.!?](?:\s|$)/)?.[0]?.trim();
  if (firstSentence) return firstSentence;
  if (normalized.length <= 280) return normalized;
  const shortened = normalized.slice(0, 280);
  const boundary = shortened.lastIndexOf(' ');
  return `${shortened.slice(0, boundary > 180 ? boundary : 280).trim()}…`;
}

function formatNewsListAnswer(plan: QueryPlan, sqlResult: unknown): string | null {
  if (!Array.isArray(sqlResult)) return null;
  if (sqlResult.length === 0) return `Tidak ditemukan berita${formatFilterScope(plan)}.`;

  const rows = sqlResult as Record<string, unknown>[];
  const items = rows.slice(0, 10).map((row, index) => {
    const title = String(row.title || 'Berita tanpa judul').trim();
    const content = summarizeContent(row.content_clean);
    const details = [
      row.published_date ? `Tanggal: ${String(row.published_date).slice(0, 10)}` : '',
      row.primary_kecamatan ? `Kecamatan: ${String(row.primary_kecamatan)}` : '',
      row.source ? `Sumber: ${String(row.source)}` : '',
    ].filter(Boolean).join(' | ');
    const summary = content ? ` ${content}${/[.!?…]$/.test(content) ? '' : '.'}` : '';
    return `${index + 1}. **${title}**.${summary}${details ? ` ${details}.` : ''} [${index + 1}]`;
  });

  return `Berikut berita yang ditemukan${formatFilterScope(plan)}:\n\n${items.join('\n\n')}`;
}

function formatRagFallbackAnswer(plan: QueryPlan, sources: Source[]): string {
  if (sources.length === 0) return `Tidak ditemukan berita${formatFilterScope(plan)}.`;
  const items = sources.slice(0, 10).map((source, index) => {
    const summary = summarizeContent(source.snippet);
    return `${index + 1}. **${source.title || 'Berita tanpa judul'}**.${summary ? ` ${summary}` : ''} [${source.id}]`;
  });
  return `Berikut berita yang paling relevan${formatFilterScope(plan)}:\n\n${items.join('\n\n')}`;
}

function formatGroupAnswer(plan: QueryPlan, sqlResult: unknown): string | null {
  if (!Array.isArray(sqlResult) || !plan.groupBy) return null;
  const rows = sqlResult as Record<string, unknown>[];
  const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  if (total === 0) return `Tidak ditemukan berita${formatFilterScope(plan)}.`;

  const labels: Record<string, string> = {
    category: 'kategori',
    sentiment: 'sentimen',
    primary_kecamatan: 'kecamatan',
    published_date: 'tanggal',
    positive: 'positif',
    negative: 'negatif',
    neutral: 'netral',
  };
  const items = rows.map((row) => {
    const value = String(row[plan.groupBy as string] || '-');
    const count = Number(row.total || 0);
    const percentage = (count / total) * 100;
    return `- **${labels[value] || value}**: ${count} berita (${percentage.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%)`;
  });
  return `Distribusi berdasarkan ${labels[plan.groupBy] || plan.groupBy}${formatFilterScope(plan)}:\n\n${items.join('\n')}`;
}

function getCitationOrder(answer: string): number[] {
  const seen = new Set<number>();
  const citations: number[] = [];

  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const id = Number(match[1]);
    if (Number.isInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      citations.push(id);
    }
  }

  return citations;
}

function toFriendlyLLMError(error: string): string {
  const lowered = error.toLowerCase();
  if (lowered.includes('finish_reason: length') || lowered.includes('mencapai max_tokens')) {
    return 'Maaf, jawaban AI mencapai batas panjang. Coba buat pertanyaan lebih spesifik.';
  }
  if (lowered.includes('413') || lowered.includes('request too large') || lowered.includes('tokens per minute') || lowered.includes('tpm')) {
    return 'Maaf, permintaan terlalu besar untuk diproses saat ini. Coba ringkas pertanyaan atau mulai chat baru.';
  }
  if (lowered.includes('429') || lowered.includes('rate limit') || lowered.includes('quota')) {
    return 'Maaf, layanan AI sedang sibuk atau mencapai batas sementara. Coba lagi beberapa saat lagi.';
  }
  if (lowered.includes('401') || lowered.includes('403') || lowered.includes('invalid api key') || lowered.includes('unauthorized')) {
    return 'Maaf, layanan AI sedang tidak tersedia. Coba lagi nanti.';
  }
  if (lowered.includes('tidak ada groq api key') || lowered.includes('semua groq api key') || lowered.includes('tidak ada deepseek api key') || lowered.includes('semua deepseek api key')) {
    return 'Maaf, layanan AI sedang tidak tersedia. Coba lagi nanti.';
  }
  if (lowered.includes('empty response')) {
    return 'Maaf, AI belum menghasilkan jawaban. Coba ulangi pertanyaan dengan sedikit lebih spesifik.';
  }
  return 'Maaf, terjadi kendala saat memproses jawaban. Coba lagi beberapa saat lagi.';
}

export function genSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function handleLLMRequest(
  body: LLMRequestBody,
  fallbackSessionId = genSessionId(),
  options: LLMServiceOptions = {},
): Promise<LLMServiceResult> {
  const t0 = Date.now();
  let queryForLog = '';
  let routeForLog = '';
  let activeSessionId = fallbackSessionId;
  const mode = options.mode === 'admin' ? 'admin' : 'guest';
  const provider = mode === 'admin' ? 'deepseek' : 'groq';
  const model = getLLMModel(provider);
  const processSteps: LLMProcessStep[] = [];
  const storedProcessSteps: StoredProcessStep[] = [];
  let logId: ChatLogId | null = null;
  let currentStageForLog: string | null = 'request_received';
  let lastCompletedStageForLog: string | null = null;
  let routingReasonForLog: string | undefined;
  let queryPlanForLog: QueryPlan | undefined;
  let sqlGeneratedForLog: string | undefined;
  let sqlResultForLog: unknown;
  let sourcesForLog: Source[] = [];
  let embeddingDebugForLog: unknown;
  let providerDebugForLog: Record<string, unknown> | undefined;

  const completeActiveStep = () => {
    const activeStep = storedProcessSteps.at(-1);
    if (!activeStep || activeStep.status !== 'running') return;
    activeStep.status = 'completed';
    activeStep.finishedAtMs = Date.now() - t0;
    activeStep.durationMs = activeStep.finishedAtMs - activeStep.startedAtMs;
    lastCompletedStageForLog = activeStep.id;
  };

  const failActiveStep = (error: string) => {
    const activeStep = storedProcessSteps.at(-1);
    if (!activeStep || activeStep.status !== 'running') return;
    activeStep.status = 'failed';
    activeStep.finishedAtMs = Date.now() - t0;
    activeStep.durationMs = activeStep.finishedAtMs - activeStep.startedAtMs;
    activeStep.error = error;
  };

  const emitStep = (id: LLMProcessStepId, label: string) => {
    completeActiveStep();
    const step = { id, label, elapsedMs: Date.now() - t0 };
    processSteps.push(step);
    storedProcessSteps.push({
      id,
      label,
      status: 'running',
      startedAtMs: step.elapsedMs,
    });
    currentStageForLog = id;
    options.onStep?.(step);
  };

  const saveCheckpoint = async () => checkpointExchange(logId, {
    route: routeForLog,
    routingReason: routingReasonForLog,
    queryPlan: queryPlanForLog,
    sqlGenerated: sqlGeneratedForLog,
    sqlResult: sqlResultForLog,
    sources: sourcesForLog,
    embeddingDebug: embeddingDebugForLog,
    providerDebug: providerDebugForLog,
    processSteps: storedProcessSteps,
    currentStage: currentStageForLog,
    lastCompletedStage: lastCompletedStageForLog,
  });

  try {
    const query = typeof body.query === 'string' ? sanitizeInput(body.query) : '';
    const sid = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : fallbackSessionId;
    const includeDebug = body.debug === true;
    const callConfig: LLMCallConfig = { provider };

    queryForLog = query;

    if (!query) {
      return { body: { error: 'Query diperlukan' }, status: 400 };
    }

    activeSessionId = sid;
    currentStageForLog = 'load_memory';
    logId = await startExchange({
      sessionId: sid,
      query,
      provider,
      model,
      currentStage: currentStageForLog,
    });
    const memory = await getSessionMemory(sid, mode === 'admin' ? 10 : 5);
    lastCompletedStageForLog = 'load_memory';
    const recentMessages = memory.recentMessages;

    emitStep('understand', 'Memahami pertanyaan...');

    if (!isInProjectContext(query, recentMessages)) {
      routeForLog = 'out_of_context';
      completeActiveStep();
      currentStageForLog = null;
      await recordExchange({
        logId,
        sessionId: sid,
        query,
        route: routeForLog,
        provider,
        model,
        response: OUT_OF_CONTEXT_RESPONSE,
        processSteps: storedProcessSteps,
        currentStage: currentStageForLog,
        lastCompletedStage: lastCompletedStageForLog,
        latencyMs: Date.now() - t0,
      });

      return {
        body: {
          response: OUT_OF_CONTEXT_RESPONSE,
          sources: [],
          processSteps,
          ...(includeDebug ? { debug: { intents: [], route: routeForLog, latencyMs: Date.now() - t0 } } : {}),
        },
      };
    }

    let intents: LLMIntent[] = ['chat'];
    let queryPlan: QueryPlan = {
      operation: 'chat',
      groupBy: null,
      intents: ['chat'],
      filters: {
        topic: [],
        kecamatan: null,
        kategori: null,
        sentimen: null,
        dateFrom: null,
        dateTo: null,
        temporalLabel: null,
      },
      sort: null,
      limit: 10,
      confidence: 1,
      inheritedContext: false,
    };
    if (!isGreetingOnly(query)) {
      emitStep('classify_request', 'Menentukan informasi yang diperlukan...');
      await saveCheckpoint();
      const routed = await classifyIntents(query, callConfig, { recentMessages });
      intents = routed.intents;
      queryPlan = routed.plan;
      routingReasonForLog = routed.reason;
      providerDebugForLog = routed.error
        ? { router: { status: 'fallback', provider, model, error: routed.error } }
        : { router: { status: 'success', provider, model } };
    }

    if (!intents.includes('chat')) intents.push('chat');
    routeForLog = `${intents.join('+')}:${callConfig.provider}`;
    queryPlanForLog = queryPlan;
    completeActiveStep();
    currentStageForLog = null;
    await saveCheckpoint();

    if (isGreetingOnly(query) && intents.length === 1 && intents[0] === 'chat') {
      const response = 'Halo! Saya bisa bantu cari berita daerah, hitung statistik berita, atau menjelaskan hasilnya.';
      completeActiveStep();
      currentStageForLog = null;
      await recordExchange({
        logId,
        sessionId: sid,
        query,
        route: routeForLog,
        provider,
        model,
        queryPlan,
        response,
        processSteps: storedProcessSteps,
        currentStage: currentStageForLog,
        lastCompletedStage: lastCompletedStageForLog,
        latencyMs: Date.now() - t0,
      });

      return {
        body: {
          response,
          sources: [],
          processSteps,
          ...(includeDebug ? { debug: { intents, route: routeForLog, latencyMs: Date.now() - t0 } } : {}),
        },
      };
    }

    let sqlContext = '';
    let sqlGenerated = '';
    let sqlResult: unknown = null;
    let sqlMeta = '';

    if (intents.includes('sql')) {
      emitStep('analyze_data', 'Menentukan data yang perlu dihitung...');
      sqlGenerated = compilePlanToSQL(queryPlan);
      emitStep('validate_query', 'Memeriksa kebutuhan data...');
      emitStep('query_database', 'Mengambil data dari database...');
      sqlGeneratedForLog = sqlGenerated;
      await saveCheckpoint();
      const result = await executeQueryPlan(queryPlan);
      sqlResult = result.data;
      sqlResultForLog = sqlResult;
      sqlMeta = result.meta;
      emitStep('validate_data', 'Memeriksa hasil data...');
      sqlContext = result.data.length > 0
        ? `Data database (${result.meta}): ${JSON.stringify(result.data, null, 2)}`
        : `Data database (${result.meta}): []\nPeringatan: hasil database kosong. Jangan membuat angka statistik sendiri.`;
      completeActiveStep();
      currentStageForLog = null;
      await saveCheckpoint();
    }

    let sources: Source[] = [];
    let searchInfo = '';
    let embeddingDebug: unknown;
    // ponytail: inline type — only used here and in response body (Record<string,unknown>)
    let tablePanel: TablePanel | undefined;

    if (intents.includes('rag')) {
      emitStep('parse_query', 'Mengenali topik, lokasi, kategori, dan periode...');
      const parsed = await parseRetrievalQuery(query);
      emitStep('search_documents', 'Mencari berita yang sesuai...');
      await saveCheckpoint();
      const retrieval = await retrieveSources(queryPlan.filters.topic.join(' ') || query, {
        kecamatan: queryPlan.filters.kecamatan || parsed.kecamatan,
        kategori: queryPlan.filters.kategori || parsed.kategori,
        sentimen: queryPlan.filters.sentimen || parsed.sentimen,
        dateFrom: queryPlan.filters.dateFrom,
        dateTo: queryPlan.filters.dateTo,
      }, mode === 'admin' ? 20 : 10, includeDebug, emitStep);
      sources = retrieval.sources;
      searchInfo = retrieval.searchInfo;
      embeddingDebug = retrieval.embeddingDebug;
      sourcesForLog = sources;
      embeddingDebugForLog = { queryPlan, retrieval: embeddingDebug };
      completeActiveStep();
      currentStageForLog = null;
      await saveCheckpoint();
    }

    // Map tablePanel dari SQL result (SELECT only) atau RAG sources
    // ponytail: RAG panel hanya muncul kalo ada keyword/semantic match, bukan fallback terbaru
    if (sqlMeta === 'select' && Array.isArray(sqlResult) && sqlResult.length > 0) {
      tablePanel = {
        type: 'sql',
        rows: (sqlResult as Record<string, unknown>[]).map((row, index) => ({
          reference: index + 1,
          title: String(row.title ?? ''),
          url: String(row.url ?? ''),
          content: String(row.content_clean ?? row.snippet ?? ''),
        })),
      };
      // ponytail: override sources with SQL data so citation [N] links match SQL results
      sources = (sqlResult as Record<string, unknown>[]).map((row: Record<string, unknown>, i: number) => ({
        id: i + 1,
        articleId: typeof row.id === 'number' ? row.id : undefined,
        title: String(row.title ?? ''),
        snippet: String(row.content_clean ?? ''),
        url: String(row.url ?? ''),
        source: String(row.source ?? ''),
        date: String(row.published_date ?? ''),
        kecamatan: String(row.primary_kecamatan ?? ''),
        category: String(row.category ?? ''),
        sentiment: String(row.sentiment ?? ''),
      }));
      sourcesForLog = sources;
    } else if (sources.length > 0 && !searchInfo.includes('terbaru')) {
      tablePanel = {
        type: 'rag',
        rows: sources.map(s => ({
          reference: s.id,
          title: s.title ?? 'Sumber ' + s.id,
          url: s.url ?? '',
          content: (s.snippet ?? ''),
        })),
      };
    }

    if (intents.includes('sql') || intents.includes('rag')) {
      emitStep('combine_context', 'Menggabungkan berita dan data yang ditemukan...');
    }

    emitStep('compose_answer', 'Menyusun jawaban...');

    const directAnswer = sqlMeta === 'count' && !intents.includes('rag')
      ? formatDirectCountAnswer(queryPlan, sqlResult)
      : null;
    const listAnswer = sqlMeta === 'select' && !intents.includes('rag')
      ? formatNewsListAnswer(queryPlan, sqlResult)
      : null;
    const groupAnswer = sqlMeta === 'group' && !intents.includes('rag')
      ? formatGroupAnswer(queryPlan, sqlResult)
      : null;
    const deterministicAnswer = directAnswer || listAnswer || groupAnswer;
    if (deterministicAnswer) {
      emitStep('format_answer', 'Merapikan jawaban dan sumber...');
      completeActiveStep();
      currentStageForLog = null;
      await recordExchange({
        logId,
        sessionId: sid,
        query,
        route: routeForLog,
        provider,
        model,
        routingReason: routingReasonForLog,
        queryPlan,
        response: deterministicAnswer,
        sqlGenerated,
        sqlResult,
        sources,
        embeddingDebug: { queryPlan, retrieval: embeddingDebug || null },
        providerDebug: providerDebugForLog,
        processSteps: storedProcessSteps,
        currentStage: currentStageForLog,
        lastCompletedStage: lastCompletedStageForLog,
        latencyMs: Date.now() - t0,
      });

      return {
        body: {
          response: deterministicAnswer,
          sources,
          tablePanel,
          processSteps,
          ...(includeDebug
            ? {
                debug: {
                  intents,
                  route: routeForLog,
                  sql: sqlGenerated || null,
                  sqlResult,
                  searchInfo: searchInfo || null,
                  sourcesCount: sources.length,
                  queryPlan,
                  embeddingDebug: embeddingDebug || null,
                  latencyMs: Date.now() - t0,
                },
              }
            : {}),
        },
      };
    }

    const finalMessages = buildFinalMessages({
      query,
      intents,
      recentMessages,
      sqlContext,
      ragSources: sources,
      searchInfo,
      memorySummary: memory.summary,
    });

    let answer: string;
    currentStageForLog = 'final_llm';
    providerDebugForLog = {
      ...providerDebugForLog,
      finalAnswer: {
        status: 'running',
        provider,
        model,
        maxTokens: mode === 'admin' ? 1400 : 650,
      },
    };
    await saveCheckpoint();
    try {
      const rawAnswer = await callLLM(finalMessages, mode === 'admin' ? 1400 : 650, 0.3, callConfig);
      answer = cleanModelText(rawAnswer, query);
      providerDebugForLog = {
        ...providerDebugForLog,
        finalAnswer: {
          status: 'success',
          provider,
          model,
          maxTokens: mode === 'admin' ? 1400 : 650,
        },
      };
    } catch (error) {
      const providerError = error instanceof Error ? error.message : 'Final LLM call gagal';
      providerDebugForLog = {
        ...providerDebugForLog,
        finalAnswer: {
          status: 'error',
          provider,
          model,
          maxTokens: mode === 'admin' ? 1400 : 650,
          error: providerError,
          fallbackUsed: sources.length > 0,
        },
      };
      if (sources.length === 0) throw error;
      answer = formatRagFallbackAnswer(queryPlan, sources);
    }
    emitStep('format_answer', 'Merapikan jawaban dan sumber...');

    if (tablePanel?.type === 'rag') {
      const citedSourceIds = getCitationOrder(answer);
      const citedRows = citedSourceIds
        .map((id) => sources.find((source) => source.id === id))
        .filter((source): source is Source => Boolean(source))
        .map((source) => ({
          reference: source.id,
          title: source.title ?? `Sumber ${source.id}`,
          url: source.url ?? '',
          content: source.snippet ?? '',
        }));

      // Panel hanya menampilkan sumber yang benar-benar dipakai jawaban, sesuai urutan citation.
      tablePanel = citedRows.length > 0 ? { type: 'rag', rows: citedRows } : undefined;
    }

    completeActiveStep();
    currentStageForLog = null;
    await recordExchange({
      logId,
      sessionId: sid,
      query,
      route: routeForLog,
      provider,
      model,
      routingReason: routingReasonForLog,
      queryPlan,
      response: answer,
      sqlGenerated,
      sqlResult,
      sources,
      embeddingDebug: { queryPlan, retrieval: embeddingDebug || null },
      providerDebug: providerDebugForLog,
      processSteps: storedProcessSteps,
      currentStage: currentStageForLog,
      lastCompletedStage: lastCompletedStageForLog,
      latencyMs: Date.now() - t0,
    });

    return {
      body: {
        response: answer,
        sources,
        tablePanel,
        processSteps,
        ...(includeDebug
          ? {
              debug: {
                intents,
                route: routeForLog,
                sql: sqlGenerated || null,
                sqlResult,
                searchInfo: searchInfo || null,
                sourcesCount: sources.length,
                queryPlan,
                embeddingDebug: embeddingDebug || null,
                latencyMs: Date.now() - t0,
              },
            }
          : {}),
      },
    };
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : 'Internal error';
    const friendlyError = toFriendlyLLMError(error);
    const failedStage = currentStageForLog || storedProcessSteps.at(-1)?.id || 'unknown';
    failActiveStep(error);
    await recordExchange({
      logId,
      sessionId: activeSessionId,
      query: queryForLog,
      route: routeForLog,
      provider,
      model,
      routingReason: routingReasonForLog,
      queryPlan: queryPlanForLog,
      sqlGenerated: sqlGeneratedForLog,
      sqlResult: sqlResultForLog,
      sources: sourcesForLog,
      embeddingDebug: embeddingDebugForLog,
      providerDebug: providerDebugForLog,
      processSteps: storedProcessSteps,
      currentStage: failedStage,
      lastCompletedStage: lastCompletedStageForLog,
      failedStage,
      error,
      latencyMs: Date.now() - t0,
    });
    return { body: { error: friendlyError }, status: 500 };
  }
}
