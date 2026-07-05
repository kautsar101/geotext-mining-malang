import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const KECAMATAN_STR = "Ampelgading, Bantur, Bululawang, Dampit, Dau, Donomulyo, Gedangan, Gondanglegi, Jabung, Kalipare, Karangploso, Kasembon, Kepanjen, Kromengan, Lawang, Ngajum, Ngantang, Pagak, Pagelaran, Pakis, Pakisaji, Poncokusumo, Pujon, Singosari, Sumbermanjing Wetan, Sumberpucung, Tajinan, Tirtoyudo, Tumpang, Turen, Wagir, Wajak, Wonosari";

const PROVIDERS: Record<string, { api: string; model: string; openaiCompat: boolean }> = {
  gemini: { api: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash', openaiCompat: true },
  deepseek: { api: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', openaiCompat: true },
  openai: { api: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', openaiCompat: true },
  claude: { api: 'https://api.anthropic.com/v1/messages', model: 'claude-3-haiku-20240307', openaiCompat: false },
};

async function callLLM(provider: string, apiKey: string, messages: any[], maxTokens = 200, temp = 0) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);

  if (cfg.openaiCompat) {
    const res = await fetch(cfg.api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, max_tokens: maxTokens, temperature: temp }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${provider} error (${res.status}): ${err.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  const systemMsg = messages.find((m: any) => m.role === 'system')?.content || '';
  const chatMessages = messages.filter((m: any) => m.role !== 'system').map((m: any) => ({ role: m.role, content: m.content }));

  const res = await fetch(cfg.api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      system: systemMsg,
      messages: chatMessages,
      temperature: temp,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude error (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

/**
 * Generate embedding via Gemini API (free). Returns normalized vector array.
 */
async function generateEmbedding(apiKey: string, text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text }] },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding error: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.embedding?.values || [];
}

/**
 * Search by embedding similarity via Supabase RPC.
 */
async function embedSearch(
  queryText: string,
  apiKey: string,
  filters: { kecamatan?: string | null; kategori?: string | null; sentimen?: string | null },
  limit = 5
): Promise<any[]> {
  const embedding = await generateEmbedding(apiKey, queryText).catch(() => null);
  if (!embedding || embedding.length === 0) return [];

  const { data, error } = await supabase.rpc('match_news_embeddings', {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: limit,
    filter_kecamatan: filters.kecamatan || null,
    filter_kategori: filters.kategori || null,
    filter_sentimen: filters.sentimen || null,
  });

  if (error) {
    console.error('Embed search error:', error);
    return [];
  }

  // Deduplicate by article_id, keep highest similarity
  const seen = new Set<number>();
  return (data || []).filter((r: any) => {
    if (seen.has(r.article_id)) return false;
    seen.add(r.article_id);
    return true;
  });
}

export async function POST(request: NextRequest) {
  try {
    const { query, apiKey, provider = 'gemini', messages } = await request.json();
    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'Query diperlukan' }, { status: 400 });
    }
    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ error: 'API Key diperlukan' }, { status: 400 });
    }
    if (!PROVIDERS[provider]) {
      return NextResponse.json({ error: `Provider tidak dikenal: ${provider}` }, { status: 400 });
    }

    const searchTerm = query.trim();
    const allWords = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);

    // Step 1: Parse query with LLM
    const parsePrompt = `Anda adalah parser query berita. Dari query berikut, ekstrak structured data dalam format JSON SAJA tanpa teks lain.

Kategori yang dikenal: kesehatan (rumah sakit, dokter, penyakit, vaksin, puskesmas, sakit, sehat, operasi, pasien), pendidikan (sekolah, guru, siswa, belajar, ujian, kampus, universitas), ekonomi (bisnis, usaha, pasar, umkm, dagang, kerja, harga), sosial (warga, masyarakat, bantuan, desa, bansos, bencana, banjir, korban).

Kecamatan di Kabupaten Malang: ${KECAMATAN_STR}.

Sentimen: positive (sukses, berhasil, prestasi, baik), negative (kecelakaan, tewas, korupsi, gagal, buruk, bencana, kriminal), neutral.

Contoh output:
{"kecamatan":"Kepanjen","kategori":"kesehatan","keywords":["warga","sakit"],"sentimen":"negative"}
{"kecamatan":null,"kategori":"pendidikan","keywords":["sekolah","baru"],"sentimen":"positive"}

Query: ${searchTerm}`;

    let parsed: { kecamatan?: string | null; kategori?: string | null; keywords?: string[]; sentimen?: string | null } = {};
    try {
      const parseResult = await callLLM(provider, apiKey, [{ role: 'user', content: parsePrompt }], 80, 0);
      const cleaned = parseResult.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
      if (parsed.keywords && Array.isArray(parsed.keywords)) {
        const lowerKec = parsed.kecamatan?.toLowerCase();
        const lowerKat = parsed.kategori?.toLowerCase();
        const lowerSent = parsed.sentimen?.toLowerCase();
        const catWords = ['kesehatan','pendidikan','ekonomi','sosial','positif','negatif','neutral','positive','negative'];
        parsed.keywords = parsed.keywords.filter(k => {
          const lk = k.toLowerCase();
          return lk !== lowerKec && lk !== lowerKat && lk !== lowerSent && !catWords.includes(lk) && lk.length > 1;
        });
      }
    } catch {
      parsed = { kecamatan: null, kategori: null, keywords: allWords.filter(w => w.length > 2), sentimen: null };
    }

    const keywords = (parsed.keywords || []).filter(k => k.length > 2);

    // Step 2: Try embedding search first (semantic)
    let sources: any[] = [];
    let usedEmbedding = false;

    try {
      // Build a richer query text for embedding
      const embedQuery = [
        searchTerm,
        ...(parsed.keywords || []),
      ].filter(Boolean).join(' ');

      const embedResults = await embedSearch(embedQuery, apiKey, {
        kecamatan: parsed.kecamatan,
        kategori: parsed.kategori,
        sentimen: parsed.sentimen,
      }, 5);

      if (embedResults.length > 0) {
        usedEmbedding = true;
        sources = embedResults.map((r: any, i: number) => ({
          id: i + 1,
          title: r.title,
          snippet: (r.chunk_text || '').slice(0, 200),
          source: r.source,
          date: r.published_date,
          kecamatan: r.primary_kecamatan,
          category: r.category || r.kategori,
          sentiment: r.sentiment,
          url: r.url,
          similarity: Math.round((r.similarity || 0) * 100),
        }));
      }
    } catch (e) {
      console.warn('Embedding search failed, falling back to keyword search:', e);
    }

    // Step 3: Fallback to keyword search if embedding returned nothing
    if (!usedEmbedding || sources.length === 0) {
      let dbQuery = supabase.from('clean_news_articles').select('id, title, content_clean, source, published_date, primary_kecamatan, category, sentiment, url');
      if (parsed.kecamatan) dbQuery = dbQuery.eq('primary_kecamatan', parsed.kecamatan);
      if (parsed.kategori) dbQuery = dbQuery.eq('category', parsed.kategori);
      if (parsed.sentimen) dbQuery = dbQuery.eq('sentiment', parsed.sentimen);

      let articles: any[] = [];

      let q1 = dbQuery.limit(5);
      if (keywords.length > 0) q1 = q1.or(keywords.map(k => `title.ilike.%${k}%`).join(','));
      const { data: r1 } = await q1;
      articles = r1 || [];

      if (articles.length === 0 && parsed.kategori) {
        let q2 = supabase.from('clean_news_articles').select('id, title, content_clean, source, published_date, primary_kecamatan, category, sentiment, url').limit(5);
        if (parsed.kecamatan) q2 = q2.eq('primary_kecamatan', parsed.kecamatan);
        if (parsed.sentimen) q2 = q2.eq('sentiment', parsed.sentimen);
        if (keywords.length > 0) q2 = q2.or(keywords.map(k => `title.ilike.%${k}%`).join(','));
        const { data: r2 } = await q2;
        articles = r2 || [];
      }

      if (articles.length === 0 && keywords.length > 0) {
        const { data: r3 } = await supabase.from('clean_news_articles').select('id, title, content_clean, source, published_date, primary_kecamatan, category, sentiment, url')
          .or(keywords.map(k => `title.ilike.%${k}%`).join(',')).limit(5);
        articles = r3 || [];
      }

      sources = articles.map((art: any, i: number) => ({
        id: i + 1,
        title: art.title,
        snippet: (art.content_clean || '').slice(0, 200),
        source: art.source,
        date: art.published_date,
        kecamatan: art.primary_kecamatan,
        category: art.category,
        sentiment: art.sentiment,
        url: art.url,
      }));
    }

    // Step 4: Build context
    let context = '';
    if (sources.length > 0) {
      const searchType = usedEmbedding ? 'semantic' : 'keyword';
      context = sources.map(s =>
        `[${s.id}] Judul: ${s.title}\n   Sumber: ${s.source} | URL: ${s.url} | Kecamatan: ${s.kecamatan || '-'} | Tanggal: ${s.date || '-'} | Kategori: ${s.category || '-'} | Sentimen: ${s.sentiment || '-'}${usedEmbedding ? ` | Relevansi: ${s.similarity}%` : ''}\n   Cuplikan: ${s.snippet}`
      ).join('\n\n');
    } else {
      context = 'Tidak ada berita terkait di database.';
    }

    const parseInfo = [
      parsed.kecamatan ? `Kecamatan: ${parsed.kecamatan}` : null,
      parsed.kategori ? `Kategori: ${parsed.kategori}` : null,
      parsed.sentimen ? `Sentimen: ${parsed.sentimen}` : null,
      keywords.length > 0 ? `Kata kunci: ${keywords.join(', ')}` : null,
      usedEmbedding ? `Metode pencarian: semantic (vektor)` : `Metode pencarian: keyword`,
    ].filter(Boolean).join('\n');

    const systemPrompt = `Kamu adalah asisten analisis berita daerah.

ATURAN FORMAT JAWABAN:
- Tiap kali menyebut info dari sumber, tambahkan citation [1], [2] di AKHIR kalimat.
- Contoh benar: "Proyek di Kepanjen sudah dimulai [1]. Pendidikan di Singosari meningkat [2]."
- Contoh salah: "Menurut berita [1], proyek sudah dimulai." (citation di awal)
- Gunakan format rich text: **bold** untuk penekanan, ### untuk sub-heading, - untuk bullet points, paragraf terpisah.
- Jawab Bahasa Indonesia natural, informatif, dengan struktur rapi.
- JANGAN mengarang. Jika konteks kosong, katakan "Tidak ada berita terkait di database."
- Pakai URL dari konteks untuk citation link.

Hasil parsing query:
${parseInfo}

Konteks berita:
${context}`;

    if (!parsed.kecamatan && !parsed.kategori && !parsed.sentimen && keywords.length === 0 && allWords.every(w => ["halo","hai","hi","test","coba","tanya"].includes(w))) {
      return NextResponse.json({
        response: "Halo! Ada yang bisa saya bantu? Silakan tanyakan topik berita atau informasi daerah yang Anda cari.",
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