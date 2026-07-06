import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const KECAMATAN_STR = "Ampelgading, Bantur, Bululawang, Dampit, Dau, Donomulyo, Gedangan, Gondanglegi, Jabung, Kalipare, Karangploso, Kasembon, Kepanjen, Kromengan, Lawang, Ngajum, Ngantang, Pagak, Pagelaran, Pakis, Pakisaji, Poncokusumo, Pujon, Singosari, Sumbermanjing Wetan, Sumberpucung, Tajinan, Tirtoyudo, Tumpang, Turen, Wagir, Wajak, Wonosari";

const PROVIDERS: Record<string, { api: string; model: string; openaiCompat: boolean; needsKey: boolean }> = {
  ollama: { api: 'http://localhost:11434/v1/chat/completions', model: 'llama3.2', openaiCompat: true, needsKey: false },
  gemini: { api: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash', openaiCompat: true, needsKey: true },
  groq: { api: 'https://api.groq.com/openai/v1/chat/completions', model: 'mixtral-8x7b-32768', openaiCompat: true, needsKey: true },
  deepseek: { api: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', openaiCompat: true, needsKey: true },
  openai: { api: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', openaiCompat: true, needsKey: true },
  claude: { api: 'https://api.anthropic.com/v1/messages', model: 'claude-3-haiku-20240307', openaiCompat: false, needsKey: true },
};

async function callLLM(provider: string, apiKey: string, messages: any[], maxTokens = 200, temp = 0) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);

  if (cfg.openaiCompat) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.needsKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(cfg.api, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: cfg.model, messages, max_tokens: maxTokens, temperature: temp }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${provider} error (${res.status}): ${err.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // Claude
  const systemMsg = messages.find((m: any) => m.role === 'system')?.content || '';
  const chatMessages = messages.filter((m: any) => m.role !== 'system').map((m: any) => ({ role: m.role, content: m.content }));
  const res = await fetch(cfg.api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system: systemMsg, messages: chatMessages, temperature: temp }),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Claude error (${res.status}): ${err.slice(0, 200)}`); }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function generateEmbedding(apiKey: string, text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] } }),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Embedding error: ${err.slice(0, 200)}`); }
  const data = await res.json();
  return data.embedding?.values || [];
}

