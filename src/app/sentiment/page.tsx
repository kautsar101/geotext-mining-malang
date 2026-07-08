"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, Legend, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";

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

export default function SentimentPage() {
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const isDark = mounted && document.documentElement.classList.contains("dark");
  const cc = isDark ? getDark() : C;

  const [overview, setOverview] = useState<any[]>([]);
  const [byKec, setByKec] = useState<any[]>([]);
  const [monthly, setMonthly] = useState<any[]>([]);
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

        // Monthly trend (no dots)
        const monthSent: Record<string, { pos: number; neu: number; neg: number }> = {};
        all.filter((r: any) => r.published_date).forEach((r: any) => {
          const m = r.published_date.slice(0, 7);
          monthSent[m] = monthSent[m] || { pos: 0, neu: 0, neg: 0 };
          const s = r.sentiment || "unknown";
          if (s === "positive") monthSent[m].pos++;
          else if (s === "neutral") monthSent[m].neu++;
          else if (s === "negative") monthSent[m].neg++;
        });
        setMonthly(
          Object.entries(monthSent).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({
            month,
            positive: v.pos, neutral: v.neu, negative: v.neg,
          }))
        );

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Analisis Sentimen</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Distribusi sentimen berita Kabupaten Malang</p>
      </div>

      {/* Overview Cards with 7d Delta */}
      <div className="grid grid-cols-3 gap-4">
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

      {/* Sentimen per Kecamatan + Tren */}
      <div className="grid grid-cols-2 gap-4">
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

        <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Tren Sentimen</h3>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={monthly}>
              <defs>
                <linearGradient id="posGradM" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={cc.c2} stopOpacity={0.3} /><stop offset="95%" stopColor={cc.c2} stopOpacity={0} /></linearGradient>
                <linearGradient id="negGradM" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={cc.c5} stopOpacity={0.3} /><stop offset="95%" stopColor={cc.c5} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: cc.tm }} />
              <YAxis tick={{ fontSize: 10, fill: cc.tm }} />
              <Tooltip contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12, fontSize: 11 }} />
              <Area type="monotone" dataKey="positive" stroke={cc.c2} fill="url(#posGradM)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="neutral" stroke={cc.c6} fill="none" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="negative" stroke={cc.c5} fill="url(#negGradM)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Proporsi Sentimen per Kecamatan */}
      <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Proporsi Sentimen per Kecamatan</h3>
        <ResponsiveContainer width="100%" height={Math.max(300, kecProps.length * 28)}>
          <BarChart data={kecProps} layout="vertical" margin={{ left: 20, right: 50 }} barSize={18}>
            <CartesianGrid strokeDasharray="3 3" stroke={cc.bd} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: cc.tm }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: cc.ts }} width={90} />
            <Tooltip
              formatter={(v: any, name: any, props: any) => {
                const p = props.payload;
                if (name === "positive") return [`${v}% (${p?.pCount || 0} berita)`, "Positive"];
                if (name === "negative") return [`${v}% (${p?.negCount || 0} berita)`, "Negative"];
                return [`${v}% (${p?.nCount || 0} berita)`, "Neutral"];
              }}
              contentStyle={{ backgroundColor: cc.bg, border: `1px solid ${cc.bd}`, borderRadius: 12, fontSize: 11 }}
            />
            <Legend formatter={(v) => <span style={{ color: cc.ts, fontSize: 11 }}>{v}</span>} />
            <Bar dataKey="positive" stackId="a" fill={cc.c2} radius={[0, 0, 0, 0]} />
            <Bar dataKey="neutral" stackId="a" fill={cc.c6} />
            <Bar dataKey="negative" stackId="a" fill={cc.c5} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sentimen by Category + Proporsi */}
      <div className="grid grid-cols-2 gap-4">
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
    </div>
  );
}
