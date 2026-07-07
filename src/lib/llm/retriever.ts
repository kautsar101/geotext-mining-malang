import { supabase } from '@/lib/supabase';
import { callLLM, generateEmbedding } from './providers';
import { safeJsonParse, sanitizeInput } from './guardrails';
import type { ProviderId, Source } from './types';

const KECAMATAN = [
  'Ampelgading', 'Bantur', 'Bululawang', 'Dampit', 'Dau', 'Donomulyo', 'Gedangan',
  'Gondanglegi', 'Jabung', 'Kalipare', 'Karangploso', 'Kasembon', 'Kepanjen',
  'Kromengan', 'Lawang', 'Ngajum', 'Ngantang', 'Pagak', 'Pagelaran', 'Pakis',
  'Pakisaji', 'Poncokusumo', 'Pujon', 'Singosari', 'Sumbermanjing Wetan',
  'Sumberpucung', 'Tajinan', 'Tirtoyudo', 'Tumpang', 'Turen', 'Wagir', 'Wajak',
  'Wonosari',
];

const VALID_KATEGORI = ['kesehatan', 'pendidikan', 'ekonomi', 'sosial'];
const VALID_SENTIMEN = ['positive', 'negative', 'neutral'];

type ParsedQuery = {
  kecamatan: string | null;
  kategori: string | null;
  sentimen: string | null;
  keywords: string[];
};

type RawSource = {
  id?: number;
  article_id?: number;
  title?: string;
  chunk_text?: string;
  content_clean?: string;
  source?: string;
  published_date?: string;
  primary_kecamatan?: string;
  category?: string;
  sentiment?: string;
  url?: string;
  similarity?: number;
};

function canonicalKecamatan(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const found = KECAMATAN.find((k) => k.toLowerCase() === value.toLowerCase());
  return found || null;
}

function cleanSearchTerm(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9\s-]/gi, '').trim();
}

function expandSearchTerms(terms: string[]): string[] {
  const expanded = new Set<string>(terms);
  if (terms.some((term) => ['kecelakaan', 'tabrakan', 'bertabrakan'].includes(term))) {
    ['kecelakaan', 'tabrakan', 'bertabrakan', 'truk', 'motor'].forEach((term) => expanded.add(term));
  }
  return Array.from(expanded).slice(0, 10);
}

export async function parseRetrievalQuery(
  provider: ProviderId,
  apiKey: string,
  query: string,
): Promise<ParsedQuery> {
  const safeQuery = sanitizeInput(query);
  const fallback: ParsedQuery = {
    kecamatan: null,
    kategori: null,
    sentimen: null,
    keywords: safeQuery.toLowerCase().split(/\s+/).filter((w) => w.length > 2).slice(0, 8),
  };

  const prompt = `Anda adalah parser query berita daerah. Balas HANYA JSON valid.

Format:
{"kecamatan":null,"kategori":null,"sentimen":null,"keywords":["kata"]}

Kategori valid: ${VALID_KATEGORI.join(', ')}.
Sentimen valid: ${VALID_SENTIMEN.join(', ')}.
Kecamatan Kabupaten Malang: ${KECAMATAN.join(', ')}.

Query:
"""${safeQuery}"""`;

  try {
    const result = await callLLM(provider, apiKey, [{ role: 'user', content: prompt }], 120, 0);
    const parsed = safeJsonParse<ParsedQuery>(result, fallback);
    const kategori = typeof parsed.kategori === 'string' && VALID_KATEGORI.includes(parsed.kategori.toLowerCase())
      ? parsed.kategori.toLowerCase()
      : null;
    const sentimen = typeof parsed.sentimen === 'string' && VALID_SENTIMEN.includes(parsed.sentimen.toLowerCase())
      ? parsed.sentimen.toLowerCase()
      : null;

    return {
      kecamatan: canonicalKecamatan(parsed.kecamatan),
      kategori,
      sentimen,
      keywords: Array.isArray(parsed.keywords)
        ? parsed.keywords.map((k) => cleanSearchTerm(String(k))).filter(Boolean).slice(0, 8)
        : fallback.keywords,
    };
  } catch {
    return fallback;
  }
}

