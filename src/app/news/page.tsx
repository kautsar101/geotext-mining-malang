"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Search, ExternalLink, ChevronLeft, ChevronRight, X } from "lucide-react";

const API = "/api/db?table=clean_news_articles";

interface Article {
  id: number; title: string; source: string; published_date: string;
  category: string; sentiment: string; primary_kecamatan: string; url: string;
}

export default function NewsPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [kecFilter, setKecFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Article | null>(null);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [sources, setSources] = useState<string[]>([]);
  const [kecs, setKecs] = useState<string[]>([]);
  const PAGE_SIZE = 20;

  useEffect(() => {
    (async () => {
      const data = await fetch(`${API}&select=source,primary_kecamatan`).then(r => r.json()).then(d => d.data || []);
      setSources([...new Set<string>(data.map((x: any) => x.source).filter(Boolean))]);
      setKecs([...new Set<string>(data.map((x: any) => x.primary_kecamatan).filter(Boolean))]);
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      const select = `id,title,source,published_date,category,sentiment,primary_kecamatan,url`;
      let url = `${API}&select=${encodeURIComponent(select)}&order=published_date.desc&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}&count=exact`;
      if (search) url += `&title=ilike.%25${encodeURIComponent(search)}%25`;
      if (sourceFilter !== "all") url += `&source=eq.${encodeURIComponent(sourceFilter)}`;
      if (categoryFilter !== "all") url += `&category=eq.${categoryFilter === "null" ? "null" : encodeURIComponent(categoryFilter)}`;
      if (sentimentFilter !== "all") url += `&sentiment=eq.${encodeURIComponent(sentimentFilter)}`;
      if (kecFilter !== "all") url += `&primary_kecamatan=eq.${encodeURIComponent(kecFilter)}`;

      try {
        const res = await fetch(url).then(r => r.json());
        if (mounted) {
          const data = res.data || [];
          setArticles(data);
          setTotalFiltered(res.count || 0);
        }
      } catch (e) { console.error(e); }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [search, sourceFilter, categoryFilter, sentimentFilter, kecFilter, page]);

  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const sentColors: Record<string, string> = {
    positive: "text-emerald-600 bg-emerald-50", negative: "text-rose-600 bg-rose-50", neutral: "text-amber-600 bg-amber-50",
  };
  const catColors: Record<string, string> = {
    ekonomi: "text-blue-600 bg-blue-50",
    sosial: "text-purple-600 bg-purple-50",
    kesehatan: "text-teal-600 bg-teal-50",
    pendidikan: "text-indigo-600 bg-indigo-50",
  };
  const catIcons: Record<string, string> = {
    ekonomi: "💰",
    sosial: "🤝",
    kesehatan: "🏥",
    pendidikan: "📚",
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>List Berita</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{totalFiltered} artikel ditemukan</p>
      </div>

      <div className="flex flex-wrap gap-3 p-4 rounded-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input type="text" placeholder="Cari judul..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-transparent border focus:outline-none focus:ring-2"
            style={{ color: "var(--text-primary)", borderColor: "var(--border)", backgroundColor: "var(--bg-primary)" }} />
        </div>
        {[
          { value: sourceFilter, set: setSourceFilter, all: "Semua Sumber", items: sources },
          { value: categoryFilter, set: setCategoryFilter, all: "Semua Kategori", items: ["ekonomi","sosial","kesehatan","pendidikan","null"], labels: { null: "Tidak Dikategorikan" } },
          { value: sentimentFilter, set: setSentimentFilter, all: "Semua Sentimen", items: ["positive","neutral","negative"] },
          { value: kecFilter, set: setKecFilter, all: "Semua Kecamatan", items: kecs },
        ].map((f, i) => (
          <select key={i} value={f.value} onChange={e => { (f.set as any)(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-lg border"
            style={{ color: "var(--text-primary)", backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
            <option value="all">{f.all}</option>
            {(f.items as string[]).map(item => (
              <option key={item} value={item}>{(f.labels as any)?.[item] || item}</option>
            ))}
          </select>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="text-left p-3 font-medium">Judul</th>
                  <th className="text-left p-3 font-medium">Sumber</th>
                  <th className="text-left p-3 font-medium">Kategori</th>
                  <th className="text-left p-3 font-medium">Sentimen</th>
                  <th className="text-left p-3 font-medium">Kecamatan</th>
                  <th className="text-left p-3 font-medium">Tanggal</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {articles.map(a => (
                  <tr key={a.id} className="border-b cursor-pointer transition-colors"
                    style={{ borderColor: "var(--border)" }}
                    onMouseEnter={e => (e.currentTarget as any).style.backgroundColor = "var(--bg-primary)"}
                    onMouseLeave={e => (e.currentTarget as any).style.backgroundColor = "transparent"}
                    onClick={() => setDetail(a)}>
                    <td className="p-3 font-medium max-w-xs truncate" style={{ color: "var(--text-primary)" }}>{a.title}</td>
                    <td className="p-3" style={{ color: "var(--text-secondary)" }}>{a.source}</td>
                    <td className="p-3">
                      {a.category && catColors[a.category] ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${catColors[a.category]}`}>
                          {catIcons[a.category] || ""} {a.category}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-muted)" }}>-</span>
                      )}
                    </td>
                    <td className="p-3">
                      {a.sentiment ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${sentColors[a.sentiment] || "text-gray-600 bg-gray-50"}`}>{a.sentiment}</span>
                      ) : "-"}
                    </td>
                    <td className="p-3" style={{ color: "var(--text-secondary)" }}>{a.primary_kecamatan || "-"}</td>
                    <td className="p-3 text-xs" style={{ color: "var(--text-muted)" }}>{a.published_date}</td>
                    <td className="p-3">
                      <a href={a.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded-lg transition-colors inline-block"
                        style={{ color: "var(--text-muted)" }}>
                        <ExternalLink size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t" style={{ borderColor: "var(--border)" }}>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Halaman {page} dari {totalPages}</span>
              <div className="flex gap-1">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" style={{ color: "var(--text-secondary)" }}>
                  <ChevronLeft size={16} />
                </button>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" style={{ color: "var(--text-secondary)" }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} onClick={() => setDetail(null)}>
          <div className="max-w-lg w-full rounded-xl p-6 shadow-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{detail.title}</h3>
              <button onClick={() => setDetail(null)} className="p-1 rounded-lg" style={{ color: "var(--text-muted)" }}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <p><strong>Sumber:</strong> {detail.source}</p>
              <p><strong>Tanggal:</strong> {detail.published_date}</p>
              <p><strong>Kategori:</strong> {detail.category || "-"}</p>
              <p><strong>Sentimen:</strong> {detail.sentiment || "-"}</p>
              <p><strong>Kecamatan:</strong> {detail.primary_kecamatan || "-"}</p>
            </div>
            <a href={detail.url} target="_blank" rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white"
              style={{ backgroundColor: "var(--accent)" }}>
              Baca Artikel <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
