"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, Brush, Line, LineChart } from "recharts";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";

const API = "/api/db?table=clean_news_articles";

const C = {
  c2: "#4bb062", c5: "#E11D48", c6: "#EAB308",
  tm: "#9C9590", ts: "#6B6560", bd: "#E5E0D8", bg: "#FFFFFF",
};
function getDark() {
  return { c2: "#4bb062", c5: "#FB7185", c6: "#FACC15", tm: "#78716C", ts: "#A8A29E", bd: "#44403C", bg: "#292524" };
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
}

// ── Komponen Proporsi Sentimen per Kecamatan (Pie Chart) ──────────────────────

type KecProp = {
  name: string;
  positive: number; neutral: number; negative: number;
  pCount: number; nCount: number; negCount: number;
};

type DailyTrend = {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
};

type TrendKey = "positive" | "neutral" | "negative";

const TREND_OPTIONS: Array<{ key: TrendKey; label: string }> = [
  { key: "positive", label: "Positif" },
  { key: "neutral", label: "Netral" },
  { key: "negative", label: "Negatif" },
];

function fillDailyTrend(days: Record<string, { pos: number; neu: number; neg: number }>): DailyTrend[] {
  const dates = Object.keys(days).sort();
  if (dates.length === 0) return [];

  const cursor = new Date(`${dates[0]}T00:00:00Z`);
  const end = dates[dates.length - 1];
  const result: DailyTrend[] = [];

  while (cursor.toISOString().slice(0, 10) <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const values = days[date] || { pos: 0, neu: 0, neg: 0 };
    result.push({ date, positive: values.pos, neutral: values.neu, negative: values.neg });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

function KecPieSection({ kecProps, cc }: { kecProps: KecProp[]; cc: typeof C }) {
  const allNames = kecProps.map(k => k.name).sort((a, b) => a.localeCompare(b));
  const [selected, setSelected] = useState<string>(allNames[0] ?? "");

  const data = kecProps.find(k => k.name === selected);

  return (
    <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Proporsi Sentimen per Kecamatan</h3>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs outline-none"
          style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)", minWidth: 180 }}
        >
          {allNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {data ? (
        <div className="flex flex-col items-center gap-4">
          {/* Pie chart — lebih besar karena hanya satu */}
          <KecSinglePieLarge data={data} cc={cc} />

          {/* Ringkasan jumlah berita */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-xs text-center">
            {([["Positif", data.pCount, cc.c2], ["Netral", data.nCount, cc.c6], ["Negatif", data.negCount, cc.c5]] as const).map(([label, count, color]) => (
              <div key={label} className="rounded-xl p-3" style={{ backgroundColor: "var(--bg-secondary)" }}>
                <div className="text-xl font-bold" style={{ color }}>{count}</div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{label}</div>
                <div className="text-[10px] font-medium" style={{ color }}>
                  {data.positive + data.neutral + data.negative > 0
                    ? label === "Positif" ? `${data.positive}%`
                    : label === "Netral" ? `${data.neutral}%`
                    : `${data.negative}%`
                    : "0%"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-center text-xs py-8" style={{ color: "var(--text-muted)" }}>Tidak ada data kecamatan.</p>
      )}
    </div>
  );
}

function KecSinglePieLarge({ data, cc }: { data: KecProp; cc: typeof C }) {
  const pieData = [
    { name: "Positif",  value: data.positive,  count: data.pCount,   fill: cc.c2 },
    { name: "Netral",   value: data.neutral,   count: data.nCount,   fill: cc.c6 },
    { name: "Negatif",  value: data.negative,  count: data.negCount, fill: cc.c5 },
  ].filter(d => d.value > 0);

  const RADIAN = Math.PI / 180;
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) => {
    if (value < 5) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700}>
        {value}%
      </text>
    );
  };

  return (
    <div className="flex flex-col items-center">
      <PieChart width={260} height={260}>
        <Pie data={pieData} cx={125} cy={125} outerRadius={115} dataKey="value" labelLine={false} label={renderLabel}>
          {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
        </Pie>
        <Tooltip
          formatter={(value: any, name: any, props: any) => [`${value}% (${props.payload.count} berita)`, name]}
          contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 11 }}
        />
      </PieChart>
      <div className="flex gap-4 mt-1">
        {pieData.map(d => (
          <span key={d.name} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: d.fill }} />
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

export default function SentimentPage() {
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const isDark = mounted && document.documentElement.classList.contains("dark");
  const cc = isDark ? getDark() : C;

  const [overview, setOverview] = useState<any[]>([]);
  const [byKec, setByKec] = useState<any[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [trendFilterOpen, setTrendFilterOpen] = useState(false);
  const [visibleTrends, setVisibleTrends] = useState<Record<TrendKey, boolean>>({
    positive: true,
    neutral: true,
    negative: true,
  });
  const [kecProps, setKecProps] = useState<any[]>([]);
  const [byCat, setByCat] = useState<any[]>([]);
  const [catProps, setCatProps] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const all: any[] = await fetch(`${API}&select=sentiment,published_date,primary_kecamatan,category`).then(r => r.json()).then(d => d.data || []);

        // Overview with 7d delta
        const sentCount: Record<string, number> = {};
        const sent7d: Record<string, number> = {};
        const sentPrev7d: Record<string, number> = {};
        all.forEach((r: any) => {
          const s = r.sentiment || "unknown";
          sentCount[s] = (sentCount[s] || 0) + 1;
          const pd = r.published_date?.slice(0, 10);
          if (pd >= daysAgo(6)) sent7d[s] = (sent7d[s] || 0) + 1;
          if (pd >= daysAgo(13) && pd < daysAgo(6)) sentPrev7d[s] = (sentPrev7d[s] || 0) + 1;
        });
        setOverview(["positive", "neutral", "negative"].map(name => ({
          name,
          value: sentCount[name] || 0,
          delta: (sent7d[name] || 0) - (sentPrev7d[name] || 0),
        })));

        // Sentiment per Kecamatan (horizontal, fixed height 400px with scroll)
        const kecSent: Record<string, { pos: number; neu: number; neg: number }> = {};
        all.filter((r: any) => r.primary_kecamatan).forEach((r: any) => {
          const k = r.primary_kecamatan!;
          kecSent[k] = kecSent[k] || { pos: 0, neu: 0, neg: 0 };
          const s = r.sentiment || "unknown";
          if (s === "positive") kecSent[k].pos++;
          else if (s === "neutral") kecSent[k].neu++;
          else if (s === "negative") kecSent[k].neg++;
        });
        setByKec(
          Object.entries(kecSent)
            .sort(([, a], [, b]) => b.pos - a.pos)
            .map(([name, v]) => ({ name, positive: v.pos, neutral: v.neu, negative: v.neg }))
        );

        // Daily trend, including zero-value days between the first and last article.
        const dailySent: Record<string, { pos: number; neu: number; neg: number }> = {};
        all.filter((r: any) => r.published_date).forEach((r: any) => {
          const date = r.published_date.slice(0, 10);
          dailySent[date] = dailySent[date] || { pos: 0, neu: 0, neg: 0 };
          const s = r.sentiment || "unknown";
          if (s === "positive") dailySent[date].pos++;
          else if (s === "neutral") dailySent[date].neu++;
          else if (s === "negative") dailySent[date].neg++;
        });
        setDailyTrend(fillDailyTrend(dailySent));

        // Proporsi per Kecamatan (sort by positive % desc)
        setKecProps(
          Object.entries(kecSent)
            .filter(([_, v]) => v.pos + v.neu + v.neg > 0)
            .map(([name, v]) => {
              const total = v.pos + v.neu + v.neg;
              return {
                name,
                positive: Math.round((v.pos / total) * 100),
                neutral: Math.round((v.neu / total) * 100),
                negative: Math.round((v.neg / total) * 100),
                pCount: v.pos, nCount: v.neu, negCount: v.neg,
              };
            })
            .sort((a, b) => b.positive - a.positive)
        );

        // Sentiment by Category (sort by positive desc)
        const catSent: Record<string, { pos: number; neu: number; neg: number }> = {};
        all.forEach((r: any) => {
          const cat = r.category || "uncategorized";
          catSent[cat] = catSent[cat] || { pos: 0, neu: 0, neg: 0 };
          const s = r.sentiment || "unknown";
          if (s === "positive") catSent[cat].pos++;
          else if (s === "neutral") catSent[cat].neu++;
          else if (s === "negative") catSent[cat].neg++;
        });
        setByCat(
          Object.entries(catSent)
            .sort(([, a], [, b]) => b.pos - a.pos)
            .map(([name, v]) => ({ name, positive: v.pos, neutral: v.neu, negative: v.neg }))
        );

        // Proporsi by Category (sort by positive desc)
        setCatProps(
          Object.entries(catSent)
            .filter(([_, v]) => v.pos + v.neu + v.neg > 0)
            .map(([name, v]) => {
              const total = v.pos + v.neu + v.neg;
              return {
                name,
                positive: Math.round((v.pos / total) * 100),
                neutral: Math.round((v.neu / total) * 100),
                negative: Math.round((v.neg / total) * 100),
              };
            })
            .sort((a, b) => b.positive - a.positive)
        );

      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
    </div>
  );

  const COL: Record<string, string> = { positive: cc.c2, neutral: cc.c6, negative: cc.c5 };
  const toggleTrend = (key: TrendKey) => {
    setVisibleTrends((current) => {
      const activeCount = Object.values(current).filter(Boolean).length;
      if (current[key] && activeCount === 1) return current;
      return { ...current, [key]: !current[key] };
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Analisis Sentimen</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Distribusi sentimen berita Kabupaten Malang</p>
      </div>

      {/* Overview Cards with 7d Delta */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {overview.map((o: any) => (
          <div key={o.name} className="card-hover rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COL[o.name] || "#999" }} />
                <span className="text-sm capitalize font-medium" style={{ color: "var(--text-secondary)" }}>{o.name}</span>
              </div>
              <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${o.delta > 0 ? "text-emerald-600" : o.delta < 0 ? "text-red-600" : "text-gray-400"}`}>
                {o.delta > 0 ? <TrendingUp size={11} /> : o.delta < 0 ? <TrendingDown size={11} /> : null}
                <span className="text-[9px] opacity-60">7d</span>
                {o.delta !== 0 ? (o.delta > 0 ? "+" : "") + o.delta : "—"}
              </span>
            </div>
            <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{o.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Sentimen per Kecamatan + Proporsi */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Sentimen per Kecamatan</h3>
          <div style={{ height: 400, overflowY: "auto" }}>
            <ResponsiveContainer width="100%" height={Math.max(400, byKec.length * 30)}>
              <BarChart data={byKec} layout="vertical" margin={{ left: 10, right: 10 }} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: cc.tm }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: cc.ts }} width={75} />
                <Tooltip contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12, fontSize: 11 }} />
                <Legend formatter={(v) => <span style={{ color: cc.ts, fontSize: 11 }}>{v}</span>} />
                <Bar dataKey="positive" stackId="a" fill={cc.c2} radius={[0, 0, 0, 0]} />
                <Bar dataKey="neutral" stackId="a" fill={cc.c6} />
                <Bar dataKey="negative" stackId="a" fill={cc.c5} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <KecPieSection kecProps={kecProps} cc={cc} />
      </div>

      {/* Sentimen by Category + Proporsi */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Sentimen per Kategori</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byCat} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: cc.tm }} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10, fill: cc.tm }} />
              <Tooltip contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12, fontSize: 11 }} />
              <Legend formatter={(v) => <span style={{ color: cc.ts, fontSize: 11 }}>{v}</span>} />
              <Bar dataKey="positive" stackId="a" fill={cc.c2} radius={[0, 0, 0, 0]} />
              <Bar dataKey="neutral" stackId="a" fill={cc.c6} />
              <Bar dataKey="negative" stackId="a" fill={cc.c5} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Proporsi Sentimen per Kategori</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={catProps} layout="vertical" margin={{ left: 10, right: 30 }} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: cc.tm }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: cc.ts }} width={80} />
              <Tooltip formatter={(v: any) => [`${v}%`, ""] as unknown as [string, string]}
                contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12, fontSize: 11 }} />
              <Legend formatter={(v) => <span style={{ color: cc.ts, fontSize: 11 }}>{v}</span>} />
              <Bar dataKey="positive" stackId="a" fill={cc.c2} radius={[0, 0, 0, 0]} />
              <Bar dataKey="neutral" stackId="a" fill={cc.c6} />
              <Bar dataKey="negative" stackId="a" fill={cc.c5} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tren Sentimen — Full Width Bottom */}
      <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Tren Sentimen Harian</h3>
          <div className="relative">
            <button
              onClick={() => setTrendFilterOpen((open) => !open)}
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
              style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              Filter sentimen
              <ChevronDown size={14} className={trendFilterOpen ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {trendFilterOpen && (
              <div className="absolute right-0 top-full z-20 mt-2 w-40 rounded-lg border p-2 shadow-lg" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                {TREND_OPTIONS.map((option) => (
                  <label key={option.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <input
                      type="checkbox"
                      checked={visibleTrends[option.key]}
                      onChange={() => toggleTrend(option.key)}
                      className="accent-current"
                      style={{ color: COL[option.key] }}
                    />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COL[option.key] }} />
                    {option.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={dailyTrend} margin={{ top: 8, right: 12, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: cc.tm }} minTickGap={48} tickFormatter={(date) => date.slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: cc.tm }} />
            <Tooltip
              labelFormatter={(date) => `Tanggal ${date}`}
              contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12, fontSize: 11 }}
            />
            <Brush dataKey="date" height={30} stroke={cc.ts} fill={cc.bg} tickFormatter={(date) => date.slice(5)} />
            {visibleTrends.positive && <Line type="linear" dataKey="positive" name="Positif" stroke={cc.c2} strokeWidth={2} dot={false} activeDot={false} />}
            {visibleTrends.neutral && <Line type="linear" dataKey="neutral" name="Netral" stroke={cc.c6} strokeWidth={2} dot={false} activeDot={false} />}
            {visibleTrends.negative && <Line type="linear" dataKey="negative" name="Negatif" stroke={cc.c5} strokeWidth={2} dot={false} activeDot={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
