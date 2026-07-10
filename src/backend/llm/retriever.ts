import { supabase } from '@/backend/db/supabase';
import { generateEmbedding } from './providers';
import { normalizeQueryText, sanitizeInput } from './guardrails';
import type { Source } from './types';

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
const RAG_TOP_K = 10;
const KEYWORD_STOPWORDS = [
  'carikan', 'cari', 'berita', 'artikel', 'tentang', 'kabupaten', 'malang',
  'kecamatan', 'saya', 'tolong', 'yang', 'dan', 'atau', 'dengan', 'untuk',
  'sertakan', 'sumber', 'di', 'ke', 'dari', 'isu',
];

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
    ['kecelakaan', 'tabrakan', 'bertabrakan', 'tertabrak', 'laka lantas'].forEach((term) => expanded.add(term));
  }
  return Array.from(expanded).slice(0, 10);
}

function sourceRelevanceScore(source: RawSource, primaryTerms: string[], expandedTerms: string[]): number {
  const title = String(source.title || '').toLowerCase();
  const content = String(source.chunk_text || source.content_clean || '').toLowerCase();
  let score = Number(source.similarity || 0) * 100;

  for (const term of primaryTerms) {
    if (title.includes(term)) score += 120;
    if (content.includes(term)) score += 40;
  }

  for (const term of expandedTerms) {
    if (primaryTerms.includes(term)) continue;
    if (title.includes(term)) score += 24;
    if (content.includes(term)) score += 8;
  }

  return score;
}

export async function parseRetrievalQuery(
  query: string,
): Promise<ParsedQuery> {
  const safeQuery = sanitizeInput(query);
  const lowered = normalizeQueryText(safeQuery);
  const kecamatan = KECAMATAN.find((name) => lowered.includes(name.toLowerCase())) || null;
  const kategori = VALID_KATEGORI.find((value) => lowered.includes(value)) || null;
  const sentimen = lowered.includes('positif')
    ? 'positive'
    : lowered.includes('negatif')
      ? 'negative'
      : lowered.includes('netral')
        ? 'neutral'
        : VALID_SENTIMEN.find((value) => lowered.includes(value)) || null;
  const keywords = lowered
    .split(/\s+/)
    .map(cleanSearchTerm)
    .filter((word) => word.length > 2 && !KEYWORD_STOPWORDS.includes(word))
    .slice(0, 8);

  return {
    kecamatan: canonicalKecamatan(kecamatan),
    kategori,
    sentimen,
    keywords: keywords.length > 0 ? keywords : lowered.split(/\s+/).map(cleanSearchTerm).filter((w) => w.length > 2).slice(0, 8),
  };
}

export async function retrieveSources(
  queryText: string,
  filters: Pick<ParsedQuery, 'kecamatan' | 'kategori' | 'sentimen'>,
  topK = RAG_TOP_K,
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
    const embedding = await generateEmbedding();
    if (embedding && embedding.length > 0) {
      const { data } = await supabase.rpc('match_news_embeddings', {
        query_embedding: embedding,
        match_threshold: 0.35,
        match_count: topK,
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

  const keywords = normalizeQueryText(queryText).split(/\s+/).map(cleanSearchTerm).filter((w) => w.length > 2).slice(0, 8);
  const searchTerms = expandSearchTerms(keywords.length > 0 ? keywords : [cleanSearchTerm(queryText)]);

  if (searchTerms[0]) {
    let q = supabase.from('clean_news_articles')
      .select('id, title, content_clean, source, published_date, primary_kecamatan, category, sentiment, url')
      .limit(topK);
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
      .limit(topK);
    if (filters.kecamatan) q = q.eq('primary_kecamatan', filters.kecamatan);
    if (filters.kategori) q = q.eq('category', filters.kategori);
    if (filters.sentimen) q = q.eq('sentiment', filters.sentimen);

    const { data } = await q;
    if (data && data.length > 0) {
      allSources.push(...dedup(data as RawSource[]));
      searchSteps.push('filter');
    }
  }

  const rankedSources = [...allSources]
    .sort((a, b) => sourceRelevanceScore(b, keywords, searchTerms) - sourceRelevanceScore(a, keywords, searchTerms));

  const sources = rankedSources.slice(0, topK).map((r, i) => ({
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
