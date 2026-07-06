import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGE_SIZE = 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table')!;
  const select = searchParams.get('select') || '*';
  const limit = parseInt(searchParams.get('limit') || '0');
  const offset = parseInt(searchParams.get('offset') || '0');
  const countMode = searchParams.get('count');

  if (!table) {
    return NextResponse.json({ error: 'table parameter required' }, { status: 400 });
  }

  try {
    // Build the base query with filters
    function buildQuery() {
      let q = supabase.from(table).select(select, countMode === 'exact' ? { count: 'exact' } : undefined);

      const filters: [string, string][] = [];
      searchParams.forEach((value, key) => {
        if (['table', 'select', 'limit', 'offset', 'count'].includes(key)) return;
        filters.push([key, value]);
      });

      for (const [col, opAndVal] of filters) {
        const parts = opAndVal.split('.');
        if (parts.length === 2) {
          const [op, val] = parts;
          if (op === 'eq') q = q.eq(col, val === 'null' ? null : val);
          else if (op === 'ilike') q = q.ilike(col, val);
          else if (op === 'is') q = q.is(col, val === 'null' ? null : val);
          else if (op === 'not.is') q = q.not(col, 'is', val === 'null' ? null : val);
          else if (op === 'gte') q = q.gte(col, val);
          else if (op === 'lte') q = q.lte(col, val);
        }
      }

      if (searchParams.get('order')) {
        const [col, dir] = (searchParams.get('order') || '').split('.');
        q = q.order(col, { ascending: dir === 'asc' });
      }

      return q;
    }

    if (limit > 0) {
      // User asked for a specific limit — honor it directly
      let query = buildQuery();
      query = query.range(offset, offset + limit - 1);
      const { data, error, count } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data, count });
    }

    // No limit (limit=0) — fetch everything via pagination
    // Supabase caps at 1000 per request, so we loop in chunks
    let allData: any[] = [];
    let page = 0;

    while (true) {
      const start = page * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;
      let q = buildQuery();
      q = q.range(start, end);
      const resp = await q;
      if (resp.error) return NextResponse.json({ error: resp.error.message }, { status: 500 });
      const chunk = resp.data || [];
      allData = allData.concat(chunk);
      if (chunk.length < PAGE_SIZE) break;
      page++;
    }

    return NextResponse.json({ data: allData, count: allData.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}