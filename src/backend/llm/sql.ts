import { supabase } from '@/backend/db/supabase';
import { callLLM, type LLMCallConfig } from './providers';
import { normalizeQueryText, sanitizeInput } from './guardrails';
import { isLatestNewsQuery } from './router';

type QueryBuilder = {
  eq: (column: string, value: unknown) => QueryBuilder;
  ilike: (column: string, value: string) => QueryBuilder;
  is: (column: string, value: null) => QueryBuilder;
  in: (column: string, values: string[]) => QueryBuilder;
  order: (column: string, options: { ascending: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
} & PromiseLike<{ data?: unknown; count?: number | null }>;

const VALID_KECAMATAN = [
  'ampelgading', 'bantur', 'bululawang', 'dampit', 'dau', 'donomulyo', 'gedangan',
  'gondanglegi', 'jabung', 'kalipare', 'karangploso', 'kasembon', 'kepanjen',
  'kromengan', 'lawang', 'ngajum', 'ngantang', 'pagak', 'pagelaran', 'pakis',
  'pakisaji', 'poncokusumo', 'pujon', 'singosari', 'sumbermanjing wetan',
  'sumberpucung', 'tajinan', 'tirtoyudo', 'tumpang', 'turen', 'wagir', 'wajak',
  'wonosari',
];

const ALLOWED_COLUMNS = ['category', 'sentiment', 'primary_kecamatan', 'source'];
const VALID_CATEGORIES = ['ekonomi', 'sosial', 'kesehatan', 'pendidikan'];

export const SCHEMA_DESC = `Tabel: clean_news_articles
Kolom:
- id (bigint, primary key)
- title (text): judul berita
- source (text): nama sumber berita
- url (text): link berita
- category (text): kategori (ekonomi, sosial, kesehatan, pendidikan, atau NULL)
- sentiment (text): positive, negative, neutral, atau NULL
- primary_kecamatan (text): kecamatan di Kabupaten Malang
- published_date (text): tanggal publikasi format YYYY-MM-DD
- content_clean (text): isi berita`;

function buildWhereFromQuery(query: string): string {
  const lowered = normalizeQueryText(query);
  const filters: string[] = [];
  const category = VALID_CATEGORIES.find((value) => lowered.includes(value));
  const kecamatan = VALID_KECAMATAN.find((value) => lowered.includes(value));
  const sentiment = lowered.includes('positif')
    ? 'positive'
    : lowered.includes('negatif')
      ? 'negative'
      : lowered.includes('netral')
        ? 'neutral'
        : null;

  if (category) filters.push(`LOWER(category)='${category}'`);
  if (sentiment) filters.push(`LOWER(sentiment)='${sentiment}'`);
  if (kecamatan) filters.push(`LOWER(primary_kecamatan)='${kecamatan}'`);

  return filters.length > 0 ? ` WHERE ${filters.join(' AND ')}` : '';
}

function buildDeterministicSQL(query: string, forceLatest = false): string | null {
  const lowered = normalizeQueryText(query);
  const where = buildWhereFromQuery(query);
  const asksCount = /\b(berapa|jumlah|total)\b/i.test(lowered);

  if ((forceLatest || isLatestNewsQuery(query)) && !asksCount) {
    return `SELECT id, title, url, content_clean, source, published_date, primary_kecamatan, category, sentiment FROM clean_news_articles${where} ORDER BY published_date DESC LIMIT 10`;
  }

  if (asksCount) {
    return `SELECT COUNT(*) FROM clean_news_articles${where}`;
  }

  if (/\b(per|berdasarkan)\s+kategori\b/i.test(lowered)) {
    return `SELECT category, COUNT(*) as total FROM clean_news_articles${where} GROUP BY category ORDER BY total DESC`;
  }

  if (/\b(per|berdasarkan)\s+sentimen\b/i.test(lowered)) {
    return `SELECT sentiment, COUNT(*) as total FROM clean_news_articles${where} GROUP BY sentiment ORDER BY total DESC`;
  }

  if (/\b(per|berdasarkan)\s+kecamatan\b/i.test(lowered)) {
    return `SELECT primary_kecamatan, COUNT(*) as total FROM clean_news_articles${where} GROUP BY primary_kecamatan ORDER BY total DESC`;
  }

  return null;
}

function extractSelectStatement(raw: string): string {
  const withoutFence = raw.replace(/```sql|```/gi, '').replace(/\r/g, '').trim();
  const selectIndex = withoutFence.search(/\bSELECT\b/i);
  if (selectIndex < 0) return '';

  const tail = withoutFence.slice(selectIndex);
  const beforeSemicolon = tail.split(';')[0];
  const sqlLines: string[] = [];

  for (const line of beforeSemicolon.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (sqlLines.length > 0) break;
      continue;
    }

    if (
      /^(SELECT|FROM|WHERE|AND|OR|GROUP\s+BY|ORDER\s+BY|LIMIT)\b/i.test(trimmed) ||
      (sqlLines.length > 0 && /^(LOWER\(|COUNT\(|[a-z_]+,|[a-z_]+\s*=|'[^']+'|\))/i.test(trimmed))
    ) {
      sqlLines.push(trimmed);
      continue;
    }

    if (sqlLines.length > 0) break;
  }

  return sqlLines.join(' ').replace(/\s+/g, ' ').trim();
}

export async function generateSQL(
  query: string,
  callConfig?: LLMCallConfig,
  options: { latest?: boolean } = {},
): Promise<string> {
  const safeQuery = sanitizeInput(query);
  const deterministicSQL = buildDeterministicSQL(safeQuery, options.latest === true);
  if (deterministicSQL) return deterministicSQL;

  const prompt = `Anda adalah generator SQL yang aman. Tugas Anda hanya membuat SELECT query.

${SCHEMA_DESC}

Aturan wajib:
1. HANYA SELECT.
2. Jangan INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE.
3. Jangan UNION, subquery, multi-statement, komentar SQL, atau tabel lain.
4. Gunakan LOWER() untuk case-insensitive comparison.
5. Jangan filter primary_kecamatan dengan "malang". "Malang" berarti Kabupaten Malang, bukan kecamatan.
6. Untuk perbandingan nilai seperti positive/negative, gunakan GROUP BY, bukan hanya COUNT gabungan.
7. Jangan gunakan STRING_AGG atau fungsi selain COUNT.
8. Balas HANYA SQL satu baris.
9. Dilarang memberi penjelasan, markdown, teks pembuka, atau teks penutup.
10. Untuk SELECT (bukan COUNT/GROUP BY), selalu ambil id, title, url, content_clean, source.
11. Jangan hanya ambil title doang — butuh id, url, dan content_clean juga.

Contoh:
User: "ada berapa berita positif di Kepanjen?"
SQL: SELECT COUNT(*) FROM clean_news_articles WHERE LOWER(sentiment)='positive' AND LOWER(primary_kecamatan)='kepanjen'

User: "total berita per kategori"
SQL: SELECT category, COUNT(*) as total FROM clean_news_articles GROUP BY category ORDER BY total DESC

User: "tampilkan berita tentang pendidikan"
SQL: SELECT id, title, url, content_clean, source FROM clean_news_articles WHERE LOWER(category)='pendidikan'

User: "${safeQuery}"
SQL:`;

  const result = await callLLM([{ role: 'user', content: prompt }], 160, 0, callConfig);
  const cleaned = extractSelectStatement(result).replace(/;$/, '');
  if (!/FROM\s+clean_news_articles/i.test(cleaned)) return 'SELECT COUNT(*) FROM clean_news_articles';
  return cleaned;
}

export function validateSQL(sql: string): boolean {
  const upper = sql.toUpperCase().trim();
  if (!upper.startsWith('SELECT')) return false;
  if (!/FROM\s+CLEAN_NEWS_ARTICLES/i.test(upper)) return false;
  if ((upper.match(/;/g) || []).length > 0) return false;

  const noStrings = upper.replace(/'[^']*'/g, '');
  const blocked = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE', 'UNION', 'STRING_AGG', '--', '/*'];
  if (/PRIMARY_KECAMATAN\)?\s*=\s*'MALANG'/.test(upper)) return false;
  return !blocked.some((word) => noStrings.includes(word));
}

function stripUnsupportedKecamatan(sql: string): string {
  return sql
    .replace(/\s+AND\s+LOWER\(primary_kecamatan\)\s*=\s*'malang'/gi, '')
    .replace(/\s+WHERE\s+LOWER\(primary_kecamatan\)\s*=\s*'malang'\s*(?=GROUP|ORDER|LIMIT|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWhere(sql: string): string {
  const match = sql.match(/\sWHERE\s+(.+?)(?:\sGROUP\s+BY|\sORDER\s+BY|\sLIMIT|$)/i);
  return match?.[1]?.trim() || '';
}

async function countRows(whereClause = ''): Promise<number> {
  let q = supabase.from('clean_news_articles').select('*', { count: 'exact', head: true }) as unknown as QueryBuilder;
  if (whereClause) q = applyWhereFilters(q, whereClause);
  const { count } = await q;
  return count || 0;
}

function applyWhereFilters(q: QueryBuilder, whereClause: string): QueryBuilder {
  const parts = whereClause.split(/\s+AND\s+/i);
  for (const part of parts) {
    const inMatch = part.match(/(?:LOWER\()?(\w+)(?:\))?\s+IN\s*\(([^)]+)\)/i);
    if (inMatch) {
      const col = inMatch[1];
      const values = inMatch[2]
        .split(',')
        .map((v) => v.replace(/'/g, '').trim().toLowerCase())
        .filter(Boolean);
      if (values.length > 0) q = q.in(col, values);
      continue;
    }

    const eqMatch = part.match(/(LOWER\()?(\w+)(?:\))?\s*=\s*'([^']+)'/i);
    if (!eqMatch) continue;

    const hasLower = Boolean(eqMatch[1]);
    const col = eqMatch[2];
    const val = eqMatch[3].toLowerCase();
    if (col === 'primary_kecamatan' && !VALID_KECAMATAN.includes(val)) continue;
    if (val === 'null') q = q.is(col, null);
    else if (hasLower) q = q.ilike(col, val);
    else q = q.eq(col, val);
  }
  return q;
}

async function groupCount(col: string, alias: string, whereClause = ''): Promise<Record<string, unknown>[]> {
  if (!ALLOWED_COLUMNS.includes(col)) return [];
  const values = col === 'primary_kecamatan'
    ? VALID_KECAMATAN
    : col === 'category'
      ? ['ekonomi', 'sosial', 'kesehatan', 'pendidikan']
      : col === 'sentiment'
        ? ['positive', 'negative', 'neutral']
        : [];

  if (values.length === 0) return [];

  const rows = await Promise.all(values.map(async (value) => {
    const extra = `${whereClause ? `${whereClause} AND ` : ''}LOWER(${col})='${value}'`;
    return { [col]: value, [alias]: await countRows(extra) };
  }));

  return rows
    .filter((row) => Number(row[alias]) > 0)
    .sort((a, b) => Number(b[alias]) - Number(a[alias]));
}

export async function executeSQL(rawSql: string): Promise<{ data: Record<string, unknown>[]; meta: string }> {
  const sql = stripUnsupportedKecamatan(rawSql);
  const countMatch = sql.match(/SELECT\s+COUNT\(\*\)(?:\s+as\s+\w+)?\s+FROM\s+clean_news_articles(?:\s+WHERE\s+(.+))?/i);
  if (countMatch) {
    return { data: [{ count: await countRows(extractWhere(sql)) }], meta: 'count' };
  }

  const groupMatch = sql.match(/SELECT\s+(?:LOWER\()?(\w+)(?:\))?,\s*COUNT\(\*\)\s+as\s+(\w+)\s+FROM\s+clean_news_articles(?:\s+WHERE\s+(.+?))?\s+GROUP\s+BY\s+\1(?:\s+ORDER\s+BY\s+\2\s+DESC)?/i);
  if (groupMatch) {
    return { data: await groupCount(groupMatch[1], groupMatch[2], extractWhere(sql)), meta: 'group' };
  }

  const selectMatch = sql.match(/^SELECT\s+(.+?)\s+FROM\s+clean_news_articles(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?\s*$/i);
  if (selectMatch) {
    const fields = selectMatch[1].split(',').map((f) => f.trim());
    let q = supabase.from('clean_news_articles').select(fields.join(','), { count: 'exact', head: false }) as unknown as QueryBuilder;
    if (selectMatch[2]) q = applyWhereFilters(q, selectMatch[2]);
    if (selectMatch[3]) {
      const [orderCol, orderDir] = selectMatch[3].trim().split(/\s+/);
      q = q.order(orderCol, { ascending: (orderDir || '').toUpperCase() !== 'DESC' });
    }
    q = q.limit(Math.min(parseInt(selectMatch[4] || '50', 10), 100));
    const { data } = await q;
    return { data: (data || []) as unknown as Record<string, unknown>[], meta: 'select' };
  }

  return { data: [], meta: 'tidak bisa parse SQL' };
}
