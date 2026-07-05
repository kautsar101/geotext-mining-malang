"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, Legend } from "recharts";

const API = "/api/db?table=clean_news_articles";
const COLORS = { positive: "#6B8E6B", neutral: "#C49A6C", negative: "#B8856B" };

export default function SentimentPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any[]>([]);
  const [bySource, setBySource] = useState<any[]>([]);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [negHotspot, setNegHotspot] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const all = await fetch(`${API}&select=sentiment,source,published_date,primary_kecamatan`).then(r => r.json()).then(d => d.data || []);

        // Overview counts
        const counts: Record<string, number> = {};
        all.forEach((r: any) => { const s = r.sentiment || "unknown"; counts[s] = (counts[s] || 0) + 1; });
        setOverview(Object.entries(counts).map(([name, value]) => ({ name, value })));

        // By source
        const srcSent: Record<string, Record<string, number>> = {};
        all.forEach((r: any) => {
          if (!r.source) return;
          srcSent[r.source] = srcSent[r.source] || {};
          srcSent[r.source][r.sentiment || "unknown"] = (srcSent[r.source][r.sentiment || "unknown"] || 0) + 1;
        });
        setBySource(Object.entries(srcSent).map(([name, vals]) => ({
          name, positive: vals.positive || 0, neutral: vals.neutral || 0, negative: vals.negative || 0,
        })));

        // Monthly
        const monthSent: Record<string, Record<string, number>> = {};
        all.forEach((r: any) => {
          if (!r.published_date) return;
          const m = r.published_date.slice(0, 7);
          monthSent[m] = monthSent[m] || {};
          monthSent[m][r.sentiment || "unknown"] = (monthSent[m][r.sentiment || "unknown"] || 0) + 1;
        });
        setMonthly(Object.entries(monthSent).sort(([a], [b]) => a.localeCompare(b)).map(([month, vals]) => ({
          month, positive: vals.positive || 0, neutral: vals.neutral || 0, negative: vals.negative || 0,
        })));

        // Negative hotspots
        const negKec: Record<string, number> = {};
        all.filter((r: any) => r.sentiment === "negative" && r.primary_kecamatan).forEach((r: any) => {
          negKec[r.primary_kecamatan!] = (negKec[r.primary_kecamatan!] || 0) + 1;
        });
        setNegHotspot(Object.entries(negKec).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value })));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Analisis Sentimen</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Distribusi sentimen berita Malang Raya</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {overview.map((o: any) => (
          <div key={o.name} className="card-hover rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: (COLORS as any)[o.name] || "#999" }} />
              <span className="text-sm capitalize" style={{ color: "var(--text-muted)" }}>{o.name}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{o.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Sentimen per Sumber</h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={bySource} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--text-muted)" }} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
              <Legend formatter={(v) => <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{v}</span>} />
              <Bar dataKey="positive" stackId="a" fill="#6B8E6B" radius={[0, 0, 0, 0]} />
              <Bar dataKey="neutral" stackId="a" fill="#C49A6C" />
              <Bar dataKey="negative" stackId="a" fill="#B8856B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Tren Sentimen Bulanan</h3>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={monthly}>
              <defs>
                <linearGradient id="posGrad2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6B8E6B" stopOpacity={0.3} /><stop offset="95%" stopColor="#6B8E6B" stopOpacity={0} /></linearGradient>
                <linearGradient id="negGrad2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#B8856B" stopOpacity={0.3} /><stop offset="95%" stopColor="#B8856B" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
              <Area type="monotone" dataKey="positive" stroke="#6B8E6B" fill="url(#posGrad2)" strokeWidth={2} />
              <Area type="monotone" dataKey="neutral" stroke="#C49A6C" fill="none" strokeWidth={2} />
              <Area type="monotone" dataKey="negative" stroke="#B8856B" fill="url(#negGrad2)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Hotspot Sentimen Negatif per Kecamatan</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={negHotspot} layout="vertical" margin={{ left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--text-secondary)" }} width={100} />
            <Tooltip formatter={(v: any) => [Number(v).toLocaleString(), "Berita Negatif"] as [string, string]}
              contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12 }} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="#B8856B" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
