import { safeJsonParse } from './guardrails';
import { callLLM, type LLMCallConfig } from './providers';
import type { LLMIntent } from './types';

export type RouteCapability =
  | 'news_lookup'
  | 'statistics'
  | 'trend_analysis'
  | 'contextual_follow_up'
  | 'general_chat';

export type TemporalPlan = {
  kind: 'none' | 'relative' | 'latest_available';
  value?: 'today' | 'yesterday' | 'last_24_hours' | 'latest';
};

export type QueryPlan = {
  capabilities: RouteCapability[];
  intents: LLMIntent[];
  filters: {
    topic: string[];
    kecamatan: string | null;
    kategori: string | null;
    sentimen: string | null;
  };
  temporal: TemporalPlan;
  confidence: number;
};

type RouterResult = {
  intents: LLMIntent[];
  plan: QueryPlan;
  reason?: string;
};

const CAPABILITIES = new Set<RouteCapability>([
  'news_lookup',
  'statistics',
  'trend_analysis',
  'contextual_follow_up',
  'general_chat',
]);

const TEMPORAL_ALIASES: Array<[RegExp, string]> = [
  [/\b24\s*jam\s*(terakhir)?\b/g, '24 jam terakhir'],
  [/\bhariini\b/g, 'hari ini'],
  [/\bharini\b/g, 'hari ini'],
  [/\bkemaren\b/g, 'kemarin'],
  [/\bterbaruu+\b/g, 'terbaru'],
  [/\bterkinii+\b/g, 'terkini'],
  [/\bterkahir\b/g, 'terakhir'],
];

export function normalizeTemporalQuery(query: string): string {
  return TEMPORAL_ALIASES.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    query.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim(),
  );
}

export function isLatestNewsQuery(query: string): boolean {
  const normalized = normalizeTemporalQuery(query);
  return /\b(hari ini|kemarin|24 jam|sehari terakhir|terbaru|terkini|paling baru|update terbaru)\b/i.test(normalized);
}

function inferTemporal(query: string): TemporalPlan {
  const normalized = normalizeTemporalQuery(query);
  if (/\b24 jam|sehari terakhir\b/i.test(normalized)) {
    return { kind: 'relative', value: 'last_24_hours' };
  }
  if (/\bhari ini\b/i.test(normalized)) return { kind: 'relative', value: 'today' };
  if (/\bkemarin\b/i.test(normalized)) return { kind: 'relative', value: 'yesterday' };
  if (/\b(terbaru|terkini|paling baru|update terbaru)\b/i.test(normalized)) {
    return { kind: 'latest_available', value: 'latest' };
  }
  return { kind: 'none' };
}

function fallbackPlan(query: string): QueryPlan {
  const normalized = normalizeTemporalQuery(query);
  const temporal = inferTemporal(normalized);
  const asksAggregate = /\b(berapa|jumlah|total|statistik|rata-rata|ranking|urutan|terbanyak|tersedikit|bandingkan|persentase)\b/i.test(normalized);
  const asksDocuments = /\b(carikan|cari|daftar|list|artikel|sumber|link|judul|berita|kejadian|kasus|isu)\b/i.test(normalized);
  const asksTrend = /\b(tren|trend|perkembangan|per hari|per bulan|dari waktu ke waktu)\b/i.test(normalized);
  const isFollowUp = /\b(tersebut|sebelumnya|berkaitan|terkait|yang sama|lanjutkan|detailnya)\b/i.test(normalized);

  let capabilities: RouteCapability[];
  if (asksAggregate) capabilities = ['statistics'];
  else if (asksTrend) capabilities = ['trend_analysis'];
  else if (asksDocuments || temporal.kind !== 'none') capabilities = ['news_lookup'];
  else if (isFollowUp) capabilities = ['contextual_follow_up'];
  else capabilities = ['general_chat'];

  const intents = capabilities.includes('statistics') || capabilities.includes('trend_analysis')
    ? ['sql' as LLMIntent]
    : capabilities.includes('news_lookup') || capabilities.includes('contextual_follow_up')
      ? ['rag' as LLMIntent]
      : ['chat' as LLMIntent];

  return {
    capabilities,
    intents,
    filters: { topic: [], kecamatan: null, kategori: null, sentimen: null },
    temporal,
    confidence: 0.55,
  };
}

