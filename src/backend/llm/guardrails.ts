import type { ChatMessage } from './types';

const CORE_DOMAIN_KEYWORDS = [
  'malang',
  'kabupaten',
  'kecamatan',
  'berita',
  'artikel',
  'sumber',
  'sentimen',
  'peta',
  'spasial',
  'geotext',
  'mining',
  'dashboard',
  'banjir',
  'kecelakaan',
  'tabrakan',
  'bencana',
  'mbg',
  'sppg',
  'rsud',
  'puskesmas',
  'rsj',
  'odgj',
  'sekolah',
];

const KECAMATAN_KEYWORDS = [
  'ampelgading',
  'bantur',
  'bululawang',
  'dampit',
  'dau',
  'donomulyo',
  'gedangan',
  'gondanglegi',
  'jabung',
  'kalipare',
  'karangploso',
  'kasembon',
  'kepanjen',
  'kromengan',
  'lawang',
  'ngajum',
  'ngantang',
  'pagak',
  'pagelaran',
  'pakis',
  'pakisaji',
  'poncokusumo',
  'pujon',
  'singosari',
  'sumbermanjing wetan',
  'sumberpucung',
  'tajinan',
  'tirtoyudo',
  'tumpang',
  'turen',
  'wagir',
  'wajak',
  'wonosari',
];

const CONTEXTUAL_KEYWORDS = [
  'kategori',
  'ekonomi',
  'sosial',
  'kesehatan',
  'pendidikan',
  'statistik',
  'jumlah',
  'total',
  'tren',
  'isu',
  'wilayah',
  'daerah',
  'database',
  'data',
];

const FOLLOW_UP_KEYWORDS = [
  'itu',
  'tersebut',
  'iya',
  'ya',
  'yup',
  'oke',
  'cari',
  'carikan',
  'lanjut',
  'lanjutkan',
  'jelaskan',
  'detail',
  'rangkum',
  'bandingkan',
  'buat tabel',
  'simpulkan',
  'kenapa',
  'bagaimana',
  'apa maksudnya',
];

const TYPO_NORMALIZATIONS: Array<[RegExp, string]> = [
  [/\bcariakn\b/g, 'carikan'],
  [/\bkesehtan\b/g, 'kesehatan'],
  [/\bkesehtaan\b/g, 'kesehatan'],
  [/\bksehatan\b/g, 'kesehatan'],
  [/\bkepnajen\b/g, 'kepanjen'],
  [/\bsetnimetn\b/g, 'sentimen'],
];

export const OUT_OF_CONTEXT_RESPONSE =
  'Maaf, saya hanya bisa membantu pertanyaan seputar berita daerah Kabupaten Malang, statistik database berita, sentimen, kategori, kecamatan, peta spasial, dan analisis geotext mining. Silakan tanyakan topik dalam konteks tersebut.';

export function normalizeQueryText(text: string): string {
  return TYPO_NORMALIZATIONS.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    text.toLowerCase(),
  );
}

export function sanitizeInput(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/<\/?system>/gi, '<system>')
    .replace(/<\/?assistant>/gi, '<assistant>')
    .replace(/<\/?user>/gi, '<user>')
    .trim();
}

export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    const cleaned = text.replace(/```json|```/gi, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

export function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((m) => m && typeof m === 'object')
    .map((m) => m as Record<string, unknown>)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: sanitizeInput(String(m.content)).slice(0, 2000),
    }))
    .filter((m) => m.content.length > 0)
    .slice(-5);
}

export function isGreetingOnly(query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;
  return words.every((word) =>
    ['halo', 'hai', 'hi', 'hello', 'test', 'coba', 'pagi', 'siang', 'sore', 'malam'].includes(word),
  );
}

function hasDomainKeyword(text: string): boolean {
  const lowered = normalizeQueryText(text);
  if (CORE_DOMAIN_KEYWORDS.some((keyword) => lowered.includes(keyword))) return true;
  if (KECAMATAN_KEYWORDS.some((keyword) => lowered.includes(keyword))) return true;

  const hasContextualKeyword = CONTEXTUAL_KEYWORDS.some((keyword) => lowered.includes(keyword));
  const hasDataContext = /(berita|artikel|database|data|kecamatan|kategori|sentimen|malang|geotext|spasial|peta)/i.test(lowered);
  return hasContextualKeyword && hasDataContext;
}

function isFollowUp(query: string): boolean {
  const lowered = normalizeQueryText(query);
  return FOLLOW_UP_KEYWORDS.some((keyword) => lowered.includes(keyword));
}

export function isInProjectContext(query: string, recentMessages: ChatMessage[] = []): boolean {
  if (isGreetingOnly(query)) return true;
  if (hasDomainKeyword(query)) return true;

  const recentContext = recentMessages
    .slice(-4)
    .map((message) => message.content)
    .join(' ');

  return isFollowUp(query) && hasDomainKeyword(recentContext);
}

function stripMarkdownCitationLinks(text: string): string {
  return text
    .replace(/\[\[\s*(\d+)\\?\s*\]\]\(https?:\/\/[^)]+\)/g, '[$1]')
    .replace(/\[\s*(\d+)\\?\s*\]\(https?:\/\/[^)]+\)/g, '[$1]');
}

function stripManualReferences(text: string): string {
  const lines = text.split('\n');
  const cutIndex = lines.findIndex((line) => {
    const cleaned = stripMarkdownCitationLinks(line).trim();
    return (
      /^\s*(referensi|daftar referensi|sumber berita|sumber)\s*:?\s*$/i.test(cleaned) ||
      /^\[\d+\]\s*$/.test(cleaned) ||
      /^\[\d+\]\s*(judul|sumber)\s*:/i.test(cleaned) ||
      /^\[\[\s*\d+\\?\s*\]\]\(https?:\/\/[^)]+\)\s*$/.test(line.trim()) ||
      /^\[\s*\d+\\?\s*\]\(https?:\/\/[^)]+\)\s*$/.test(line.trim())
    );
  });

  if (cutIndex < 0) return text;
  return lines.slice(0, cutIndex).join('\n').trim();
}

function stripUnrequestedTable(text: string, query = ''): string {
  if (/\b(tabel|table)\b/i.test(query)) return text;
  return text
    .replace(/\n+Berikut (adalah )?tabel ringkasan[\s\S]*$/i, '')
    .replace(/\n+\|?\s*No\s*\|?\s*Judul[\s\S]*$/i, '')
    .trim();
}

function stripGenericClosings(text: string): string {
  return text
    .replace(/\n*Data tersebut berdasarkan database yang tersedia\.[\s\S]*$/i, '')
    .replace(/\n*Namun, perlu diingat bahwa data yang disajikan hanya berdasarkan pada konteks berita yang tersedia[\s\S]*$/i, '')
    .replace(/\n*Jika Anda memerlukan informasi lebih lanjut, silakan bertanya\.?\s*$/i, '')
    .trim();
}

export function cleanModelText(text: string, query = ''): string {
  const trimmed = stripGenericClosings(
    stripUnrequestedTable(stripManualReferences(stripMarkdownCitationLinks(text)), query),
  ).trim();
  if (!trimmed) {
    return 'Maaf, saya belum bisa membuat jawaban dari konteks yang tersedia.';
  }
  return trimmed.slice(0, 8000);
}
