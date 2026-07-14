import { safeJsonParse } from './guardrails';
import { callLLM, type LLMCallConfig } from './providers';
import type { ChatMessage, LLMIntent } from './types';

export type QueryOperation =
  | 'chat'
  | 'list'
  | 'count'
  | 'group_count'
  | 'trend'
  | 'semantic_search';

export type QueryGroup = 'category' | 'sentiment' | 'primary_kecamatan' | 'published_date';

export type QueryFilters = {
  topic: string[];
  kecamatan: string | null;
  kategori: string | null;
  sentimen: 'positive' | 'negative' | 'neutral' | null;
  dateFrom: string | null;
  dateTo: string | null;
  temporalLabel: string | null;
};

export type QueryPlan = {
  operation: QueryOperation;
  groupBy: QueryGroup | null;
  filters: QueryFilters;
  sort: { field: 'published_date'; direction: 'asc' | 'desc' } | null;
  limit: number;
  intents: LLMIntent[];
  confidence: number;
  inheritedContext: boolean;
};

type RouterResult = {
  intents: LLMIntent[];
  plan: QueryPlan;
  reason: 'structured-router' | 'heuristic-fallback';
};

const KECAMATAN = [
  'ampelgading', 'bantur', 'bululawang', 'dampit', 'dau', 'donomulyo', 'gedangan',
  'gondanglegi', 'jabung', 'kalipare', 'karangploso', 'kasembon', 'kepanjen',
  'kromengan', 'lawang', 'ngajum', 'ngantang', 'pagak', 'pagelaran', 'pakis',
  'pakisaji', 'poncokusumo', 'pujon', 'singosari', 'sumbermanjing wetan',
  'sumberpucung', 'tajinan', 'tirtoyudo', 'tumpang', 'turen', 'wagir', 'wajak',
  'wonosari',
];

const CATEGORIES = ['ekonomi', 'sosial', 'kesehatan', 'pendidikan'];
const TOPIC_STOPWORDS = new Set([
  'ada', 'adakah', 'apakah', 'berapa', 'banyak', 'jumlah', 'total', 'berita', 'artikel',
  'carikan', 'cari', 'tampilkan', 'berikan', 'kasih', 'tolong', 'daftar', 'list', 'tentang', 'seputar', 'mengenai',
  'kabupaten', 'malang', 'kecamatan', 'pada', 'dalam', 'dari', 'untuk', 'yang', 'terjadi',
  'terpublikasi', 'bulan', 'tahun', 'hari', 'minggu', 'kemarin', 'terakhir', 'terbaru',
  'terkini', 'dengan', 'sentimen', 'positif', 'negatif', 'netral', 'proporsi', 'persentase',
  'distribusi', 'komposisi', 'pembagian', 'masing-masing', 'tiap', 'bidang', 'kategori',
  'bidangnya', 'kategorinya', 'sentimennya', 'bagaimana', 'tersebut', 'sebelumnya', 'sama', 'jam', 'lalu',
  'saya', 'informasi', 'info', 'apa',
]);
const MONTHS: Record<string, number> = {
  januari: 0,
  februari: 1,
  maret: 2,
  april: 3,
  mei: 4,
  juni: 5,
  juli: 6,
  agustus: 7,
  september: 8,
  oktober: 9,
  november: 10,
  desember: 11,
};
const WEEKDAYS: Record<string, number> = {
  minggu: 0,
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  sabtu: 6,
};

const TEMPORAL_ALIASES: Array<[RegExp, string]> = [
  [/\b24\s*jam\s*(terakhir)?\b/g, '24 jam terakhir'],
  [/\bhariini\b/g, 'hari ini'],
  [/\bharini\b/g, 'hari ini'],
  [/\bkemaren\b/g, 'kemarin'],
  [/\bterbaruu+\b/g, 'terbaru'],
  [/\bterkinii+\b/g, 'terkini'],
  [/\bterkahir\b/g, 'terakhir'],
];

