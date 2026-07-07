import { NextRequest, NextResponse } from 'next/server';
import { cleanModelText, isGreetingOnly, normalizeMessages, sanitizeInput } from '@/lib/llm/guardrails';
import { compactSessionMemory, getSessionMemory, recordExchange } from '@/lib/llm/memory';
import { buildFinalMessages } from '@/lib/llm/prompts';
import { callLLM, isProviderId, PROVIDERS } from '@/lib/llm/providers';
import { classifyIntents } from '@/lib/llm/router';
import { executeSQL, generateSQL, validateSQL } from '@/lib/llm/sql';
import { parseRetrievalQuery, retrieveSources } from '@/lib/llm/retriever';
import type { LLMIntent, Source } from '@/lib/llm/types';

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const sessionId = request.headers.get('x-session-id') || genId();
  let queryForLog = '';
  let routeForLog = '';

  try {
    const body = await request.json();
    const query = typeof body.query === 'string' ? sanitizeInput(body.query) : '';
    const providerRaw = typeof body.provider === 'string' ? body.provider : 'groq';
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
    const sid = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : sessionId;
    const includeDebug = body.debug === true;

    queryForLog = query;

    if (!query) {
      return NextResponse.json({ error: 'Query diperlukan' }, { status: 400 });
    }

    if (!isProviderId(providerRaw)) {
      return NextResponse.json({ error: `Provider tidak dikenal: ${providerRaw}` }, { status: 400 });
    }

    const provider = providerRaw;
    const cfg = PROVIDERS[provider];
    if (cfg.needsKey && !apiKey) {
      return NextResponse.json({ error: `API Key diperlukan untuk ${provider}` }, { status: 400 });
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
      return NextResponse.json({
        response,
        sources: [],
        ...(includeDebug ? { debug: { intents, route: routeForLog, latencyMs: Date.now() - t0 } } : {}),
      });
    }

    let sqlContext = '';
    let sqlGenerated = '';
    let sqlResult: unknown = null;

    if (intents.includes('sql')) {
      sqlGenerated = await generateSQL(provider, apiKey, query);
      if (validateSQL(sqlGenerated)) {
        const result = await executeSQL(sqlGenerated);
        sqlResult = result.data;
        sqlContext = `SQL: ${sqlGenerated}\nMeta: ${result.meta}\nHasil: ${JSON.stringify(result.data, null, 2)}`;
      } else {
        sqlContext = 'SQL tidak valid, jadi statistik tidak dieksekusi.';
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

    return NextResponse.json({
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
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : 'Internal error';
    await recordExchange({
      sessionId,
      query: queryForLog,
      route: routeForLog,
      error,
      latencyMs: Date.now() - t0,
    });
    return NextResponse.json({ error }, { status: 500 });
  }
}