function normalizePlan(raw: unknown, query: string): QueryPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const rawCapabilities = Array.isArray(value.capabilities)
    ? value.capabilities
    : typeof value.capability === 'string' ? [value.capability] : [];
  let capabilities = rawCapabilities.filter(
    (item): item is RouteCapability => typeof item === 'string' && CAPABILITIES.has(item as RouteCapability),
  );
  if (capabilities.length === 0) return null;

  const rawFilters = value.filters && typeof value.filters === 'object'
    ? value.filters as Record<string, unknown>
    : {};
  const rawTemporal = value.temporal && typeof value.temporal === 'object'
    ? value.temporal as Record<string, unknown>
    : {};
  const temporalValue = ['today', 'yesterday', 'last_24_hours', 'latest'].includes(String(rawTemporal.value))
    ? String(rawTemporal.value) as TemporalPlan['value']
    : undefined;
  const inferredTemporal = inferTemporal(query);
  const temporal: TemporalPlan = rawTemporal.kind === 'latest_available'
    ? { kind: 'latest_available', value: temporalValue || 'latest' }
    : rawTemporal.kind === 'relative' && temporalValue
      ? { kind: 'relative', value: temporalValue }
      : inferredTemporal;

  // A temporal phrase is a news lookup even if the classifier defaults to chat.
  if (temporal.kind !== 'none' && capabilities.includes('general_chat')) {
    capabilities = ['news_lookup'];
  }

  const intents = new Set<LLMIntent>();
  if (capabilities.includes('statistics') || capabilities.includes('trend_analysis')) intents.add('sql');
  if (capabilities.includes('news_lookup') || capabilities.includes('contextual_follow_up')) intents.add('rag');
  if (capabilities.includes('general_chat') || intents.size === 0) intents.add('chat');

  // A latest-news request without statistics is served from the database.
  if (capabilities.includes('news_lookup') && temporal.kind !== 'none') {
    intents.delete('rag');
    intents.add('sql');
  }

  const topic = Array.isArray(rawFilters.topic)
    ? rawFilters.topic.filter((item): item is string => typeof item === 'string').slice(0, 8)
    : typeof rawFilters.topic === 'string' ? [rawFilters.topic] : [];

  return {
    capabilities,
    intents: Array.from(intents),
    filters: {
      topic,
      kecamatan: typeof rawFilters.kecamatan === 'string' ? rawFilters.kecamatan : null,
      kategori: typeof rawFilters.kategori === 'string' ? rawFilters.kategori : null,
      sentimen: typeof rawFilters.sentimen === 'string' ? rawFilters.sentimen : null,
    },
    temporal,
    confidence: typeof value.confidence === 'number' ? Math.max(0, Math.min(1, value.confidence)) : 0.7,
  };
}

async function classifyWithLLM(query: string, callConfig?: LLMCallConfig): Promise<QueryPlan | null> {
  const prompt = `Klasifikasikan pertanyaan user untuk aplikasi berita Kabupaten Malang.

Pilih capabilities hanya dari:
- news_lookup: mencari atau menampilkan berita
- statistics: menghitung jumlah, persentase, perbandingan, atau agregasi
- trend_analysis: tren berdasarkan waktu
- contextual_follow_up: pertanyaan lanjutan yang bergantung pada percakapan sebelumnya
- general_chat: sapaan atau penjelasan umum dalam scope aplikasi

Kembalikan JSON saja dengan format:
{"capabilities":["news_lookup"],"filters":{"topic":[],"kecamatan":null,"kategori":null,"sentimen":null},"temporal":{"kind":"none","value":null},"confidence":0.0}

Nilai temporal.kind hanya: none, relative, latest_available.
Nilai temporal.value hanya: today, yesterday, last_24_hours, latest.
Jika user meminta berita terbaru, hari ini, kemarin, atau 24 jam terakhir, gunakan news_lookup dan isi temporal.
Jangan menjawab pertanyaan. Jangan menambahkan markdown.

Pertanyaan:
${normalizeTemporalQuery(query).slice(0, 4000)}`;

  try {
    const result = await callLLM([{ role: 'user', content: prompt }], 260, 0, callConfig);
    return normalizePlan(safeJsonParse<unknown>(result, null), query);
  } catch {
    return null;
  }
}

export async function classifyIntents(query: string, callConfig?: LLMCallConfig): Promise<RouterResult> {
  const fallback = fallbackPlan(query);
  const plan = await classifyWithLLM(query, callConfig) || fallback;
  return { intents: plan.intents, plan, reason: plan === fallback ? 'heuristic-fallback' : 'structured-router' };
}