function normalizeQuery(query: string): string {
  return TEMPORAL_ALIASES.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    query.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim(),
  );
}

function localDateParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month') - 1, day: read('day') };
}

function calendarDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function validDateValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?$/.test(trimmed)) return null;
  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}

export function resolveTemporalRange(
  query: string,
  now = new Date(),
): Pick<QueryFilters, 'dateFrom' | 'dateTo' | 'temporalLabel'> {
  const normalized = normalizeQuery(query);
  const current = localDateParts(now);
  const today = calendarDate(current.year, current.month, current.day);

  const explicitIso = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (explicitIso) {
    const start = calendarDate(Number(explicitIso[1]), Number(explicitIso[2]) - 1, Number(explicitIso[3]));
    return { dateFrom: formatDate(start), dateTo: formatDate(addDays(start, 1)), temporalLabel: explicitIso[0] };
  }

  const monthMatch = normalized.match(new RegExp(`\\b(?:bulan\\s+)?(${Object.keys(MONTHS).join('|')})(?:\\s+(?:tahun\\s+)?(20\\d{2}))?\\b`, 'i'));
  if (monthMatch) {
    const month = MONTHS[monthMatch[1]];
    const explicitYear = monthMatch[2] ? Number(monthMatch[2]) : null;
    const year = explicitYear ?? (month > current.month ? current.year - 1 : current.year);
    const start = calendarDate(year, month, 1);
    const end = calendarDate(year, month + 1, 1);
    const label = `${monthMatch[1][0].toUpperCase()}${monthMatch[1].slice(1)} ${year}`;
    return { dateFrom: formatDate(start), dateTo: formatDate(end), temporalLabel: label };
  }

  const weekdayLastWeek = normalized.match(new RegExp(`\\b(?:hari\\s+)?(${Object.keys(WEEKDAYS).join('|')})\\s+minggu\\s+lalu\\b`, 'i'));
  if (weekdayLastWeek) {
    const currentWeekday = today.getUTCDay();
    const daysSinceMonday = (currentWeekday + 6) % 7;
    const previousMonday = addDays(today, -daysSinceMonday - 7);
    const targetOffset = (WEEKDAYS[weekdayLastWeek[1]] + 6) % 7;
    const start = addDays(previousMonday, targetOffset);
    return {
      dateFrom: formatDate(start),
      dateTo: formatDate(addDays(start, 1)),
      temporalLabel: `${weekdayLastWeek[1][0].toUpperCase()}${weekdayLastWeek[1].slice(1)} minggu lalu`,
    };
  }

  if (/\b24 jam terakhir\b/.test(normalized)) {
    return {
      dateFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      dateTo: now.toISOString(),
      temporalLabel: '24 jam terakhir',
    };
  }

  const recentDays = normalized.match(/\b(\d{1,3})\s*hari\s+terakhir\b/);
  if (recentDays) {
    const days = Math.max(1, Math.min(Number(recentDays[1]), 365));
    return { dateFrom: formatDate(addDays(today, -(days - 1))), dateTo: formatDate(addDays(today, 1)), temporalLabel: `${days} hari terakhir` };
  }

  if (/\bhari ini\b/.test(normalized)) {
    return { dateFrom: formatDate(today), dateTo: formatDate(addDays(today, 1)), temporalLabel: 'hari ini' };
  }

  if (/\bkemarin\b/.test(normalized)) {
    const start = addDays(today, -1);
    return { dateFrom: formatDate(start), dateTo: formatDate(today), temporalLabel: 'kemarin' };
  }

  if (/\bminggu lalu\b/.test(normalized)) {
    const daysSinceMonday = (today.getUTCDay() + 6) % 7;
    const end = addDays(today, -daysSinceMonday);
    return { dateFrom: formatDate(addDays(end, -7)), dateTo: formatDate(end), temporalLabel: 'minggu lalu' };
  }

  if (/\bbulan lalu\b/.test(normalized)) {
    const start = calendarDate(current.year, current.month - 1, 1);
    const end = calendarDate(current.year, current.month, 1);
    return { dateFrom: formatDate(start), dateTo: formatDate(end), temporalLabel: 'bulan lalu' };
  }

  return { dateFrom: null, dateTo: null, temporalLabel: null };
}

