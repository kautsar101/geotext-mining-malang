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
  ArrowUpRight, ArrowDownRight, Activity
} from "lucide-react";

const API = "/api/db?table=clean_news_articles";
function fetcher(params: string) {
  return fetch(`${API}&${params}`).then(r => r.json()).then(d => d.data || []);
}
function fetcherOne(params: string) {
  return fetch(`${API}&${params}`).then(r => r.json()).then(d => d);
}

export default function Dashboard() {
  const [heroArticles, setHeroArticles] = useState<any[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>({});
  const [sourceData, setSourceData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [kecData, setKecData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [sentimentData, setSentimentData] = useState<any[]>([]);
  const [dayData, setDayData] = useState<any[]>([]);
  const [sourceSentiment, setSourceSentiment] = useState<any[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const heroRaw = await fetcher("select=id%2Ctitle%2Csource%2Cpublished_date%2Curl&limit=200");
      const hero = heroRaw.sort(() => Math.random() - 0.5).slice(0, 5);
      setHeroArticles(hero);

      const countR = await fetcherOne("select=id&count=exact&limit=0");
      const total = countR.count || 0;

      const all = await fetcher("select=source%2Ccategory%2Cprimary_kecamatan%2Cpublished_date%2Csentiment");

      const srcMap: Record<string, number> = {};
      const catMap: Record<string, number> = {};
      const kecMap: Record<string, number> = {};
      const monthMap: Record<string, number> = {};
      const sentMap: Record<string, number> = {};
      const dayMap: Record<string, number> = {};
      const ssMap: Record<string, Record<string, number>> = {};
      const uniqSrc = new Set<string>();
      const uniqKec = new Set<string>();

      (all || []).forEach((r: any) => {
        if (r.source) { srcMap[r.source] = (srcMap[r.source] || 0) + 1; uniqSrc.add(r.source); }
        const cat = r.category || "uncategorized"; catMap[cat] = (catMap[cat] || 0) + 1;
        if (r.primary_kecamatan) { kecMap[r.primary_kecamatan] = (kecMap[r.primary_kecamatan] || 0) + 1; uniqKec.add(r.primary_kecamatan); }
        if (r.published_date) { const m = r.published_date.slice(0, 7); monthMap[m] = (monthMap[m] || 0) + 1; }
        const s = r.sentiment || "unknown"; sentMap[s] = (sentMap[s] || 0) + 1;
        if (r.published_date) {
          const day = new Date(r.published_date).toLocaleDateString("id", { weekday: "long" });
          dayMap[day] = (dayMap[day] || 0) + 1;
        }
        if (r.source) {
          ssMap[r.source] = ssMap[r.source] || {};
          ssMap[r.source][r.sentiment || "unknown"] = (ssMap[r.source][r.sentiment || "unknown"] || 0) + 1;
        }
      });

      setSourceData(Object.entries(srcMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value })));
      setCategoryData(Object.entries(catMap).map(([name, value]) => ({ name, value })));
      setKecData(Object.entries(kecMap).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([name, value]) => ({ name, value })));
      setMonthlyData(Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, berita]) => ({ month, berita })));
      setSentimentData(Object.entries(sentMap).map(([name, value]) => ({ name, value })));

      const order = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
      setDayData(order.filter(d => dayMap[d]).map(d => ({ name: d.slice(0, 3), value: dayMap[d] })));

      setSourceSentiment(Object.entries(ssMap).slice(0, 8).map(([name, vals]: any) => ({
        name, positive: vals.positive || 0, neutral: vals.neutral || 0, negative: vals.negative || 0,
      })));

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
    const t = setInterval(() => setHeroIndex(i => (i + 1) % heroArticles.length), 5000);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Overview</h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Geotext Mining Malang</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
          style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          <Activity size={16} /><span>Live</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

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

      <div className="grid grid-cols-4 gap-4">
        {[
          { icon: Newspaper, label: "Total Artikel", value: stats.total?.toLocaleString(), change: "+12%", up: true, color: "var(--chart-1)" },
          { icon: Hash, label: "Sumber Berita", value: stats.sources?.toString(), change: `${stats.sources || 0}`, up: true, color: "var(--chart-2)" },
          { icon: MapPin, label: "Kecamatan", value: stats.kecamatan?.toString(), change: "33 total", up: true, color: "var(--chart-3)" },
          { icon: TrendingUp, label: "Sentimen Positif", value: `${pRatio}%`, change: `${stats.sentimentPos?.toLocaleString()} artikel`, up: pRatio > 50, color: pRatio > 50 ? "var(--chart-2)" : "var(--chart-5)" },
        ].map((m, i) => (
          <div key={i} style={cardStyle} className="card-hover">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${m.color}15` }}>
                <m.icon size={18} style={{ color: m.color }} />
              </div>
              <span className={`flex items-center gap-1 text-xs font-medium ${m.up ? "text-emerald-600" : "text-rose-600"}`}>
                {m.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{m.change}
              </span>
            </div>
            <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{m.value}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{m.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>📊 Distribusi per Sumber</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={sourceData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--text-secondary)" }} width={90} />
              <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                formatter={(v: any) => [v.toLocaleString(), "Artikel"] as [string, string]} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="var(--chart-primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>🎯 Kategori Artikel</h3>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" innerRadius={70} outerRadius={110}
                paddingAngle={4} dataKey="value"
                label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {categoryData.map((_, i) => <Cell key={i} fill={["var(--chart-primary)", "var(--chart-secondary)", "var(--chart-tertiary)", "var(--chart-muted)"][i % 4]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => [v.toLocaleString(), "Artikel"] as [string, string]}
                contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>📍 Top Kecamatan</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={kecData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--text-secondary)" }} width={80} />
              <Tooltip formatter={(v: any) => [v.toLocaleString(), "Berita"] as [string, string]}
                contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12 }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="var(--chart-primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>📈 Tren Publikasi</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyData}>
              <defs><linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                formatter={(v: any) => [v.toLocaleString(), "Berita"] as [string, string]} />
              <Area type="monotone" dataKey="berita" stroke="var(--chart-1)" fill="url(#trendGrad)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>😊 Sentimen</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                paddingAngle={4} dataKey="value">
                {sentimentData.map((_, i) => (
                  <Cell key={i} fill={["var(--chart-2)", "var(--chart-6)", "var(--chart-5)", "var(--text-muted)"][i % 4]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => [v.toLocaleString(), "Artikel"] as [string, string]}
                contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12 }} />
              <Legend formatter={(v) => <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>📅 Per Hari</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis hide />
              <Tooltip formatter={(v: any) => [v.toLocaleString(), "Artikel"] as [string, string]}
                contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="var(--chart-primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>📊 Kategori</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--text-secondary)" }} width={80} />
              <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12 }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="var(--chart-primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>🌈 Sentimen per Sumber</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={sourceSentiment} margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--text-muted)" }} angle={-20} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
            <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
            <Legend formatter={(v) => <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{v}</span>} />
            <Bar dataKey="positive" stackId="a" fill="var(--chart-2)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="neutral" stackId="a" fill="var(--chart-6)" />
            <Bar dataKey="negative" stackId="a" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}