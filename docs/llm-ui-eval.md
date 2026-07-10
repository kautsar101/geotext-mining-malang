# LLM UI Eval

Pakai halaman `/llm`, lalu tanyakan prompt di bawah satu per satu.

Mode guest adalah default dan memakai Groq dari key pool server. Mode admin memakai DeepSeek V4 Flash dari key pool database, mengambil maksimal 20 dokumen RAG, dan membawa 10 percakapan terakhir sebagai konteks. API key tidak pernah dimasukkan atau dikirim dari browser.

Nilai manual:

```txt
0 = salah
1 = sebagian benar
2 = benar
```

Kolom penilaian:

```txt
route       apakah harusnya SQL/RAG/chat benar
answer      jawaban sesuai data
source      citation dan sumber relevan
format      format mengikuti permintaan user
```

## SQL Only

1. Ada berapa total berita di database?
2. Ada berapa berita positif di Kepanjen?
3. Ada berapa berita negatif di Lawang?
4. Total berita per kategori apa saja?
5. Kecamatan mana yang punya berita paling banyak?
6. Ada berapa berita pendidikan?
7. Ada berapa berita kesehatan dengan sentimen negatif?
8. Bandingkan jumlah berita positif, netral, dan negatif.

## RAG Only

1. Cari berita tentang banjir di Kabupaten Malang dan rangkum singkat.
2. Apa isu pendidikan yang muncul di berita Malang?
3. Cari berita kesehatan terbaru dan jelaskan poin pentingnya.
4. Berita apa yang membahas ekonomi masyarakat?
5. Rangkum berita tentang Kepanjen dengan citation.
6. Apa isu sosial yang paling sering muncul dari sumber berita?
7. Cari berita tentang sekolah dan sebutkan sumbernya.
8. Jelaskan berita terkait kecelakaan jika ada di database.

## Hybrid SQL + RAG + Chat

1. Berapa jumlah berita positif dan negatif di Kepanjen, lalu jelaskan isu utamanya.
2. Bandingkan total berita ekonomi dan pendidikan, lalu beri contoh isu dari berita.
3. Kecamatan mana yang paling banyak diberitakan, lalu rangkum beberapa topik beritanya.
4. Ada berapa berita kesehatan negatif, lalu jelaskan contoh kasusnya dari sumber.
5. Hitung total berita per sentimen, lalu simpulkan kondisi umum pemberitaan.
6. Berapa berita pendidikan di Malang, lalu buat list 3 isu utama.

## Expected Behavior

```txt
SQL question:
- harus menyebut angka
- angka harus cocok dengan SQL Editor
- tidak wajib citation

RAG question:
- harus punya citation [1], [2]
- sumber harus relevan
- jangan mengarang kalau sumber tidak ada

Hybrid question:
- angka harus cocok SQL
- rangkuman harus memakai citation
- jawaban boleh pakai paragraf/list sesuai prompt
```