export function isLatestNewsQuery(query: string): boolean {
  return /\b(terbaru|terkini|paling baru|update terbaru)\b/i.test(normalizeQuery(query));
}

function inferGroupBy(query: string): QueryGroup | null {
  if (/\b(sentimen|positif.*negatif|negatif.*positif)\b/i.test(query)) return 'sentiment';
  if (/\b(kategori|bidang|jenis isu|topik)\b/i.test(query)) return 'category';
  if (/\b(kecamatan|wilayah|daerah)\b/i.test(query)) return 'primary_kecamatan';
  if (/\b(hari|harian|tanggal|bulan|bulanan|waktu)\b/i.test(query)) return 'published_date';
  return null;
}

function inferOperation(query: string): { operation: QueryOperation; groupBy: QueryGroup | null } {
  const normalized = normalizeQuery(query);
  const asksGroup = /\b(proporsi|persentase|distribusi|komposisi|pembagian|masing-masing|tiap\s+(?:bidang|kategori|sentimen|kecamatan))\b/i.test(normalized);
  if (asksGroup) return { operation: 'group_count', groupBy: inferGroupBy(normalized) || 'category' };
  if (/\b(tren|trend|perkembangan|dari waktu ke waktu|per hari|harian|per bulan|bulanan)\b/i.test(normalized)) {
    return { operation: 'trend', groupBy: 'published_date' };
  }
  if (/\b(berapa|jumlah|total)\b/i.test(normalized)) return { operation: 'count', groupBy: null };
  if (/\b(carikan|cari|tampilkan|berikan|daftar|list|artikel|sumber|link|judul|berita|informasi|info|kejadian|kasus|isu)\b/i.test(normalized)
    || isLatestNewsQuery(normalized)
    || /\b(hari ini|kemarin|24 jam terakhir|minggu lalu|bulan lalu)\b/i.test(normalized)) {
    return { operation: 'list', groupBy: null };
  }
  return { operation: 'chat', groupBy: null };
}

function inferFilters(query: string, now = new Date()): QueryFilters {
  const normalized = normalizeQuery(query);
  const temporal = resolveTemporalRange(normalized, now);
  const sentiment = normalized.includes('positif')
    ? 'positive'
    : normalized.includes('negatif')
      ? 'negative'
      : normalized.includes('netral')
        ? 'neutral'
        : null;

  const kecamatan = KECAMATAN.find((value) => normalized.includes(value)) || null;
  const kategori = CATEGORIES.find((value) => normalized.includes(value)) || null;
  const excluded = new Set([
    ...TOPIC_STOPWORDS,
    ...KECAMATAN.flatMap((value) => value.split(' ')),
    ...CATEGORIES,
    ...Object.keys(MONTHS),
    ...Object.keys(WEEKDAYS),
  ]);
  const topic = normalized
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9-]/g, ''))
    .filter((word) => word.length > 2 && !excluded.has(word))
    .slice(0, 8);

  return {
    topic,
    kecamatan,
    kategori,
    sentimen: sentiment,
    ...temporal,
  };
}

function intentsForPlan(plan: Pick<QueryPlan, 'operation' | 'filters'>): LLMIntent[] {
  if (plan.operation === 'chat') return ['chat'];
  if (plan.operation === 'semantic_search' || plan.filters.topic.length > 0) return ['rag'];
  return ['sql'];
}

