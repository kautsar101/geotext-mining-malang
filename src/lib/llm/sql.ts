import { supabase } from '@/lib/supabase';
import { callLLM } from './providers';
import { sanitizeInput } from './guardrails';
import type { ProviderId } from './types';

type QueryBuilder = {
  eq: (column: string, value: unknown) => QueryBuilder;
  ilike: (column: string, value: string) => QueryBuilder;
  is: (column: string, value: null) => QueryBuilder;
  order: (column: string, options: { ascending: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
} & PromiseLike<{ data?: unknown; count?: number | null }>;

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

export async function generateSQL(provider: ProviderId, apiKey: string, query: string): Promise<string> {
  const safeQuery = sanitizeInput(query);
  const prompt = `Anda adalah generator SQL yang aman. Tugas Anda hanya membuat SELECT query.

${SCHEMA_DESC}

Aturan wajib:
1. HANYA SELECT.
2. Jangan INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE.
3. Jangan UNION, subquery, multi-statement, komentar SQL, atau tabel lain.
4. Gunakan LOWER() untuk case-insensitive comparison.
5. Balas HANYA SQL satu baris.

Contoh:
User: "ada berapa berita positif di Kepanjen?"
SQL: SELECT COUNT(*) FROM clean_news_articles WHERE LOWER(sentiment)='positive' AND LOWER(primary_kecamatan)='kepanjen'

User: "total berita per kategori"
SQL: SELECT category, COUNT(*) as total FROM clean_news_articles GROUP BY category ORDER BY total DESC

User: "${safeQuery}"
SQL:`;

  const result = await callLLM(provider, apiKey, [{ role: 'user', content: prompt }], 160, 0);
  const cleaned = result.replace(/```sql|```/gi, '').trim().replace(/;$/, '');
  if (!/FROM\s+clean_news_articles/i.test(cleaned)) return 'SELECT COUNT(*) FROM clean_news_articles';
  return cleaned;
}

export function validateSQL(sql: string): boolean {
  const upper = sql.toUpperCase().trim();
  if (!upper.startsWith('SELECT')) return false;
  if (!/FROM\s+CLEAN_NEWS_ARTICLES/i.test(upper)) return false;
  if ((upper.match(/;/g) || []).length > 0) return false;

  const noStrings = upper.replace(/'[^']*'/g, '');
  const blocked = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE', 'UNION', '--', '/*'];
  return !blocked.some((word) => noStrings.includes(word));
}

export async function executeSQL(sql: string): Promise<{ data: Record<string, unknown>[]; meta: string }> {
  function parseWhereToFilters(q: QueryBuilder, whereClause: string): QueryBuilder {
    const parts = whereClause.split(/\s+AND\s+/i);
    for (const part of parts) {
      const m = part.match(/(LOWER\()?(\w+)(?:\))?\s*=\s*'([^']+)'/i);
      if (!m) continue;

      const hasLower = Boolean(m[1]);
      const col = m[2];
      const val = m[3];
      if (val === 'null') {
        q = q.is(col, null);
      } else if (hasLower) {
        q = q.ilike(col, val);
      } else {
        q = q.eq(col, val);
      }
    }
    return q;
  }

  const countMatch = sql.match(/SELECT\s+COUNT\(\*\)(?:\s+as\s+\w+)?\s+FROM\s+clean_news_articles(?:\s+WHERE\s+(.+))?/i);
  if (countMatch) {
    let q = supabase.from('clean_news_articles').select('*', { count: 'exact', head: true }) as unknown as QueryBuilder;
    if (countMatch[1]) q = parseWhereToFilters(q, countMatch[1]);
    const { count } = await q;
    return { data: [{ count: count || 0 }], meta: 'count' };
  }

  const groupMatch = sql.match(/SELECT\s+(LOWER\()?(\w+)(?:\))?,\s*COUNT\(\*\)\s+as\s+(\w+)\s+FROM\s+clean_news_articles\s+GROUP\s+BY\s+\2(?:\s+ORDER\s+BY\s+\3\s+DESC)?/i);
  if (groupMatch) {
    const col = groupMatch[2];
    const alias = groupMatch[3];
    const { data } = await supabase.from('clean_news_articles').select(col);
    const counts: Record<string, number> = {};

    ((data || []) as unknown as Record<string, unknown>[]).forEach((row) => {
      const key = String(row[col] || '(tanpa)');
      counts[key] = (counts[key] || 0) + 1;
    });

    return {
      data: Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, total]) => ({ [col]: name, [alias]: total })),
      meta: 'group',
    };
  }

  const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+clean_news_articles(?:\s+WHERE\s+(.+))?(?:\s+ORDER\s+BY\s+(.+))?(?:\s+LIMIT\s+(\d+))?/i);
  if (selectMatch) {
    const fields = selectMatch[1].split(',').map((f) => f.trim());
    let q = supabase.from('clean_news_articles').select(fields.join(','), { count: 'exact', head: false }) as unknown as QueryBuilder;
    if (selectMatch[2]) q = parseWhereToFilters(q, selectMatch[2]);
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
