import {
  cleanModelText,
  isGreetingOnly,
  isInProjectContext,
  OUT_OF_CONTEXT_RESPONSE,
  sanitizeInput,
} from './guardrails';
import { recordExchange } from './memory';
import { buildFinalMessages } from './prompts';
import { callLLM } from './providers';
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

type LLMServiceResult = {
  body: Record<string, unknown>;
  status?: number;
};

type LLMServiceOptions = {
  onStep?: (step: LLMProcessStep) => void;
};

function toFriendlyLLMError(error: string): string {
  const lowered = error.toLowerCase();
  if (lowered.includes('413') || lowered.includes('request too large') || lowered.includes('tokens per minute') || lowered.includes('tpm')) {
    return 'Maaf, permintaan terlalu besar untuk diproses saat ini. Coba ringkas pertanyaan atau mulai chat baru.';
  }
  if (lowered.includes('429') || lowered.includes('rate limit') || lowered.includes('quota')) {
    return 'Maaf, layanan AI sedang sibuk atau mencapai batas sementara. Coba lagi beberapa saat lagi.';
  }
  if (lowered.includes('tidak ada groq api key') || lowered.includes('semua groq api key')) {
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
  const sessionId = fallbackSessionId;
  const processSteps: LLMProcessStep[] = [];

  const emitStep = (id: LLMProcessStepId, label: string) => {
    const step = { id, label, elapsedMs: Date.now() - t0 };
    processSteps.push(step);
    options.onStep?.(step);
  };

  try {
    const query = typeof body.query === 'string' ? sanitizeInput(body.query) : '';
    const sid = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : sessionId;
    const includeDebug = body.debug === true;

    queryForLog = query;

    if (!query) {
      return { body: { error: 'Query diperlukan' }, status: 400 };
    }

    emitStep('understand', 'Memahami pertanyaan...');

    if (!isInProjectContext(query)) {
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
      const routed = await classifyIntents(query);
      intents = routed.intents;
    }

    if (!intents.includes('chat')) intents.push('chat');
    routeForLog = intents.join('+');

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

    if (intents.includes('sql')) {
      emitStep('analyze_data', 'Menganalisis data...');
      sqlGenerated = await generateSQL(query);
      if (validateSQL(sqlGenerated)) {
        const result = await executeSQL(sqlGenerated);
        sqlResult = result.data;
        sqlContext = result.data.length > 0
          ? `Data database (${result.meta}): ${JSON.stringify(result.data, null, 2)}`
          : `Data database (${result.meta}): []\nPeringatan: hasil database kosong. Jangan membuat angka statistik sendiri.`;
      } else {
        sqlContext = 'Data database tidak tersedia.\nPeringatan: jangan membuat angka statistik sendiri.';
      }
    }

    let sources: Source[] = [];
    let searchInfo = '';

    if (intents.includes('rag')) {
      emitStep('search_documents', 'Mencari konteks berita...');
      const parsed = await parseRetrievalQuery(query);
      const retrieval = await retrieveSources(query, {
        kecamatan: parsed.kecamatan,
        kategori: parsed.kategori,
        sentimen: parsed.sentimen,
      });
      sources = retrieval.sources;
      searchInfo = retrieval.searchInfo;
    }

    emitStep('compose_answer', 'Menyusun jawaban...');

    const finalMessages = buildFinalMessages({
      query,
      intents,
      recentMessages: [],
      sqlContext,
      ragSources: sources,
      searchInfo,
    });

    const answer = cleanModelText(await callLLM(finalMessages, 650, 0.3), query);

    await recordExchange({
      sessionId: sid,
      query,
      route: routeForLog,
      response: answer,
      sqlGenerated,
      sqlResult,
      sources,
      latencyMs: Date.now() - t0,
    });

    return {
      body: {
        response: answer,
        sources,
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
      sessionId,
      query: queryForLog,
      route: routeForLog,
      error,
      latencyMs: Date.now() - t0,
    });
    return { body: { error: friendlyError }, status: 500 };
  }
}
