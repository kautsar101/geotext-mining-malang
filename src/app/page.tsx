"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Area, AreaChart, Brush
} from "recharts";
import {
  Newspaper, MapPin, Hash, TrendingUp,
  ChevronLeft, ChevronRight, ExternalLink,
  ArrowUpRight, ArrowDownRight, Activity, FileText
} from "lucide-react";
import AnimatedNumber from "@/frontend/components/AnimatedNumber";
import ViewportChart from "@/frontend/components/ViewportChart";

const API = "/api/db?table=clean_news_articles";
function fetcher(params: string) {
  return fetch(`${API}&${params}`).then(r => r.json()).then(d => d.data || []);
}
function fetcherOne(params: string) {
  return fetch(`${API}&${params}`).then(r => r.json()).then(d => d);
}

const C = {
  c1: "#157f3b", c2: "#4bb062", c3: "#F59E0B", c4: "#6366F1", c5: "#E11D48", c6: "#EAB308",
  primary: "#157f3b", secondary: "#4bb062", tertiary: "#98d594", muted: "#d7efc4",
  tm: "#9C9590", ts: "#6B6560", bd: "#E5E0D8", bg: "#FFFFFF",
};
function getDark() {
  return {
    c1: "#98d594", c2: "#4bb062", c3: "#FBBF24", c4: "#818CF8", c5: "#FB7185", c6: "#FACC15",
    primary: "#98d594", secondary: "#4bb062", tertiary: "#157f3b", muted: "#1f5f31",
    tm: "#78716C", ts: "#A8A29E", bd: "#44403C", bg: "#292524",
  };
}

function fmtDate(d: string) {
  const date = new Date(d);
  return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}`;
}

function fmtDateFull(d: string) {
  const date = new Date(d);
  const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${String(date.getDate()).padStart(2,'0')} ${months[date.getMonth()]} ${date.getFullYear()}`;
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
      setKecData(Object.entries(kecMap).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })));
      setSourceData(Object.entries(srcMap).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })));
      setSentimentData(
        ["positive", "neutral", "negative"]
          .map(name => ({ name, value: sentMap[name] || 0 }))
          .filter(d => d.value > 0)
      );

      const sorted = Object.entries(dayCnt).sort(([a], [b]) => a.localeCompare(b));
      setDailyData(sorted.map(([date, value]) => ({ date: fmtDate(date), value, fullDate: fmtDateFull(date), rawDate: date })));

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
  const SOURCE_COLORS = [cc.c2, cc.c3, cc.c4, cc.c5, cc.c6, cc.tm];
  const sourceTotal = sourceData.reduce((s, d) => s + d.value, 0);
  const sourceTop = sourceData.slice(0, 5);
  const sourceOtherBreakdown = sourceData.slice(5).map((d, i) => ({
    ...d,
    color: SOURCE_COLORS[(i + 5) % SOURCE_COLORS.length],
    percent: sourceTotal > 0 ? (d.value / sourceTotal) * 100 : 0,
  }));
  const sourceOtherValue = sourceData.slice(5).reduce((s, d) => s + d.value, 0);
  const sourcePieData = [
    ...sourceTop,
    ...(sourceOtherValue > 0 ? [{ name: "Lainnya", value: sourceOtherValue }] : []),
  ].map((d, i) => ({
    ...d,
    color: SOURCE_COLORS[i % SOURCE_COLORS.length],
    percent: sourceTotal > 0 ? (d.value / sourceTotal) * 100 : 0,
  }));