export async function retrieveSources(
  provider: ProviderId,
  apiKey: string,
  queryText: string,
  filters: Pick<ParsedQuery, 'kecamatan' | 'kategori' | 'sentimen'>,
): Promise<{ sources: Source[]; searchInfo: string }> {
  const allSources: RawSource[] = [];
  const searchSteps: string[] = [];
  const seen = new Set<number>();

  function dedup(items: RawSource[]): RawSource[] {
    return items.filter((r) => {
      const key = r.article_id || r.id;
      if (typeof key !== 'number' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  try {
    const embedding = await generateEmbedding(provider, apiKey, queryText);
    if (embedding && embedding.length > 0) {
      const { data } = await supabase.rpc('match_news_embeddings', {
        query_embedding: embedding,
        match_threshold: 0.35,
        match_count: 20,
        filter_kecamatan: filters.kecamatan || null,
        filter_kategori: filters.kategori || null,
        filter_sentimen: filters.sentimen || null,
      });
      if (data && data.length > 0) {
        allSources.push(...dedup(data as RawSource[]));
        searchSteps.push('semantic');
      }
    }
  } catch {
    // Keyword fallback below keeps non-embedding providers usable.
  }

  const keywords = queryText.toLowerCase().split(/\s+/).map(cleanSearchTerm).filter((w) => w.length > 2).slice(0, 8);
  const searchTerms = expandSearchTerms(keywords.length > 0 ? keywords : [cleanSearchTerm(queryText)]);

  if (searchTerms[0]) {
    let q = supabase.from('clean_news_articles')
      .select('id, title, content_clean, source, published_date, primary_kecamatan, category, sentiment, url')
      .limit(20);
    if (filters.kecamatan) q = q.eq('primary_kecamatan', filters.kecamatan);
    if (filters.kategori) q = q.eq('category', filters.kategori);
    if (filters.sentimen) q = q.eq('sentiment', filters.sentimen);
    q = q.or(searchTerms.flatMap((k) => [`title.ilike.%${k}%`, `content_clean.ilike.%${k}%`]).join(','));

    const { data } = await q;
    if (data && data.length > 0) {
      allSources.push(...dedup(data as RawSource[]));
      searchSteps.push('keyword');
    }
  }

  if (allSources.length < 3 && (filters.kecamatan || filters.kategori || filters.sentimen)) {
    let q = supabase.from('clean_news_articles')
      .select('id, title, content_clean, source, published_date, primary_kecamatan, category, sentiment, url')
      .order('published_date', { ascending: false })
      .limit(20);
    if (filters.kecamatan) q = q.eq('primary_kecamatan', filters.kecamatan);
    if (filters.kategori) q = q.eq('category', filters.kategori);
    if (filters.sentimen) q = q.eq('sentiment', filters.sentimen);

    const { data } = await q;
    if (data && data.length > 0) {
      allSources.push(...dedup(data as RawSource[]));
      searchSteps.push('filter');
    }
  }

  if (allSources.length === 0) {
    const { data } = await supabase.from('clean_news_articles')
      .select('id, title, content_clean, source, published_date, primary_kecamatan, category, sentiment, url')
      .order('published_date', { ascending: false })
      .limit(12);
    if (data && data.length > 0) {
      allSources.push(...dedup(data as RawSource[]));
      searchSteps.push('terbaru');
    }
  }

  const sources = allSources.slice(0, 20).map((r, i) => ({
    id: i + 1,
    title: r.title,
    snippet: String(r.chunk_text || r.content_clean || '').slice(0, 420),
    source: r.source,
    date: r.published_date,
    kecamatan: r.primary_kecamatan,
    category: r.category,
    sentiment: r.sentiment,
    url: r.url,
    similarity: r.similarity ? Math.round(r.similarity * 100) : undefined,
  }));

  return {
    sources,
    searchInfo: searchSteps.length > 0 ? `Pencarian: ${searchSteps.join(' -> ')}` : 'Tidak ada hasil',
  };
}

export function formatSourcesForPrompt(sources: Source[]): string {
  if (sources.length === 0) return 'Tidak ada berita terkait di database.';

  return sources.map((s) =>
    `[${s.id}] Judul: ${s.title || '-'}\n` +
    `Sumber: ${s.source || '-'} | URL: ${s.url || '-'} | Kecamatan: ${s.kecamatan || '-'} | ` +
    `Tanggal: ${s.date || '-'} | Kategori: ${s.category || '-'} | Sentimen: ${s.sentiment || '-'}\n` +
    `Cuplikan: ${s.snippet || '-'}`,
  ).join('\n\n');
}
