import type { LLMIntent } from './types';

type RouterResult = {
  intents: LLMIntent[];
  reason?: string;
  temporal?: 'latest_available';
};

export function normalizeTemporalQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/\bhariini\b/g, 'hari ini')
    .replace(/\bkemaren\b/g, 'kemarin');
}

export function isLatestNewsQuery(query: string): boolean {
  const normalized = normalizeTemporalQuery(query);
  return /\b(hari ini|kemarin|24\s+jam|terbaru|terkini|paling baru|update terbaru)\b/i.test(normalized);
}

function fallbackIntents(query: string): LLMIntent[] {
  const q = normalizeTemporalQuery(query);
  const intents = new Set<LLMIntent>();
  const asksAggregate = /(berapa|jumlah|total|statistik|rata-rata|ranking|urutan|terbanyak|tersedikit|bandingkan|persentase)/i.test(q);
  const asksDocuments = /(carikan|cari|daftar|list|artikel|sumber|link|judul|berita apa saja|sertakan)/i.test(q);

  // Latest-news questions are database lookups, not semantic retrieval.
  if (isLatestNewsQuery(q) && !asksAggregate) {
    intents.add('sql');
    return Array.from(intents);
  }

  if (asksAggregate) {
    intents.add('sql');
  }

  if ((!asksAggregate || asksDocuments) && /(berita|artikel|sumber|kejadian|kasus|isu|kecamatan|malang|banjir|sekolah|kesehatan|ekonomi|sosial|pendidikan)/i.test(q)) {
    intents.add('rag');
  }

  if (intents.size === 0 || /(jelaskan|rangkum|analisis|apa artinya|kenapa|bagaimana)/i.test(q)) {
    intents.add('chat');
  }

  return Array.from(intents);
}

export async function classifyIntents(query: string): Promise<RouterResult> {
  return {
    intents: fallbackIntents(query),
    reason: 'heuristic',
    ...(isLatestNewsQuery(query) ? { temporal: 'latest_available' } : {}),
  };
}
