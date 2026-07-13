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
  chunk_index?: number;
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
  includeVector = false,
): Promise<{ sources: Source[]; searchInfo: string; embeddingDebug: EmbeddingDebug }> {
  const allSources: RawSource[] = [];
  const searchSteps: string[] = [];
  const candidateLimit = Math.max(topK * 3, 30);
  const embeddingDebug: EmbeddingDebug = {
    status: 'unavailable',
    model: 'intfloat/multilingual-e5-large',
    prefix: 'query:',
    dimensions: 1024,
    normalized: true,
    queryText,
    candidateLimit,
    topKRequested: topK,
    matchThreshold: 0.35,
    matches: [],
  };

  try {
    const embedding = await generateEmbedding(queryText);
    if (embedding) {
      const { data } = await supabase.rpc('match_news_embeddings', {
        query_embedding: embedding.vector,
        match_threshold: 0.35,
        match_count: candidateLimit,
        filter_kecamatan: filters.kecamatan || null,
        filter_kategori: filters.kategori || null,
        filter_sentimen: filters.sentimen || null,
      });
      embeddingDebug.status = 'success';
      embeddingDebug.rawMatchCount = data?.length || 0;
      if (includeVector) embeddingDebug.queryVector = embedding.vector;
      if (data && data.length > 0) {
        allSources.push(...data as RawSource[]);
        searchSteps.push('semantic');
      }
    }
  } catch (error) {
    embeddingDebug.status = 'error';
    embeddingDebug.error = error instanceof Error ? error.message : 'Embedding search gagal';
  }

  const keywords = normalizeQueryText(queryText).split(/\s+/).map(cleanSearchTerm).filter((w) => w.length > 2).slice(0, 8);
  // Location/category/sentiment are already enforced by RPC filters. They must
  // not receive another relevance boost and drown out the actual topic.
  const filterTokens = new Set(
    [filters.kecamatan, filters.kategori, filters.sentimen]
      .filter(Boolean)
      .flatMap((value) => normalizeQueryText(value as string).split(/\s+/))
      .map(cleanSearchTerm),
  );
  const topicKeywords = keywords.filter((keyword) => !filterTokens.has(keyword));
  const searchTerms = expandSearchTerms(topicKeywords);

  if (searchTerms[0]) {
    let q = supabase.from('clean_news_articles')
      .select('id, title, content_clean, source, published_date, primary_kecamatan, category, sentiment, url')
      .limit(candidateLimit);
    if (filters.kecamatan) q = q.eq('primary_kecamatan', filters.kecamatan);
    if (filters.kategori) q = q.eq('category', filters.kategori);
    if (filters.sentimen) q = q.eq('sentiment', filters.sentimen);
    q = q.or(searchTerms.flatMap((k) => [`title.ilike.%${k}%`, `content_clean.ilike.%${k}%`]).join(','));

    const { data } = await q;
    if (data && data.length > 0) {
      allSources.push(...data as RawSource[]);
      searchSteps.push('keyword');
    }
  }

  if (allSources.length < 3 && (filters.kecamatan || filters.kategori || filters.sentimen)) {
    let q = supabase.from('clean_news_articles')
      .select('id, title, content_clean, source, published_date, primary_kecamatan, category, sentiment, url')
      .order('published_date', { ascending: false })
      .limit(candidateLimit);
    if (filters.kecamatan) q = q.eq('primary_kecamatan', filters.kecamatan);
    if (filters.kategori) q = q.eq('category', filters.kategori);
    if (filters.sentimen) q = q.eq('sentiment', filters.sentimen);

    const { data } = await q;
    if (data && data.length > 0) {
      allSources.push(...data as RawSource[]);
      searchSteps.push('filter');
    }
  }

  const rankedChunks = [...allSources]
    .map((source) => ({ source, score: sourceRelevanceScore(source, topicKeywords, searchTerms) }))
    .sort((a, b) => b.score - a.score);
  const articleGroups = new Map<string, { chunks: Array<{ source: RawSource; score: number }>; bestScore: number }>();

  for (const candidate of rankedChunks) {
    const articleKey = candidate.source.article_id ?? candidate.source.id;
    if (typeof articleKey !== 'number') continue;
    const key = String(articleKey);
    const group = articleGroups.get(key) || { chunks: [], bestScore: candidate.score };
    group.chunks.push(candidate);
    group.bestScore = Math.max(group.bestScore, candidate.score);
    articleGroups.set(key, group);
  }

  const chunksPerArticle = topK >= 20 ? 3 : 2;
  const rankedArticles = [...articleGroups.values()]
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, topK);

  const sources = rankedArticles.map((group, i) => {
    const rankedGroupChunks = group.chunks.sort((a, b) => b.score - a.score);
    const bestChunk = rankedGroupChunks[0]?.source || {};
    const selectedChunks = rankedGroupChunks
      .slice(0, chunksPerArticle)
      .sort((a, b) => (a.source.chunk_index ?? 0) - (b.source.chunk_index ?? 0));
    const articleId = bestChunk.article_id ?? bestChunk.id;

    return {
    id: i + 1,
      articleId: typeof articleId === 'number' ? articleId : undefined,
      chunkIndices: selectedChunks.map(({ source }) => source.chunk_index).filter((value): value is number => typeof value === 'number'),
      title: bestChunk.title,
      snippet: selectedChunks
        .map(({ source }) => String(source.chunk_text || source.content_clean || '').slice(0, 700))
        .filter(Boolean)
        .join('\n\n'),
      source: bestChunk.source,
      date: bestChunk.published_date,
      kecamatan: bestChunk.primary_kecamatan,
      category: bestChunk.category,
      sentiment: bestChunk.sentiment,
      url: bestChunk.url,
      similarity: bestChunk.similarity ? Math.round(bestChunk.similarity * 100) : undefined,
    };
  });

  embeddingDebug.selectedArticleCount = sources.length;
  embeddingDebug.matches = sources.map((source) => ({
    rank: source.id,
    articleId: source.articleId,
    chunkIndices: source.chunkIndices,
    similarity: source.similarity,
    title: source.title,
    primaryKecamatan: source.kecamatan,
    category: source.category,
    sentiment: source.sentiment,
  }));

  return {
    sources,
    searchInfo: searchSteps.length > 0 ? `Pencarian: ${searchSteps.join(' -> ')}` : 'Tidak ada hasil',
    embeddingDebug,
  };
}

export type EmbeddingDebug = {
  status: 'success' | 'unavailable' | 'error';
  model: string;
  prefix: 'query:';
  dimensions: 1024;
  normalized: true;
  queryText: string;
  candidateLimit: number;
  topKRequested: number;
  matchThreshold: number;
  rawMatchCount?: number;
  selectedArticleCount?: number;
  queryVector?: number[];
  matches: Array<Record<string, unknown>>;
  error?: string;
};

export function formatSourcesForPrompt(sources: Source[]): string {
  if (sources.length === 0) return 'Tidak ada berita terkait di database.';

  return sources.map((s) =>
    `[${s.id}] Judul: ${s.title || '-'}\n` +
    `Sumber: ${s.source || '-'} | Kecamatan: ${s.kecamatan || '-'} | ` +
    `Tanggal: ${s.date || '-'} | Kategori: ${s.category || '-'} | Sentimen: ${s.sentiment || '-'}\n` +
    `Cuplikan: ${s.snippet || '-'}`,
  ).join('\n\n');
}
