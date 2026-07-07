-- LLM UI eval validation queries.
-- Run the matching query in Supabase SQL Editor, then compare with the LLM answer.

-- 1. Total berita
SELECT COUNT(*) AS total_berita
FROM clean_news_articles;

-- 2. Berita positif di Kepanjen
SELECT COUNT(*) AS total_positif_kepanjen
FROM clean_news_articles
WHERE LOWER(sentiment) = 'positive'
  AND LOWER(primary_kecamatan) = 'kepanjen';

-- 3. Berita negatif di Lawang
SELECT COUNT(*) AS total_negatif_lawang
FROM clean_news_articles
WHERE LOWER(sentiment) = 'negative'
  AND LOWER(primary_kecamatan) = 'lawang';

-- 4. Total berita per kategori
SELECT COALESCE(category, '(tanpa kategori)') AS category, COUNT(*) AS total
FROM clean_news_articles
GROUP BY category
ORDER BY total DESC;

-- 5. Kecamatan dengan berita paling banyak
SELECT COALESCE(primary_kecamatan, '(tanpa kecamatan)') AS kecamatan, COUNT(*) AS total
FROM clean_news_articles
GROUP BY primary_kecamatan
ORDER BY total DESC
LIMIT 10;

-- 6. Total berita pendidikan
SELECT COUNT(*) AS total_pendidikan
FROM clean_news_articles
WHERE LOWER(category) = 'pendidikan';

-- 7. Berita kesehatan negatif
SELECT COUNT(*) AS total_kesehatan_negatif
FROM clean_news_articles
WHERE LOWER(category) = 'kesehatan'
  AND LOWER(sentiment) = 'negative';

-- 8. Total berita per sentimen
SELECT COALESCE(sentiment, '(tanpa sentimen)') AS sentiment, COUNT(*) AS total
FROM clean_news_articles
GROUP BY sentiment
ORDER BY total DESC;

-- 9. Contoh sumber untuk topik banjir
SELECT id, title, source, published_date, primary_kecamatan, url
FROM clean_news_articles
WHERE title ILIKE '%banjir%' OR content_clean ILIKE '%banjir%'
ORDER BY published_date DESC
LIMIT 10;

-- 10. Contoh sumber untuk pendidikan
SELECT id, title, source, published_date, primary_kecamatan, url
FROM clean_news_articles
WHERE LOWER(category) = 'pendidikan'
   OR title ILIKE '%sekolah%'
   OR content_clean ILIKE '%sekolah%'
ORDER BY published_date DESC
LIMIT 10;

-- 11. Contoh sumber untuk kesehatan
SELECT id, title, source, published_date, primary_kecamatan, url
FROM clean_news_articles
WHERE LOWER(category) = 'kesehatan'
ORDER BY published_date DESC
LIMIT 10;

-- 12. Contoh sumber untuk Kepanjen
SELECT id, title, source, published_date, sentiment, category, url
FROM clean_news_articles
WHERE LOWER(primary_kecamatan) = 'kepanjen'
ORDER BY published_date DESC
LIMIT 10;

-- 13. Hybrid: positif vs negatif Kepanjen
SELECT sentiment, COUNT(*) AS total
FROM clean_news_articles
WHERE LOWER(primary_kecamatan) = 'kepanjen'
  AND LOWER(sentiment) IN ('positive', 'negative')
GROUP BY sentiment
ORDER BY sentiment;

-- 14. Hybrid: ekonomi vs pendidikan
SELECT category, COUNT(*) AS total
FROM clean_news_articles
WHERE LOWER(category) IN ('ekonomi', 'pendidikan')
GROUP BY category
ORDER BY category;