const CAT_COLORS: Record<string, string> = {
  ekonomi: "text-blue-600 bg-blue-50", sosial: "text-purple-600 bg-purple-50",
  kesehatan: "text-green-600 bg-green-50", pendidikan: "text-indigo-600 bg-indigo-50",
};
const CAT_ICONS: Record<string, string> = { ekonomi: "💰", sosial: "🤝", kesehatan: "🏥", pendidikan: "📚" };

  const lineChartId = "dailyTrendGrad";

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="rounded-xl px-4 py-3 shadow-lg text-sm" style={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}` }}>
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{d.fullDate}</p>
          <p className="text-lg font-bold mt-1" style={{ color: cc.c2 }}>
            {d.value.toLocaleString()} <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>berita</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-[-5rem] z-[1000] -mx-4 flex items-center justify-between pb-4 pl-20 pr-4 pt-1 lg:top-[-2rem] lg:-mx-8 lg:px-8"
        style={{ background: "linear-gradient(to bottom, var(--bg-primary) 0%, color-mix(in srgb, var(--bg-primary) 98%, transparent) 38%, color-mix(in srgb, var(--bg-primary) 90%, transparent) 60%, color-mix(in srgb, var(--bg-primary) 66%, transparent) 82%, transparent 100%)" }}>
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
        <div className="relative rounded-2xl overflow-hidden h-48 md:h-60 shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-br from-green-950/85 via-emerald-900/65 to-slate-950/90" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(152,213,148,0.24),transparent_32%)]" />
          <div className="relative h-full flex flex-col justify-end p-8">
            <span className="text-green-100/85 text-xs font-semibold uppercase tracking-widest mb-2">{hero.source}</span>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Newspaper, label: "Total Artikel", value: stats.total || 0, change: "7d", up: true, color: cc.c1 },
          { icon: Hash, label: "Sumber Berita", value: stats.sources || 0, change: `${stats.sources}`, up: true, color: cc.c2 },
          { icon: MapPin, label: "Kecamatan", value: stats.kecamatan || 0, change: "33", up: true, color: cc.c3 },
          { icon: TrendingUp, label: "Sentimen Positif", value: pRatio, suffix: "%", change: `${stats.sentimentPos}`, up: pRatio > 50, color: pRatio > 50 ? cc.c2 : cc.c5 },
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
            <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}><AnimatedNumber value={m.value} suffix={m.suffix} /></p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{m.label}</p>
          </div>
        ))}
      </div>

      {/* Row 1: Sentimen Pie + Kategori Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Sentimen</h3>
          <ViewportChart>{(isVisible) => <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={75} outerRadius={115}
                paddingAngle={4} dataKey="value" isAnimationActive={isVisible}
                label={({ name, value, percent }: any) => `${name}: ${value.toLocaleString()} (${(percent * 100).toFixed(0)}%)`}
                labelLine={{ stroke: cc.tm, strokeWidth: 0.5, strokeDasharray: "2 2" }}>
                {sentimentData.map((_, i) => <Cell key={i} fill={SENT_COLORS[i % SENT_COLORS.length]} />)}
              </Pie>
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                <tspan x="50%" dy="-0.4em" fontSize={22} fontWeight={700} fill={cc.ts}>
                  {sentimentData.reduce((s, d) => s + d.value, 0).toLocaleString()}
                </tspan>
                <tspan x="50%" dy="1.4em" fontSize={11} fill={cc.tm}>Total</tspan>
              </text>
              <Tooltip
                formatter={(v: any, name: any) => {
                  const total = sentimentData.reduce((s, d) => s + d.value, 0);
                  const pct = total > 0 ? ((v / total) * 100).toFixed(1) : "0";
                  return [`${v.toLocaleString()} artikel (${pct}%)`, name] as [string, string];
                }}
                contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12 }} />
              <Legend formatter={(v) => <span style={{ color: cc.ts, fontSize: 12 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>}</ViewportChart>
        </div>
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Kategori Berita</h3>
          <ViewportChart>{(isVisible) => <ResponsiveContainer width="100%" height={320}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: cc.tm }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: cc.ts }} width={80} />
              <Tooltip formatter={(v: any) => [v.toLocaleString(), "Artikel"] as [string, string]}
                contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12 }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={cc.primary} isAnimationActive={isVisible} />
            </BarChart>
          </ResponsiveContainer>}</ViewportChart>
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
                  <td className="py-2 px-2 hidden sm:table-cell">
                    {n.category && CAT_COLORS[n.category] ? (
                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CAT_COLORS[n.category]}`}>
                        {CAT_ICONS[n.category] || ""} {n.category}
                      </span>
                    ) : (
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
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

      {/* Row 2: Top Kecamatan (2/7) + Tren Berita Harian (5/7) with Brush */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        <div className="md:col-span-2" style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Kecamatan</h3>
          <div style={{ height: 352, overflowY: "auto" }}>
            <ViewportChart>{(isVisible) => <ResponsiveContainer width="100%" height={Math.max(352, kecData.length * 28)}>
              <BarChart data={kecData} layout="vertical" margin={{ left: 10, right: 10 }} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} horizontal={false} />
                <XAxis type="number" domain={[0, "dataMax"]} hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: cc.ts }} width={75} />
                <Tooltip formatter={(v: any) => [v.toLocaleString(), "Berita"] as [string, string]}
                  contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} fill={cc.primary} isAnimationActive={isVisible} />
              </BarChart>
            </ResponsiveContainer>}</ViewportChart>
          </div>
          <div className="pointer-events-none h-12 pt-3" style={{ background: "linear-gradient(to top, var(--bg-card) 48%, color-mix(in srgb, var(--bg-card) 86%, transparent) 76%, transparent 100%)" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kecData} layout="vertical" margin={{ left: 85, right: 10, top: 0, bottom: 0 }}>
                <XAxis type="number" domain={[0, "dataMax"]} tickCount={4} tick={{ fontSize: 9, fill: cc.tm }} axisLine={{ stroke: cc.bd }} tickLine={false} />
                <YAxis type="category" hide />
                <Bar dataKey="value" fill="transparent" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="md:col-span-5" style={cardStyle}>
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Tren Berita Harian
            </h3>
            <span className="text-[9px] px-2 py-1 rounded-md flex-shrink-0" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-muted)" }}>
              Data diupdate tiap hari jam 3 malam WIB
            </span>
          </div>
          <div style={{ height: 400 }}>
            <ViewportChart className="h-full">{(isVisible) => <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id={lineChartId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={cc.c2} stopOpacity={0.35} />
                    <stop offset="55%" stopColor={cc.c2} stopOpacity={0.12} />
                    <stop offset="95%" stopColor={cc.c2} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: cc.tm }} axisLine={{ stroke: cc.bd }} tickLine={false} interval="preserveStartEnd" minTickGap={30} />
                <YAxis tick={{ fontSize: 10, fill: cc.tm }} axisLine={false} tickLine={false} width={35} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: cc.tm, strokeDasharray: "3 3" }} />
                <Area type="monotone" dataKey="value" stroke={cc.c2} strokeWidth={2.5} fill={`url(#${lineChartId})`} dot={false} isAnimationActive={isVisible}
                  activeDot={{ r: 5, fill: cc.bg, stroke: cc.c2, strokeWidth: 3 }} />
                <Brush dataKey="date" height={28} stroke={cc.tm} fill={cc.bg} travellerWidth={10} gap={1} style={{ color: cc.ts, fontSize: 9 }}>
                  <AreaChart data={dailyData}>
                    <Area type="monotone" dataKey="value" stroke={cc.c2} fill={cc.c2 + "30"} isAnimationActive={false} />
                  </AreaChart>
                </Brush>
              </AreaChart>
            </ResponsiveContainer>}</ViewportChart>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span className="opacity-50"><AnimatedNumber value={dailyData.length} /> hari total</span>
            </span>
            <span className="text-[10px] font-medium" style={{ color: cc.c2 }}>
              <AnimatedNumber value={dailyData.reduce((sum, d) => sum + d.value, 0)} /> total berita
            </span>
          </div>
        </div>
      </div>

      {/* Bottom row: Sumber Berita (scrollable) + Pie Sumber */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Sumber Berita</h3>
          <div style={{ height: 300, overflowY: "auto" }}>
            <ViewportChart>{(isVisible) => <ResponsiveContainer width="100%" height={Math.max(300, sourceData.length * 26)}>
              <BarChart data={sourceData} layout="vertical" margin={{ left: 10, right: 20 }} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} horizontal={false} />
                <XAxis type="number" domain={[0, "dataMax"]} hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: cc.ts }} width={90} />
                <Tooltip formatter={(v: any) => [v.toLocaleString(), "Artikel"] as [string, string]}
                  contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12, fontSize: 11 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} fill={cc.secondary} isAnimationActive={isVisible} />
              </BarChart>
            </ResponsiveContainer>}</ViewportChart>
          </div>
          <div className="pointer-events-none h-12 pt-3" style={{ background: "linear-gradient(to top, var(--bg-card) 48%, color-mix(in srgb, var(--bg-card) 86%, transparent) 76%, transparent 100%)" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceData} layout="vertical" margin={{ left: 100, right: 20, top: 0, bottom: 0 }}>
                <XAxis type="number" domain={[0, "dataMax"]} tickCount={4} tick={{ fontSize: 9, fill: cc.tm }} axisLine={{ stroke: cc.bd }} tickLine={false} />
                <YAxis type="category" hide />
                <Bar dataKey="value" fill="transparent" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Proporsi Sumber Berita</h3>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px] gap-4 items-center">
            <ViewportChart>{(isVisible) => <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={sourcePieData} cx="50%" cy="50%" innerRadius={55} outerRadius={92}
                  paddingAngle={3} dataKey="value" isAnimationActive={isVisible}>
                  {sourcePieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle">
                  <tspan x="50%" dy="0" fontSize={20} fontWeight={700} fill={cc.ts}>
                    {sourceTotal.toLocaleString()}
                  </tspan>
                  <tspan x="50%" dy="1.45em" fontSize={10} fill={cc.tm}>Total</tspan>
                </text>
                <Tooltip formatter={(v: unknown, name: unknown) => {
                    const value = Number(v);
                    const safeValue = Number.isFinite(value) ? value : 0;
                    const pct = sourceTotal > 0 ? ((safeValue / sourceTotal) * 100).toFixed(1) : "0";
                    return [`${safeValue.toLocaleString()} artikel (${pct}%)`, String(name)] as [string, string];
                  }}
                  contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12 }} />
              </PieChart>
            </ResponsiveContainer>}</ViewportChart>
            <div className="max-h-[260px] overflow-y-auto pr-1 space-y-2">
              {sourcePieData.filter((d) => d.name !== "Lainnya").map((d) => (
                <div key={d.name} className="flex items-start gap-2 rounded-lg px-2 py-1.5" style={{ backgroundColor: `${d.color}12` }}>
                  <span className="mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium" title={d.name} style={{ color: "var(--text-primary)" }}>{d.name}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {d.value.toLocaleString()} artikel • {d.percent.toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
              {sourceOtherBreakdown.length > 0 && (
                <div className="pt-2">
                  <div className="space-y-1.5">
                    {sourceOtherBreakdown.map((d) => (
                      <div key={d.name} className="flex items-start gap-2 rounded-lg px-2 py-1.5" style={{ backgroundColor: `${cc.tm}10` }}>
                        <span className="mt-1.5 h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[10px] font-medium" title={d.name} style={{ color: "var(--text-secondary)" }}>{d.name}</p>
                          <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                            {d.value.toLocaleString()} artikel • {d.percent.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