function createFallbackPlan(query: string, recentMessages: ChatMessage[], now: Date): QueryPlan {
  const inferred = inferOperation(query);
  const filters = inferFilters(query, now);
  let inheritedContext = false;

  const looksLikeFollowUp = /\b(tersebut|sebelumnya|yang sama|dari\s+\d+|proporsi|distribusi|komposisi|pembagian|bagaimana|lalu)\b/i.test(normalizeQuery(query));
  if (looksLikeFollowUp) {
    const previousQueries = recentMessages.filter((message) => message.role === 'user').map((message) => message.content).reverse();
    for (const previousQuery of previousQueries) {
      const previous = inferFilters(previousQuery, now);
      filters.kecamatan ||= previous.kecamatan;
      filters.kategori ||= previous.kategori;
      filters.sentimen ||= previous.sentimen;
      filters.dateFrom ||= previous.dateFrom;
      filters.dateTo ||= previous.dateTo;
      filters.temporalLabel ||= previous.temporalLabel;
      if (filters.topic.length === 0 && previous.topic.length > 0) filters.topic = previous.topic;
    }
    inheritedContext = previousQueries.length > 0;
  }

  const plan: QueryPlan = {
    operation: inferred.operation,
    groupBy: inferred.groupBy,
    filters,
    sort: inferred.operation === 'list' ? { field: 'published_date', direction: 'desc' } : null,
    limit: 10,
    intents: ['chat'],
    confidence: 0.55,
    inheritedContext,
  };
  plan.intents = intentsForPlan(plan);
  return plan;
}

function normalizePlan(raw: unknown, query: string, fallback: QueryPlan, now: Date): QueryPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const operations: QueryOperation[] = ['chat', 'list', 'count', 'group_count', 'trend', 'semantic_search'];
  if (!operations.includes(value.operation as QueryOperation)) return null;

  const rawFilters = value.filters && typeof value.filters === 'object' ? value.filters as Record<string, unknown> : {};
  const localTemporal = resolveTemporalRange(query, now);
  const operationFromText = inferOperation(query);
  const explicitOperation = operationFromText.operation !== 'chat' ? operationFromText.operation : value.operation as QueryOperation;
  const rawGroup = ['category', 'sentiment', 'primary_kecamatan', 'published_date'].includes(String(value.groupBy))
    ? value.groupBy as QueryGroup
    : null;
  const sentimen = ['positive', 'negative', 'neutral'].includes(String(rawFilters.sentimen))
    ? rawFilters.sentimen as QueryFilters['sentimen']
    : fallback.filters.sentimen;
  const topic = Array.isArray(rawFilters.topic)
    ? rawFilters.topic.filter((item): item is string => typeof item === 'string' && item.trim().length > 1).map((item) => item.trim().slice(0, 80)).slice(0, 8)
    : typeof rawFilters.topic === 'string' && rawFilters.topic.trim() ? [rawFilters.topic.trim().slice(0, 80)] : fallback.filters.topic;
  const cleanedTopic = topic.filter((item) => {
    const normalized = item.toLowerCase();
    return !TOPIC_STOPWORDS.has(normalized) && !CATEGORIES.includes(normalized) && !KECAMATAN.includes(normalized);
  });
  const llmDateFrom = validDateValue(rawFilters.dateFrom);
  const llmDateTo = validDateValue(rawFilters.dateTo);

  const plan: QueryPlan = {
    operation: explicitOperation,
    groupBy: explicitOperation === 'group_count' || explicitOperation === 'trend'
      ? operationFromText.groupBy || rawGroup || fallback.groupBy || 'category'
      : null,
    filters: {
      topic: cleanedTopic,
      kecamatan: typeof rawFilters.kecamatan === 'string' && KECAMATAN.includes(rawFilters.kecamatan.toLowerCase())
        ? rawFilters.kecamatan.toLowerCase()
        : fallback.filters.kecamatan,
      kategori: typeof rawFilters.kategori === 'string' && CATEGORIES.includes(rawFilters.kategori.toLowerCase())
        ? rawFilters.kategori.toLowerCase()
        : fallback.filters.kategori,
      sentimen,
      dateFrom: localTemporal.dateFrom || llmDateFrom || fallback.filters.dateFrom,
      dateTo: localTemporal.dateTo || llmDateTo || fallback.filters.dateTo,
      temporalLabel: localTemporal.temporalLabel
        || (typeof rawFilters.temporalLabel === 'string' ? rawFilters.temporalLabel.slice(0, 80) : null)
        || fallback.filters.temporalLabel,
    },
    sort: explicitOperation === 'list' ? { field: 'published_date', direction: 'desc' } : null,
    limit: typeof value.limit === 'number' ? Math.max(1, Math.min(Math.round(value.limit), 50)) : fallback.limit,
    intents: ['chat'],
    confidence: typeof value.confidence === 'number' ? Math.max(0, Math.min(1, value.confidence)) : 0.7,
    inheritedContext: value.inheritedContext === true || fallback.inheritedContext,
  };
  plan.intents = intentsForPlan(plan);
  return plan;
}

