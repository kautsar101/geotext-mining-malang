"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Area, AreaChart, Legend
} from "recharts";
import {
  Newspaper, MapPin, Hash, TrendingUp,
  ChevronLeft, ChevronRight, ExternalLink,
  ArrowUpRight, ArrowDownRight, Activity, FileText
} from "lucide-react";

const API = "/api/db?table=clean_news_articles";
function fetcher(params: string) {
  return fetch(`${API}&${params}`).then(r => r.json()).then(d => d.data || []);
}
function fetcherOne(params: string) {
  return fetch(`${API}&${params}`).then(r => r.json()).then(d => d);
}

const C = {
  c1: "#0D9488", c2: "#14B8A6", c3: "#F59E0B", c4: "#6366F1", c5: "#E11D48", c6: "#EAB308",
  primary: "#0D9488", secondary: "#14B8A6", tertiary: "#5EEAD4", muted: "#99F6E4",
  tm: "#9C9590", ts: "#6B6560", bd: "#E5E0D8", bg: "#FFFFFF",
};
function getDark() {
  return {
    c1: "#2DD4BF", c2: "#14B8A6", c3: "#FBBF24", c4: "#818CF8", c5: "#FB7185", c6: "#FACC15",
    primary: "#2DD4BF", secondary: "#14B8A6", tertiary: "#0D9488", muted: "#115E59",
    tm: "#78716C", ts: "#A8A29E", bd: "#44403C", bg: "#292524",
  };
}

