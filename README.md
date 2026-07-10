# GeoText Mining Malang

Dashboard dan LLM assistant untuk eksplorasi berita daerah Kabupaten Malang.

## Fitur

- Dashboard ringkasan berita, kategori, sentimen, dan kecamatan.
- Peta kecamatan Kabupaten Malang berbasis GeoJSON.
- LLM chat dengan routing otomatis untuk chat biasa, RAG, dan SQL.
- Guest memakai Groq `llama-3.1-8b-instant` dari key pool database tanpa input API key.
- Admin memakai DeepSeek `deepseek-v4-flash`, RAG top 20, dan konteks 10 percakapan terakhir.

## Struktur

```txt
src/
  app/        # Next.js routes, pages, dan API entrypoints
  backend/    # logic server: LLM, SQL, RAG, memory, database
  frontend/   # komponen UI reusable
```

## Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Environment:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## LLM Admin

1. Jalankan migration tabel key pool dan admin dari SQL lokal yang tersimpan aman di Supabase SQL Editor.
2. Tambahkan akun admin menggunakan hash bcrypt. Password tidak boleh ditulis di Git.
3. Tambahkan API key `groq` dan `deepseek` ke `llm_api_keys`. Key hanya dibaca server melalui `SUPABASE_SERVICE_ROLE_KEY` dan tidak pernah dikirim ke browser.

Tombol `Admin` hanya muncul pada halaman `/llm`. Login membuat cookie session `HttpOnly` yang berlaku 12 jam. Lima login gagal memicu cooldown 15 menit.

## Validasi

```bash
npx tsc --noEmit
npx eslint src/app/api/llm/route.ts src/backend src/frontend
```
