import { supabase } from '@/backend/db/supabase';
import type { QueryFilters, QueryGroup, QueryPlan } from './router';

type QueryResult = { data?: unknown; count?: number | null; error?: unknown };
type QueryBuilder = {
  eq: (column: string, value: unknown) => QueryBuilder;
  ilike: (column: string, value: string) => QueryBuilder;
  gte: (column: string, value: string) => QueryBuilder;
  lt: (column: string, value: string) => QueryBuilder;
  order: (column: string, options: { ascending: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
} & PromiseLike<QueryResult>;

const VALID_KECAMATAN = [
  'ampelgading', 'bantur', 'bululawang', 'dampit', 'dau', 'donomulyo', 'gedangan',
  'gondanglegi', 'jabung', 'kalipare', 'karangploso', 'kasembon', 'kepanjen',
  'kromengan', 'lawang', 'ngajum', 'ngantang', 'pagak', 'pagelaran', 'pakis',
  'pakisaji', 'poncokusumo', 'pujon', 'singosari', 'sumbermanjing wetan',
  'sumberpucung', 'tajinan', 'tirtoyudo', 'tumpang', 'turen', 'wagir', 'wajak',
  'wonosari',
];
const VALID_CATEGORIES = ['ekonomi', 'sosial', 'kesehatan', 'pendidikan'];
const VALID_SENTIMENTS = ['positive', 'negative', 'neutral'];

const GROUP_VALUES: Record<Exclude<QueryGroup, 'published_date'>, string[]> = {
  category: VALID_CATEGORIES,
  sentiment: VALID_SENTIMENTS,
  primary_kecamatan: VALID_KECAMATAN,
};

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function applyFilters(
  query: QueryBuilder,
  filters: QueryFilters,
  omit: QueryGroup | null = null,
): QueryBuilder {
  let next = query;
  if (filters.kecamatan && omit !== 'primary_kecamatan') next = next.ilike('primary_kecamatan', filters.kecamatan);
  if (filters.kategori && omit !== 'category') next = next.ilike('category', filters.kategori);
  if (filters.sentimen && omit !== 'sentiment') next = next.ilike('sentiment', filters.sentimen);
  if (filters.dateFrom && omit !== 'published_date') next = next.gte('published_date', filters.dateFrom);
  if (filters.dateTo && omit !== 'published_date') next = next.lt('published_date', filters.dateTo);
  return next;
}

function sqlWhere(filters: QueryFilters): string {
  const clauses: string[] = [];
  if (filters.kecamatan) clauses.push(`LOWER(primary_kecamatan)='${escapeLiteral(filters.kecamatan)}'`);
  if (filters.kategori) clauses.push(`LOWER(category)='${escapeLiteral(filters.kategori)}'`);
  if (filters.sentimen) clauses.push(`LOWER(sentiment)='${escapeLiteral(filters.sentimen)}'`);
  if (filters.dateFrom) clauses.push(`published_date >= '${escapeLiteral(filters.dateFrom)}'`);
  if (filters.dateTo) clauses.push(`published_date < '${escapeLiteral(filters.dateTo)}'`);
  return clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
}

export function compilePlanToSQL(plan: QueryPlan): string {
  const where = sqlWhere(plan.filters);
  if (plan.operation === 'count') {
    return `SELECT COUNT(*) FROM clean_news_articles${where}`;
  }
  if (plan.operation === 'group_count' && plan.groupBy) {
    return `SELECT ${plan.groupBy}, COUNT(*) AS total FROM clean_news_articles${where} GROUP BY ${plan.groupBy} ORDER BY total DESC`;
  }
  if (plan.operation === 'trend') {
    return `SELECT published_date, COUNT(*) AS total FROM clean_news_articles${where} GROUP BY published_date ORDER BY published_date ASC`;
  }
  return `SELECT id, title, url, content_clean, source, published_date, primary_kecamatan, category, sentiment FROM clean_news_articles${where} ORDER BY published_date ${plan.sort?.direction === 'asc' ? 'ASC' : 'DESC'} LIMIT ${plan.limit}`;
}

async function countRows(filters: QueryFilters, omit: QueryGroup | null = null): Promise<number> {
  let query = supabase.from('clean_news_articles').select('*', { count: 'exact', head: true }) as unknown as QueryBuilder;
  query = applyFilters(query, filters, omit);
  const { count, error } = await query;
  if (error) throw new Error(`Database count gagal: ${String(error)}`);
  return count || 0;
}

async function executeGroupCount(plan: QueryPlan): Promise<Record<string, unknown>[]> {
  const groupBy = plan.groupBy;
  if (!groupBy) return [];

  if (groupBy === 'published_date') return executeTrend(plan);

  const filterValue = groupBy === 'category'
    ? plan.filters.kategori
    : groupBy === 'sentiment'
      ? plan.filters.sentimen
      : plan.filters.kecamatan;
  const values = filterValue ? [filterValue] : GROUP_VALUES[groupBy];
  const rows = await Promise.all(values.map(async (value) => {
    let query = supabase.from('clean_news_articles').select('*', { count: 'exact', head: true }) as unknown as QueryBuilder;
    query = applyFilters(query, plan.filters, groupBy).ilike(groupBy, value);
    const { count, error } = await query;
    if (error) throw new Error(`Database aggregation gagal: ${String(error)}`);
    return { [groupBy]: value, total: count || 0 };
  }));

  return rows.filter((row) => Number(row.total) > 0).sort((a, b) => Number(b.total) - Number(a.total));
}

async function executeTrend(plan: QueryPlan): Promise<Record<string, unknown>[]> {
  let query = supabase.from('clean_news_articles')
    .select('published_date')
    .order('published_date', { ascending: true })
    .limit(10_000) as unknown as QueryBuilder;
  query = applyFilters(query, plan.filters);
  const { data, error } = await query;
  if (error) throw new Error(`Database trend gagal: ${String(error)}`);

  const counts = new Map<string, number>();
  for (const row of (data || []) as Array<{ published_date?: unknown }>) {
    const date = String(row.published_date || '').slice(0, 10);
    if (date) counts.set(date, (counts.get(date) || 0) + 1);
  }
  return [...counts].map(([published_date, total]) => ({ published_date, total }));
}

async function executeList(plan: QueryPlan): Promise<Record<string, unknown>[]> {
  let query = supabase.from('clean_news_articles')
    .select('id,title,url,content_clean,source,published_date,primary_kecamatan,category,sentiment')
    .order('published_date', { ascending: plan.sort?.direction === 'asc' })
    .limit(plan.limit) as unknown as QueryBuilder;
  query = applyFilters(query, plan.filters);
  const { data, error } = await query;
  if (error) throw new Error(`Database select gagal: ${String(error)}`);
  return (data || []) as Record<string, unknown>[];
}

export async function executeQueryPlan(plan: QueryPlan): Promise<{ data: Record<string, unknown>[]; meta: 'count' | 'group' | 'trend' | 'select' }> {
  if (plan.operation === 'count') {
    return { data: [{ count: await countRows(plan.filters) }], meta: 'count' };
  }
  if (plan.operation === 'group_count') {
    return { data: await executeGroupCount(plan), meta: 'group' };
  }
  if (plan.operation === 'trend') {
    return { data: await executeTrend(plan), meta: 'trend' };
  }
  return { data: await executeList(plan), meta: 'select' };
}