async function classifyWithLLM(
  query: string,
  recentMessages: ChatMessage[],
  fallback: QueryPlan,
  callConfig?: LLMCallConfig,
  now = new Date(),
): Promise<QueryPlan | null> {
  const localDate = localDateParts(now);
  const recentContext = recentMessages.slice(-6).map((message) => `${message.role}: ${message.content}`).join('\n');
  const prompt = `Ubah pertanyaan user menjadi query plan JSON untuk database berita Kabupaten Malang.

Tanggal saat ini: ${formatDate(calendarDate(localDate.year, localDate.month, localDate.day))}
Zona waktu: Asia/Jakarta

Operation:
- chat: sapaan atau penjelasan umum
- list: menampilkan berita dengan filter pasti tanpa topik semantik
- count: menghitung jumlah
- group_count: proporsi, distribusi, atau jumlah per kelompok
- trend: perkembangan berdasarkan waktu
- semantic_search: mencari berita berdasarkan topik atau makna

groupBy hanya: category, sentiment, primary_kecamatan, published_date, atau null.
Sentimen hanya: positive, negative, neutral, atau null.
Ubah periode menjadi rentang dateFrom inklusif dan dateTo eksklusif format YYYY-MM-DD atau ISO timestamp.
Pertahankan filter percakapan sebelumnya jika pertanyaan sekarang merupakan lanjutan.
Topic hanya berisi konsep yang perlu semantic search, bukan kata umum seperti berita, kecamatan, bulan, atau jumlah.

Kembalikan JSON saja:
{"operation":"count","groupBy":null,"filters":{"topic":[],"kecamatan":"pagak","kategori":null,"sentimen":null,"dateFrom":"2026-06-01","dateTo":"2026-07-01","temporalLabel":"Juni 2026"},"limit":10,"confidence":0.9,"inheritedContext":false}

Percakapan sebelumnya:
${recentContext || '-'}

Pertanyaan sekarang:
${normalizeQuery(query).slice(0, 3000)}`;

  try {
    const result = await callLLM([{ role: 'user', content: prompt }], 450, 0, callConfig);
    return normalizePlan(safeJsonParse<unknown>(result, null), query, fallback, now);
  } catch {
    return null;
  }
}

export async function classifyIntents(
  query: string,
  callConfig?: LLMCallConfig,
  options: { recentMessages?: ChatMessage[]; now?: Date } = {},
): Promise<RouterResult> {
  const recentMessages = options.recentMessages || [];
  const now = options.now || new Date();
  const fallback = createFallbackPlan(query, recentMessages, now);
  const plan = await classifyWithLLM(query, recentMessages, fallback, callConfig, now);
  const selected = plan || fallback;
  return {
    intents: selected.intents,
    plan: selected,
    reason: plan ? 'structured-router' : 'heuristic-fallback',
  };
}
