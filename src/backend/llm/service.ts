import { cleanModelText, isGreetingOnly, normalizeMessages, sanitizeInput } from './guardrails';
import { compactSessionMemory, getSessionMemory, recordExchange } from './memory';
import { buildFinalMessages } from './prompts';
import { callLLM, isProviderId, PROVIDERS } from './providers';
import { classifyIntents } from './router';
import { executeSQL, generateSQL, validateSQL } from './sql';
import { parseRetrievalQuery, retrieveSources } from './retriever';
import type { LLMIntent, Source } from './types';

type LLMRequestBody = {
  query?: unknown;
  provider?: unknown;
  apiKey?: unknown;
  sessionId?: unknown;
  messages?: unknown;
  debug?: unknown;
};

type LLMServiceResult = {
  body: Record<string, unknown>;
  status?: number;
};

export function genSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function handleLLMRequest(
  body: LLMRequestBody,
  fallbackSessionId = genSessionId(),
): Promise<LLMServiceResult> {
  const t0 = Date.now();
  let queryForLog = '';
  let routeForLog = '';
  const sessionId = fallbackSessionId;

  try {
    const query = typeof body.query === 'string' ? sanitizeInput(body.query) : '';
    const providerRaw = typeof body.provider === 'string' ? body.provider : 'groq';
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
    const sid = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : sessionId;
    const includeDebug = body.debug === true;

    queryForLog = query;

    if (!query) {
      return { body: { error: 'Query diperlukan' }, status: 400 };
    }

    if (!isProviderId(providerRaw)) {
      return { body: { error: `Provider tidak dikenal: ${providerRaw}` }, status: 400 };
    }

    const provider = providerRaw;
    const cfg = PROVIDERS[provider];
    if (cfg.needsKey && !apiKey) {
      return { body: { error: `API Key diperlukan untuk ${provider}` }, status: 400 };
    }

    const memory = await getSessionMemory(sid);
    const clientMessages = normalizeMessages(body.messages);
    const recentMessages = memory.recentMessages.length > 0 ? memory.recentMessages : clientMessages;

    let intents: LLMIntent[] = ['chat'];
    if (!isGreetingOnly(query)) {
      const routed = await classifyIntents(provider, apiKey, query, recentMessages);
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
          ...(includeDebug ? { debug: { intents, route: routeForLog, latencyMs: Date.now() - t0 } } : {}),
        },
      };
    }

    let sqlContext = '';
    let sqlGenerated = '';
    let sqlResult: unknown = null;

    if (intents.includes('sql')) {
      sqlGenerated = await generateSQL(provider, apiKey, query);
      if (validateSQL(sqlGenerated)) {
        const result = await executeSQL(sqlGenerated);
        sqlResult = result.data;
        sqlContext = result.data.length > 0
          ? `SQL: ${sqlGenerated}\nMeta: ${result.meta}\nHasil: ${JSON.stringify(result.data, null, 2)}`
          : `SQL: ${sqlGenerated}\nMeta: ${result.meta}\nHasil: []\nPeringatan: hasil SQL kosong. Jangan membuat angka statistik sendiri.`;
      } else {
        sqlContext = `SQL tidak valid dan tidak dieksekusi: ${sqlGenerated || '-'}\nPeringatan: jangan membuat angka statistik sendiri.`;
      }
    }

    let sources: Source[] = [];
    let searchInfo = '';

    if (intents.includes('rag')) {
      const parsed = await parseRetrievalQuery(provider, apiKey, query);
      const retrieval = await retrieveSources(provider, apiKey, query, {
        kecamatan: parsed.kecamatan,
        kategori: parsed.kategori,
        sentimen: parsed.sentimen,
      });
      sources = retrieval.sources;
      searchInfo = retrieval.searchInfo;
    }

    const finalMessages = buildFinalMessages({
      query,
      intents,
      memorySummary: memory.summary,
      recentMessages,
      sqlContext,
      ragSources: sources,
      searchInfo,
    });

    const answer = cleanModelText(await callLLM(provider, apiKey, finalMessages, 900, 0.3));

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

    compactSessionMemory(provider, apiKey, sid, memory.summary, memory.logCount + 1);

    return {
      body: {
        response: answer,
        sources,
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
    await recordExchange({
      sessionId,
      query: queryForLog,
      route: routeForLog,
      error,
      latencyMs: Date.now() - t0,
    });
    return { body: { error }, status: 500 };
  }
}