function fmtDate(d: string) {
  const date = new Date(d);
  return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}`;
}

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const isDark = mounted && document.documentElement.classList.contains("dark");
  const cc = isDark ? getDark() : C;

  const [heroArticles, setHeroArticles] = useState<any[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>({});
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [kecData, setKecData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [sentimentData, setSentimentData] = useState<any[]>([]);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [latestNews, setLatestNews] = useState<any[]>([]);
  const [sourceData, setSourceData] = useState<any[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const heroRaw = await fetcher("select=id%2Ctitle%2Csource%2Cpublished_date%2Curl&limit=200");
      const hero = heroRaw.sort(() => Math.random() - 0.5).slice(0, 5);
      setHeroArticles(hero);

      const countR = await fetcherOne("select=id&count=exact&limit=0");
      const total = countR.count || 0;

      const all = await fetcher("select=source%2Ccategory%2Cprimary_kecamatan%2Cpublished_date%2Csentiment");
      const newsRaw = await fetcher("select=title%2Csource%2Ccategory%2Csentiment%2Cpublished_date%2Curl%2Ccontent_clean&order=published_date.desc&limit=10");
      setLatestNews(newsRaw.filter((n: any) => n.title).slice(0, 10));

      const catMap: Record<string, number> = {};
      const kecMap: Record<string, number> = {};
      const sentMap: Record<string, number> = {};
      const srcMap: Record<string, number> = {};
      const dayCnt: Record<string, number> = {};
      const uniqSrc = new Set<string>();
      const uniqKec = new Set<string>();

      (all || []).forEach((r: any) => {
        if (r.source) { srcMap[r.source] = (srcMap[r.source] || 0) + 1; uniqSrc.add(r.source); }
        const cat = r.category || "uncategorized"; catMap[cat] = (catMap[cat] || 0) + 1;
        if (r.primary_kecamatan) { kecMap[r.primary_kecamatan] = (kecMap[r.primary_kecamatan] || 0) + 1; uniqKec.add(r.primary_kecamatan); }
        const s = r.sentiment || "unknown"; sentMap[s] = (sentMap[s] || 0) + 1;
        if (r.published_date) {
          const d = r.published_date.slice(0, 10);
          dayCnt[d] = (dayCnt[d] || 0) + 1;
        }
      });

      setCategoryData(Object.entries(catMap).map(([name, value]) => ({ name, value })));
      setSourceData(Object.entries(srcMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value })));
      setKecData(Object.entries(kecMap).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([name, value]) => ({ name, value })));
      setSentimentData(
        ["positive", "neutral", "negative"]
          .map(name => ({ name, value: sentMap[name] || 0 }))
          .filter(d => d.value > 0)
      );

      // Daily data (scrollable)
      const sorted = Object.entries(dayCnt).sort(([a], [b]) => a.localeCompare(b));
      setDailyData(sorted.map(([date, value]) => ({ date: fmtDate(date), value })));

      const pos = sentMap.positive || 0;
      const totalSent = pos + (sentMap.neutral || 0) + (sentMap.negative || 0);
      setStats({
        total, sources: uniqSrc.size, kecamatan: uniqKec.size,
        sentimentPos: pos,
        posRatio: totalSent > 0 ? Math.round((pos / totalSent) * 100) : 0,
      });

    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    if (heroArticles.length < 2) return;
    const t = setInterval(() => setHeroIndex(i => (i + 1) % heroArticles.length), 1600);
    return () => clearInterval(t);
  }, [heroArticles.length]);

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
    </div>
  );

  const hero = heroArticles[heroIndex];
  const pRatio = stats.posRatio || 0;
  const cardStyle = { backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 };
  const SENT_COLORS = [cc.c2, cc.c6, cc.c5];
  const chartBarSize = dailyData.length > 60 ? 20 : 30;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Dashboard</h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Geotext Mining Kabupaten Malang</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
          style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          <Activity size={16} /><span>Live</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

      {/* Hero Carousel */}
      {hero && (
        <div className="relative rounded-2xl overflow-hidden h-60 shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-800/80 via-stone-800/60 to-stone-900/90" />
          <div className="relative h-full flex flex-col justify-end p-8">
            <span className="text-amber-200/80 text-xs font-semibold uppercase tracking-widest mb-2">{hero.source}</span>
            <a href={hero.url} target="_blank" rel="noopener noreferrer"
              className="text-white text-2xl font-bold leading-tight hover:underline flex items-start gap-3 max-w-3xl">
              {hero.title}<ExternalLink size={18} className="flex-shrink-0 mt-1 opacity-50" />
            </a>
            <p className="text-white/50 text-xs mt-2">{hero.published_date}</p>
          </div>
          <div className="absolute bottom-5 right-8 flex gap-2">
            {heroArticles.map((_, i) => (
              <button key={i} onClick={() => setHeroIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === heroIndex ? "w-8 bg-white" : "w-2 bg-white/30"}`} />
            ))}
          </div>
          <button onClick={() => setHeroIndex(i => (i - 1 + heroArticles.length) % heroArticles.length)}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => setHeroIndex(i => (i + 1) % heroArticles.length)}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white">
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { icon: Newspaper, label: "Total Artikel", value: stats.total?.toLocaleString(), change: "7d", up: true, color: cc.c1 },
          { icon: Hash, label: "Sumber Berita", value: stats.sources?.toString(), change: `${stats.sources}`, up: true, color: cc.c2 },
          { icon: MapPin, label: "Kecamatan", value: stats.kecamatan?.toString(), change: "33", up: true, color: cc.c3 },
          { icon: TrendingUp, label: "Sentimen Positif", value: `${pRatio}%`, change: `${stats.sentimentPos}`, up: pRatio > 50, color: pRatio > 50 ? cc.c2 : cc.c5 },
        ].map((m, i) => (
          <div key={i} style={cardStyle} className="card-hover">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl flex items-center justify-center" style={{ backgroundColor: m.color + "20", minWidth: 34, minHeight: 34 }}>
                <m.icon size={18} style={{ color: m.color }} />
              </div>
              <span className="text-[10px] font-medium flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                7d {m.up ? <ArrowUpRight size={11} className="text-emerald-600" /> : <ArrowDownRight size={11} className="text-rose-600" />}
              </span>
            </div>
            <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{m.value}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{m.label}</p>
          </div>
        ))}
      </div>

      {/* Row 1: Sentimen Pie + Kategori Bar */}
      <div className="grid grid-cols-2 gap-4">
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Sentimen</h3>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={70} outerRadius={110}
                paddingAngle={4} dataKey="value"
                label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {sentimentData.map((_, i) => <Cell key={i} fill={SENT_COLORS[i % SENT_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => [v.toLocaleString(), "Artikel"] as [string, string]}
                contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12 }} />
              <Legend formatter={(v) => <span style={{ color: cc.ts, fontSize: 12 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Kategori Berita</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: cc.tm }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: cc.ts }} width={80} />
              <Tooltip formatter={(v: any) => [v.toLocaleString(), "Artikel"] as [string, string]}
                contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12 }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={cc.primary} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table: 10 Berita Terbaru */}
      <div style={cardStyle}>
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <FileText size={16} />10 Berita Terbaru
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ color: "var(--text-secondary)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Judul</th>
                <th className="text-left py-2 px-2 font-semibold hidden md:table-cell" style={{ color: "var(--text-muted)" }}>Isi</th>
                <th className="text-left py-2 px-2 font-semibold hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>Sumber</th>
                <th className="text-left py-2 px-2 font-semibold hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>Kategori</th>
                <th className="text-center py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Sentimen</th>
                <th className="text-right py-2 px-2 font-semibold hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {latestNews.map((n: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }} className="hover:bg-black/5 transition-colors">
                  <td className="py-2 px-2 max-w-[180px]">
                    <a href={n.url} target="_blank" rel="noopener noreferrer"
                      className="font-medium hover:underline line-clamp-2 block"
                      style={{ color: "var(--text-primary)" }}>{n.title}</a>
                  </td>
                  <td className="py-2 px-2 text-[10px] hidden md:table-cell max-w-[180px]" style={{ color: "var(--text-muted)" }}>
                    <span className="line-clamp-2">{(n.content_clean || "").slice(0, 120)}</span>
                  </td>
                  <td className="py-2 px-2 text-[10px] hidden sm:table-cell">{n.source}</td>
                  <td className="py-2 px-2 text-[10px] hidden sm:table-cell">{n.category || "—"}</td>
                  <td className="py-2 px-2 text-center">
                    <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                      n.sentiment === "positive" ? "bg-emerald-200 text-emerald-900" :
                      n.sentiment === "negative" ? "bg-red-200 text-red-900" :
                      "bg-yellow-200 text-yellow-900"
                    }`}>{n.sentiment || "—"}</span>
                  </td>
                  <td className="py-2 px-2 text-right text-[10px] hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>
                    {n.published_date?.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 2: 3 charts — ganti Per Hari jadi Daily Trend scrollable */}
      <div className="grid grid-cols-3 gap-4">
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Top Kecamatan</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={kecData} layout="vertical" margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: cc.tm }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: cc.ts }} width={70} />
              <Tooltip formatter={(v: any) => [v.toLocaleString(), "Berita"] as [string, string]}
                contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12 }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={cc.primary} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Tren Publikasi</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthlyData}>
              <defs><linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cc.c1} stopOpacity={0.3} />
                <stop offset="95%" stopColor={cc.c1} stopOpacity={0} />
              </linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: cc.tm }} />
              <YAxis tick={{ fontSize: 10, fill: cc.tm }} />
              <Tooltip formatter={(v: any) => [v.toLocaleString(), "Berita"] as [string, string]}
                contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12, fontSize: 11 }} />
              <Area type="monotone" dataKey="berita" stroke={cc.c1} fill="url(#trendGrad)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Tren Harian</h3>
          <div className="overflow-x-auto" style={{ height: 260 }}>
            <ResponsiveContainer width={Math.max(300, dailyData.length * chartBarSize)} height="100%">
              <BarChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 8, fill: cc.tm }} />
                <YAxis hide />
                <Tooltip formatter={(v: any) => [v.toLocaleString(), "Publikasi"] as [string, string]}
                  contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12 }} />
                <Bar dataKey="value" radius={[2, 2, 0, 0]} fill={cc.c2} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom row: Top Sources + Pie Sumber */}
      <div className="grid grid-cols-2 gap-4">
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Top 5 Sumber Berita</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sourceData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: cc.tm }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: cc.ts }} width={90} />
              <Tooltip formatter={(v: any) => [v.toLocaleString(), "Artikel"] as [string, string]}
                contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12, fontSize: 11 }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={cc.secondary} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Proporsi Sumber Berita</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={sourceData} cx="50%" cy="50%" innerRadius={40} outerRadius={80}
                paddingAngle={3} dataKey="value"
                label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {sourceData.map((_, i) => <Cell key={i} fill={[cc.c2, cc.c3, cc.c4, cc.c5, cc.c6][i % 5]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => [v.toLocaleString(), "Artikel"] as [string, string]}
                contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12 }} />
              <Legend formatter={(v) => <span style={{ color: cc.ts, fontSize: 11 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}