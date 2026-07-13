import {
  cleanModelText,
  isGreetingOnly,
  isContextualFollowUp,
  isInProjectContext,
  normalizeQueryText,
  OUT_OF_CONTEXT_RESPONSE,
  sanitizeInput,
} from './guardrails';
import { getSessionMemory, recordExchange } from './memory';
import { buildFinalMessages } from './prompts';
import { callLLM, type LLMCallConfig } from './providers';
import { classifyIntents } from './router';
import { executeSQL, generateSQL, validateSQL } from './sql';
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

function buildContextualQuery(query: string, recentMessages: { role: string; content: string }[]): string {
  if (!isContextualFollowUp(query)) return query;

  const previousUserQueries = recentMessages
    .filter((message) => message.role === 'user')
    .slice(-2)
    .map((message) => message.content.trim())
    .filter(Boolean);

  if (previousUserQueries.length === 0) return query;
  return `${previousUserQueries.join(' ')}\nPertanyaan lanjutan: ${query}`;
}

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

function formatDirectCountAnswer(query: string, sqlResult: unknown): string | null {
  if (!Array.isArray(sqlResult)) return null;
  const firstRow = sqlResult[0] as Record<string, unknown> | undefined;
  const count = Number(firstRow?.count);
  if (!Number.isFinite(count)) return null;

  const lowered = normalizeQueryText(query);
  const category = ['kesehatan', 'pendidikan', 'ekonomi', 'sosial'].find((value) => lowered.includes(value));
  const sentiment = lowered.includes('positif')
    ? 'positif'
    : lowered.includes('negatif')
      ? 'negatif'
      : lowered.includes('netral')
        ? 'netral'
        : null;
  const kecamatan = Object.keys(KECAMATAN_LABELS).find((value) => lowered.includes(value));

  const subject = [
    'berita',
    category ? category : '',
    sentiment ? `dengan sentimen ${sentiment}` : '',
  ].filter(Boolean).join(' ');
  const location = kecamatan ? ` di Kecamatan ${KECAMATAN_LABELS[kecamatan]}` : '';

  if (count === 0) {
    return `Belum ada ${subject}${location}.`;
  }

  return `Ada ${count} ${subject}${location}.`;
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
  const processSteps: LLMProcessStep[] = [];

  const emitStep = (id: LLMProcessStepId, label: string) => {
    const step = { id, label, elapsedMs: Date.now() - t0 };
    processSteps.push(step);
    options.onStep?.(step);
  };

  try {
    const query = typeof body.query === 'string' ? sanitizeInput(body.query) : '';
    const sid = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : fallbackSessionId;
    const includeDebug = body.debug === true;
    const callConfig: LLMCallConfig = { provider: mode === 'admin' ? 'deepseek' : 'groq' };

    queryForLog = query;

    if (!query) {
      return { body: { error: 'Query diperlukan' }, status: 400 };
    }

    activeSessionId = sid;
    const memory = await getSessionMemory(sid, mode === 'admin' ? 10 : 5);
    const recentMessages = memory.recentMessages;
    const contextualQuery = buildContextualQuery(query, recentMessages);

    emitStep('understand', 'Memahami pertanyaan...');

    if (!isInProjectContext(query, recentMessages)) {
      routeForLog = 'out_of_context';
      await recordExchange({
        sessionId: sid,
        query,
        route: routeForLog,
        response: OUT_OF_CONTEXT_RESPONSE,
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
    if (!isGreetingOnly(query)) {
      const routed = await classifyIntents(contextualQuery);
      intents = routed.intents;
    }

    if (!intents.includes('chat')) intents.push('chat');
    routeForLog = `${intents.join('+')}:${callConfig.provider}`;

    if (isGreetingOnly(query) && intents.length === 1 && intents[0] === 'chat') {
      const response = 'Halo! Saya bisa bantu cari berita daerah, hitung statistik berita, atau menjelaskan hasilnya.';
      await recordExchange({
        sessionId: sid,
        query,
        route: routeForLog,
        response,
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
      emitStep('analyze_data', 'Menganalisis data...');
      sqlGenerated = await generateSQL(contextualQuery, callConfig);
      if (validateSQL(sqlGenerated)) {
        const result = await executeSQL(sqlGenerated);
        sqlResult = result.data;
        sqlMeta = result.meta;
        sqlContext = result.data.length > 0
          ? `Data database (${result.meta}): ${JSON.stringify(result.data, null, 2)}`
          : `Data database (${result.meta}): []\nPeringatan: hasil database kosong. Jangan membuat angka statistik sendiri.`;
      } else {
        sqlContext = 'Data database tidak tersedia.\nPeringatan: jangan membuat angka statistik sendiri.';
      }
    }

    let sources: Source[] = [];
    let searchInfo = '';
    let embeddingDebug: unknown;
    // ponytail: inline type — only used here and in response body (Record<string,unknown>)
    let tablePanel: TablePanel | undefined;

    if (intents.includes('rag')) {
      emitStep('search_documents', 'Mencari konteks berita...');
      const parsed = await parseRetrievalQuery(contextualQuery);
      const retrieval = await retrieveSources(contextualQuery, {
        kecamatan: parsed.kecamatan,
        kategori: parsed.kategori,
        sentimen: parsed.sentimen,
      }, mode === 'admin' ? 20 : 10, includeDebug);
      sources = retrieval.sources;
      searchInfo = retrieval.searchInfo;
      embeddingDebug = retrieval.embeddingDebug;
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
        title: String(row.title ?? ''),
        url: String(row.url ?? ''),
        source: String(row.source ?? ''),
      }));
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

    emitStep('compose_answer', 'Menyusun jawaban...');

    const directAnswer = sqlMeta === 'count' && !intents.includes('rag')
      ? formatDirectCountAnswer(contextualQuery, sqlResult)
      : null;
    if (directAnswer) {
      await recordExchange({
        sessionId: sid,
        query,
        route: routeForLog,
        response: directAnswer,
        sqlGenerated,
        sqlResult,
        sources,
        embeddingDebug,
        latencyMs: Date.now() - t0,
      });

      return {
        body: {
          response: directAnswer,
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

    const answer = cleanModelText(await callLLM(finalMessages, mode === 'admin' ? 1400 : 650, 0.3, callConfig), query);

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

    await recordExchange({
      sessionId: sid,
      query,
      route: routeForLog,
      response: answer,
      sqlGenerated,
      sqlResult,
      sources,
      embeddingDebug,
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
    await recordExchange({
      sessionId: activeSessionId,
      query: queryForLog,
      route: routeForLog,
      error,
      latencyMs: Date.now() - t0,
    });
    return { body: { error: friendlyError }, status: 500 };
  }
}
