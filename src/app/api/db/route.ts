import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table');
  const select = searchParams.get('select') || '*';
  const limit = parseInt(searchParams.get('limit') || '1000');
  const offset = parseInt(searchParams.get('offset') || '0');
  const countMode = searchParams.get('count');

  if (!table) {
    return NextResponse.json({ error: 'table parameter required' }, { status: 400 });
  }

  try {
    let query = supabase.from(table).select(select, countMode === 'exact' ? { count: 'exact' } : undefined);

    // Apply filters from query params (e.g., &source=eq.radar_malang)
    const filters: [string, string][] = [];
    searchParams.forEach((value, key) => {
      if (['table', 'select', 'limit', 'offset', 'count'].includes(key)) return;
      filters.push([key, value]);
    });

    for (const [col, opAndVal] of filters) {
      const parts = opAndVal.split('.');
      if (parts.length === 2) {
        const [op, val] = parts;
        if (op === 'eq') query = query.eq(col, val === 'null' ? null : val);
        else if (op === 'ilike') query = query.ilike(col, val);
        else if (op === 'is') query = query.is(col, val === 'null' ? null : val);
        else if (op === 'not.is') query = query.not(col, 'is', val === 'null' ? null : val);
      }
    }

    query = query.range(offset, offset + limit - 1);
    if (searchParams.get('order')) {
      const [col, dir] = (searchParams.get('order') || '').split('.');
      query = query.order(col, { ascending: dir === 'asc' });
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, count });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}