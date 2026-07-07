import { formatSourcesForPrompt } from './retriever';
import type { ChatMessage, LLMIntent, Source } from './types';

export function buildFinalMessages(input: {
  query: string;
  intents: LLMIntent[];
  memorySummary: string;
  recentMessages: ChatMessage[];
  sqlContext?: string;
  ragSources: Source[];
  searchInfo?: string;
}): ChatMessage[] {
  const needsRag = input.intents.includes('rag');
  const sourceRules = needsRag
    ? `- Jika memakai konteks berita, tulis citation [1], [2] di akhir kalimat yang memakai sumber.
- Jangan membuat sumber, URL, judul, atau fakta berita palsu.
- Jika konteks berita tidak relevan, katakan data tidak ditemukan di database.`
    : '- Untuk chat umum, jawab natural tanpa memaksa citation.';

  const system = `Kamu adalah asisten AI untuk analisis berita daerah Kabupaten Malang.

Intent aktif: ${input.intents.join(', ')}

Aturan utama:
- Jawab dalam Bahasa Indonesia.
- Ikuti format yang diminta user: paragraf, list, tabel markdown, atau ringkas.
- Jika ada hasil SQL, angka dari SQL adalah sumber kebenaran untuk statistik.
- Jika ada konteks RAG, gunakan hanya konteks itu untuk klaim berita faktual.
${sourceRules}
- Jika user meminta beberapa hal sekaligus, jawab semua bagian secara terpisah dan jelas.

Memory session:
${input.memorySummary || '-'}

Hasil SQL:
${input.sqlContext || '-'}

${input.searchInfo || ''}
Konteks berita:
${needsRag ? formatSourcesForPrompt(input.ragSources) : '-'}`;

  return [
    { role: 'system', content: system },
    ...input.recentMessages,
    { role: 'user', content: input.query },
  ];
}

