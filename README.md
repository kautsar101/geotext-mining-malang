# GeoText Mining Malang

Dashboard dan LLM assistant untuk eksplorasi berita daerah Kabupaten Malang.

## Fitur

- Dashboard ringkasan berita, kategori, sentimen, dan kecamatan.
- Peta kecamatan Kabupaten Malang berbasis GeoJSON.
- LLM chat dengan routing otomatis untuk chat biasa, RAG, dan SQL.
- Provider LLM berbasis API key user: OpenAI, Groq, Gemini, Claude, dan DeepSeek.

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
```

## Validasi

```bash
npx tsc --noEmit
npx eslint src/app/api/llm/route.ts src/backend src/frontend
```
