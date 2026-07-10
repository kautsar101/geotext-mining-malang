"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { Search, ExternalLink, ChevronLeft, ChevronRight, X, ArrowUpDown, ArrowUp, ArrowDown, Calendar } from "lucide-react";
import AnimatedNumber from "@/frontend/components/AnimatedNumber";
import KecamatanShapeIcon from "@/frontend/components/KecamatanShapeIcon";
import { CategoryBadge, SentimentBadge } from "@/frontend/components/NewsBadges";

const API = "/api/db?table=clean_news_articles";

interface Article {
  id: number; title: string; source: string; published_date: string;
  category: string; sentiment: string; primary_kecamatan: string; url: string;
}

type SortKey = "title" | "source" | "category" | "sentiment" | "primary_kecamatan" | "published_date";
type SortDir = "asc" | "desc" | null;

const PAGE_OPTIONS = [10, 20, 50, 100, 0] as const; // 0 = all

export default function NewsPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [kecFilter, setKecFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [jumpPage, setJumpPage] = useState("");
  const [detail, setDetail] = useState<Article | null>(null);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [sources, setSources] = useState<string[]>([]);
  const [kecs, setKecs] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("published_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    title: 300, source: 120, category: 100, sentiment: 90, kecamatan: 110, date: 100
  });

  // Fetch filter options
  useEffect(() => {
    (async () => {
      const data = await fetch(`${API}&select=source,primary_kecamatan`).then(r => r.json()).then(d => d.data || []);
      setSources([...new Set<string>(data.map((x: any) => x.source).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
      setKecs([...new Set<string>(data.map((x: any) => x.primary_kecamatan).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
    })();
  }, []);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, sourceFilter, categoryFilter, sentimentFilter, kecFilter, dateFrom, dateTo, pageSize, sortKey, sortDir]);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    const select = `id,title,source,published_date,category,sentiment,primary_kecamatan,url`;
    const limit = pageSize === 0 ? 999999 : pageSize;
    const offset = pageSize === 0 ? 0 : (page - 1) * pageSize;
    let url = `${API}&select=${encodeURIComponent(select)}&limit=${limit}&offset=${offset}&count=exact`;

    if (sortKey && sortDir) url += `&order=${sortKey}.${sortDir === 'asc' ? 'asc' : 'desc'}`;
    if (search) {
      const words = search.trim().split(/\s+/).filter(Boolean);
      if (words.length > 0) url += `&title=ilike.%25${encodeURIComponent(words.join('%25'))}%25`;
    }
    if (sourceFilter !== "all") url += `&source=eq.${encodeURIComponent(sourceFilter)}`;
    if (categoryFilter !== "all") url += `&category=eq.${categoryFilter === "null" ? "null" : encodeURIComponent(categoryFilter)}`;
    if (sentimentFilter !== "all") url += `&sentiment=eq.${encodeURIComponent(sentimentFilter)}`;
    if (kecFilter !== "all") url += `&primary_kecamatan=eq.${encodeURIComponent(kecFilter)}`;
    if (dateFrom) url += `&published_date=gte.${dateFrom}`;
    if (dateTo) url += `&published_date=lte.${dateTo}`;

    try {
      const res = await fetch(url).then(r => r.json());
      setArticles(res.data || []);
      setTotalFiltered(res.count || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [search, sourceFilter, categoryFilter, sentimentFilter, kecFilter, dateFrom, dateTo, page, pageSize, sortKey, sortDir]);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  const effectiveLimit = pageSize === 0 ? totalFiltered : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / effectiveLimit));

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortDir(null); setSortKey("published_date"); }
      else { setSortDir("asc"); setSortKey(key); }
    } else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown size={13} className="opacity-30" />;
    return sortDir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  const startResize = (col: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[col] || 100;
    const onMouseMove = (ev: MouseEvent) => setColWidths(prev => ({ ...prev, [col]: Math.max(60, startW + ev.clientX - startX) }));
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleJumpPage = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const p = parseInt(jumpPage);
      if (p >= 1 && p <= totalPages) setPage(p);
      setJumpPage("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-[-5rem] z-[1000] -mx-4 pb-4 pl-20 pr-4 pt-1 lg:top-[-2rem] lg:-mx-8 lg:px-8"
        style={{ background: "linear-gradient(to bottom, var(--bg-primary) 0%, color-mix(in srgb, var(--bg-primary) 98%, transparent) 38%, color-mix(in srgb, var(--bg-primary) 90%, transparent) 60%, color-mix(in srgb, var(--bg-primary) 66%, transparent) 82%, transparent 100%)" }}>
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>List Berita</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}><AnimatedNumber value={totalFiltered} /> artikel ditemukan</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 p-4 rounded-xl items-center" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="relative w-full sm:flex-1 sm:min-w-[180px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input type="text" placeholder="Cari judul..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2"
            style={{ color: "var(--text-primary)", borderColor: "var(--border)", backgroundColor: "var(--bg-primary)" }} />
        </div>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border" style={{ color: "var(--text-primary)", backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
          <option value="all">Semua Sumber</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border" style={{ color: "var(--text-primary)", backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
          <option value="all">Semua Kategori</option>
          {["ekonomi", "sosial", "kesehatan", "pendidikan", "null"].sort().map(item => (
            <option key={item} value={item}>{item === "null" ? "Tidak Dikategorikan" : item}</option>
          ))}
        </select>
        <select value={sentimentFilter} onChange={e => setSentimentFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border" style={{ color: "var(--text-primary)", backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
          <option value="all">Semua Sentimen</option>
          {["positive", "neutral", "negative"].sort().map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={kecFilter} onChange={e => setKecFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border" style={{ color: "var(--text-primary)", backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
          <option value="all">Semua Kecamatan</option>
          {kecs.map(k => <option key={k} value={k}>{k}</option>)}
        </select>

        {/* Date range — 1 compact component */}
        <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm" style={{ color: "var(--text-primary)", backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
          <Calendar size={14} style={{ color: "var(--text-muted)" }} />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-transparent border-none outline-none text-xs" style={{ color: "var(--text-primary)" }} />
          <span style={{ color: "var(--text-muted)" }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-transparent border-none outline-none text-xs" style={{ color: "var(--text-primary)" }} />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  {([
                    { key: "title" as SortKey, label: "Judul", w: colWidths.title },
                    { key: "source" as SortKey, label: "Sumber", w: colWidths.source },
                    { key: "category" as SortKey, label: "Kategori", w: colWidths.category },
                    { key: "sentiment" as SortKey, label: "Sentimen", w: colWidths.sentiment },
                    { key: "primary_kecamatan" as SortKey, label: "Kecamatan", w: colWidths.kecamatan },
                    { key: "published_date" as SortKey, label: "Tanggal", w: colWidths.date },
                  ]).map(col => (
                    <th key={col.key} style={{ width: col.w, position: "relative" }}
                      className={`text-left p-3 font-medium text-xs cursor-pointer select-none ${col.key === "primary_kecamatan" ? "hidden md:table-cell" : ""}`}
                      onClick={() => handleSort(col.key)}>
                      <div className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                        <span>{col.label}</span>
                        <SortIcon col={col.key} />
                      </div>
                      <div onMouseDown={(e) => startResize(col.key, e)}
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[var(--accent)] opacity-0 hover:opacity-50 transition-opacity" />
                    </th>
                  ))}
                  <th className="p-3" style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {articles.map(a => (
                  <tr key={a.id} className="border-b cursor-pointer transition-colors" style={{ borderColor: "var(--border)" }}
                    onMouseEnter={e => (e.currentTarget as any).style.backgroundColor = "var(--bg-primary)"}
                    onMouseLeave={e => (e.currentTarget as any).style.backgroundColor = "transparent"}
                    onClick={() => setDetail(a)}>
                    <td className="p-3 font-medium truncate" style={{ color: "var(--text-primary)" }} title={a.title}>{a.title}</td>
                    <td className="p-3" style={{ color: "var(--text-secondary)" }}>{a.source}</td>
                    <td className="p-3"><CategoryBadge category={a.category} /></td>
                    <td className="p-3"><SentimentBadge sentiment={a.sentiment} /></td>
                    <td className="hidden p-3 md:table-cell"><span className="flex items-center gap-2" style={{ color: "var(--text-secondary)" }}><KecamatanShapeIcon name={a.primary_kecamatan} />{a.primary_kecamatan || "-"}</span></td>
                    <td className="p-3 text-xs" style={{ color: "var(--text-muted)" }}>{a.published_date}</td>
                    <td className="p-3">
                      <a href={a.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded-lg inline-block" style={{ color: "var(--text-muted)" }}>
                        <ExternalLink size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border-t flex-wrap gap-3" style={{ borderColor: "var(--border)" }}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                {/* Rows per page */}
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  <span>Baris:</span>
                  <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="px-2 py-1 rounded border text-xs" style={{ color: "var(--text-primary)", backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                    {PAGE_OPTIONS.map(v => (
                      <option key={v} value={v}>{v === 0 ? "Semua" : v}</option>
                    ))}
                  </select>
                </div>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {pageSize === 0
                    ? <>Menampilkan <AnimatedNumber value={totalFiltered} /> dari <AnimatedNumber value={totalFiltered} /></>
                    : <>Halaman {page} dari {totalPages} (<AnimatedNumber value={totalFiltered} /> total)</>}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Jump to page */}
                <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  <span>Ke:</span>
                  <input type="number" min={1} max={totalPages} value={jumpPage}
                    onChange={e => setJumpPage(e.target.value)}
                    onKeyDown={handleJumpPage}
                    className="w-14 px-2 py-1 rounded border text-xs text-center"
                    style={{ color: "var(--text-primary)", backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
                    placeholder={`1-${totalPages}`} />
                </div>

                {/* Prev / Next */}
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="p-1.5 rounded-lg disabled:opacity-30" style={{ color: "var(--text-secondary)" }}>
                  <ChevronLeft size={16} />
                </button>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                  className="p-1.5 rounded-lg disabled:opacity-30" style={{ color: "var(--text-secondary)" }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} onClick={() => setDetail(null)}>
          <div className="max-w-xl w-full rounded-xl p-6 shadow-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{detail.title}</h3>
              <button onClick={() => setDetail(null)} className="p-1 rounded-lg" style={{ color: "var(--text-muted)" }}><X size={18} /></button>
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
