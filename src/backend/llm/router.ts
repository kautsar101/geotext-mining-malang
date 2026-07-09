import type { LLMIntent } from './types';

type RouterResult = {
  intents: LLMIntent[];
  reason?: string;
};

function fallbackIntents(query: string): LLMIntent[] {
  const q = query.toLowerCase();
  const intents = new Set<LLMIntent>();

  if (/(berapa|jumlah|total|statistik|rata-rata|ranking|urutan|terbanyak|tersedikit|bandingkan|persentase)/i.test(q)) {
    intents.add('sql');
  }

  if (/(berita|artikel|sumber|kejadian|kasus|isu|kecamatan|malang|banjir|sekolah|kesehatan|ekonomi|sosial|pendidikan)/i.test(q)) {
    intents.add('rag');
  }

  if (intents.size === 0 || /(jelaskan|rangkum|analisis|apa artinya|kenapa|bagaimana)/i.test(q)) {
    intents.add('chat');
  }

  return Array.from(intents);
}

export async function classifyIntents(query: string): Promise<RouterResult> {
  return { intents: fallbackIntents(query), reason: 'heuristic' };
}
