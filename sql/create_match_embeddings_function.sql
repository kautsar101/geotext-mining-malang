-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS match_news_embeddings(
  vector,
  double precision,
  integer,
  text,
  text,
  text
);
DROP FUNCTION IF EXISTS match_news_embeddings(
  vector,
  double precision,
  integer,
  text,
  text,
  text,
  text,
  text
);

-- Create match function for vector similarity search
CREATE OR REPLACE FUNCTION match_news_embeddings(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5,
  filter_kecamatan text DEFAULT NULL,
  filter_kategori text DEFAULT NULL,
  filter_sentimen text DEFAULT NULL,
  filter_date_from text DEFAULT NULL,
  filter_date_to text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  article_id bigint,
  chunk_index integer,
  chunk_text text,
  title text,
  source text,
  url text,
  primary_kecamatan text,
  published_date text,
  category text,
  sentiment text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ne.id,
    ne.article_id,
    ne.chunk_index,
    ne.chunk_text,
    cna.title,
    cna.source,
    cna.url,
    ne.primary_kecamatan,
    ne.published_date,
    cna.category,
    cna.sentiment,
    1 - (ne.embedding <=> query_embedding) AS similarity
  FROM news_embeddings ne
  LEFT JOIN clean_news_articles cna ON ne.article_id = cna.id
  WHERE 1 - (ne.embedding <=> query_embedding) > match_threshold
    AND (filter_kecamatan IS NULL OR LOWER(ne.primary_kecamatan) = LOWER(filter_kecamatan))
    AND (filter_kategori IS NULL OR LOWER(cna.category) = LOWER(filter_kategori))
    AND (filter_sentimen IS NULL OR LOWER(cna.sentiment) = LOWER(filter_sentimen))
    AND (filter_date_from IS NULL OR ne.published_date >= filter_date_from)
    AND (filter_date_to IS NULL OR ne.published_date < filter_date_to)
  ORDER BY ne.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