async function progressiveSearch(
  queryText: string,
  apiKey: string,
  filters: { kecamatan?: string | null; kategori?: string | null; sentimen?: string | null },
): Promise<{ sources: any[]; searchInfo: string }> {
  const allSources: any[] = [];
  const searchSteps: string[] = [];
  let seen = new Set<number>();

  function dedup(items: any[]): any[] {
    return items.filter((r: any) => {
      const key = r.article_id || r.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  try {
    const embedding = await generateEmbedding(apiKey, queryText).catch(() => null);
    if (embedding && embedding.length > 0) {
      const { data } = await supabase.rpc('match_news_embeddings', {
        query_embedding: embedding, match_threshold: 0.45, match_count: 10,
        filter_kecamatan: filters.kecamatan || null,
        filter_kategori: filters.kategori || null,
        filter_sentimen: filters.sentimen || null,
      });
      if (data && data.length > 0) { const items = dedup(data); allSources.push(...items); searchSteps.push(`semantic (filter)`); }
    }
  } catch {}

  if (allSources.length < 3 && filters.sentimen) {
    try {
      const embedding = await generateEmbedding(apiKey, queryText).catch(() => null);
      if (embedding) {
        const { data } = await supabase.rpc('match_news_embeddings', {
          query_embedding: embedding, match_threshold: 0.45, match_count: 10,
          filter_kecamatan: filters.kecamatan || null, filter_kategori: filters.kategori || null, filter_sentimen: null,
        });
        if (data) { const items = dedup(data); allSources.push(...items); searchSteps.push('semantic (tanpa sentimen)'); }
      }
    } catch {}
  }

  if (allSources.length < 3 && filters.kecamatan) {
    try {
      const embedding = await generateEmbedding(apiKey, queryText).catch(() => null);
      if (embedding) {
        const { data } = await supabase.rpc('match_news_embeddings', {
          query_embedding: embedding, match_threshold: 0.45, match_count: 10,
          filter_kecamatan: null, filter_kategori: filters.kategori || null, filter_sentimen: null,
        });
        if (data) { const items = dedup(data); allSources.push(...items); searchSteps.push('semantic (semua kec.)'); }
      }
    } catch {}
  }

  const keywords = queryText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (allSources.length < 3 && keywords.length > 0) {
    let q = supabase.from('clean_news_articles').select('id, title, content_clean, source, published_date, primary_kecamatan, category, sentiment, url').limit(5);
    if (filters.kecamatan) q = q.eq('primary_kecamatan', filters.kecamatan);
    if (filters.kategori) q = q.eq('category', filters.kategori);
    q = q.or(keywords.map(k => `title.ilike.%${k}%`).join(','));
    const { data: r1 } = await q;
    if (r1) { const items = dedup(r1); allSources.push(...items); searchSteps.push('keyword'); }
  }

  if (allSources.length === 0 && keywords.length > 0) {
    const { data: r2 } = await supabase.from('clean_news_articles')
      .select('id, title, content_clean, source, published_date, primary_kecamatan, category, sentiment, url')
      .or(keywords.map(k => `title.ilike.%${k}%`).join(',')).limit(5);
    if (r2) { const items = dedup(r2); allSources.push(...items); searchSteps.push('keyword (tanpa filter)'); }
  }

  const sources = allSources.slice(0, 8).map((r: any, i: number) => ({
    id: i + 1,
    title: r.title,
    snippet: (r.chunk_text || r.content_clean || '').slice(0, 200),
    source: r.source,
    date: r.published_date,
    kecamatan: r.primary_kecamatan,
    category: r.category,
    sentiment: r.sentiment,
    url: r.url,
    similarity: r.similarity ? Math.round(r.similarity * 100) : undefined,
  }));

  const searchInfo = searchSteps.length > 0 ? `Pencarian: ${searchSteps.join(' → ')}` : 'Tidak ada hasil';
  return { sources, searchInfo };
}

export async function POST(request: NextRequest) {
  try {
    const { query, apiKey, provider = 'ollama', messages } = await request.json();
    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'Query diperlukan' }, { status: 400 });
    }

    const cfg = PROVIDERS[provider];
    if (!cfg) return NextResponse.json({ error: `Provider tidak dikenal: ${provider}` }, { status: 400 });
    if (cfg.needsKey && (!apiKey || typeof apiKey !== 'string')) {
      return NextResponse.json({ error: `API Key diperlukan untuk ${provider}` }, { status: 400 });
    }

    const searchTerm = query.trim();
    const allWords = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);

    const parsePrompt = `Anda adalah parser query. Dari query berikut, ekstrak structured data JSON SAJA tanpa teks lain.

Kategori: kesehatan, pendidikan, ekonomi, sosial.
Kecamatan Kabupaten Malang: ${KECAMATAN_STR}.
Sentimen: positive, negative, neutral.

Contoh:
{"kecamatan":"Kepanjen","kategori":null,"sentimen":null,"keywords":["kecelakaan"]}
{"kecamatan":null,"kategori":"pendidikan","sentimen":null,"keywords":["sekolah"]}

Query: ${searchTerm}`;

    let parsed: any = {};
    try {
      const parseResult = await callLLM(provider, apiKey, [{ role: 'user', content: parsePrompt }], 80, 0);
      parsed = JSON.parse(parseResult.replace(/```json|```/g, '').trim());
    } catch {
      parsed = { kecamatan: null, kategori: null, keywords: allWords.filter(w => w.length > 2), sentimen: null };
    }

    const { sources, searchInfo } = await progressiveSearch(searchTerm, apiKey, {
      kecamatan: parsed.kecamatan, kategori: parsed.kategori, sentimen: parsed.sentimen,
    });

    const context = sources.length > 0
      ? sources.map(s =>
          `[${s.id}] Judul: ${s.title}\n   Sumber: ${s.source} | URL: ${s.url} | Kecamatan: ${s.kecamatan || '-'} | Tanggal: ${s.date || '-'} | Kategori: ${s.category || '-'} | Sentimen: ${s.sentiment || '-'}${s.similarity ? ` | Relevansi: ${s.similarity}%` : ''}\n   Cuplikan: ${s.snippet}`
        ).join('\n\n')
      : 'Tidak ada berita terkait di database.';

    const parseInfo = [
      parsed.kecamatan ? `Kecamatan: ${parsed.kecamatan}` : null,
      parsed.kategori ? `Kategori: ${parsed.kategori}` : null,
      parsed.sentimen ? `Sentimen: ${parsed.sentimen}` : null,
    ].filter(Boolean).join('\n');

    const systemPrompt = `Kamu adalah asisten analisis berita daerah.

ATURAN FORMAT JAWABAN:
- Tiap kali menyebut info dari sumber, tambahkan citation [1], [2] di AKHIR kalimat.
- Contoh benar: "Kecelakaan terjadi di Sumbermanjing [1]."
- Contoh salah: "Menurut berita [1], kecelakaan terjadi."
- Gunakan format rich text: **bold**, ### sub-heading, - bullet points.
- Jawab Bahasa Indonesia natural, informatif.
- JANGAN mengarang. Jika konteks kosong, katakan "Tidak ada berita terkait di database."
- Pakai URL dari konteks untuk citation link.
- Jika user mencari di kecamatan tertentu tapi tidak ada, sebutkan berita serupa dari kecamatan lain.

${parseInfo ? `Hasil parsing:\n${parseInfo}\n` : ''}
${searchInfo}

Konteks berita:
${context}`;

    const kw = (parsed.keywords || []).filter((k: string) => k.length > 2);

    if (!parsed.kecamatan && !parsed.kategori && !parsed.sentimen && kw.length === 0 && allWords.every((w: string) => ["halo","hai","hi","test","coba","tanya","pagi","siang","malam"].includes(w))) {
      return NextResponse.json({
        response: "Halo! Ada yang bisa saya bantu? Saya bisa mencari berita daerah — coba tanyakan topik, kecamatan, kategori, atau isu tertentu.",
        sources: [],
      });
    }

    const answer = await callLLM(provider, apiKey, [
      { role: 'system', content: systemPrompt },
      ...(messages || []).filter((m: any) => m.role !== 'system'),
      { role: 'user', content: searchTerm },
    ], 700, 0.3);

    return NextResponse.json({ response: answer, sources });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}