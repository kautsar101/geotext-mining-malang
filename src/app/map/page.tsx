"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { X, MapIcon, TrendingUp, TrendingDown } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, Brush } from "recharts";

const API = "/api/db?table=clean_news_articles";
const CATEGORY_LAYERS = ["sosial", "ekonomi", "pendidikan", "kesehatan"];
const HEAT_COLORS = ["#f4fbef", "#e5f6d8", "#d1edbd", "#98d594", "#72c377", "#4bb062", "#2f984e", "#157f3b"];
type MapLayer = "count" | `category:${string}`;

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
}
function fmtDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function getWeek(dateStr: string) {
  const d = new Date(dateStr);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export default function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any[]>([]);
  const [statsWithDelta, setStatsWithDelta] = useState<any[]>([]);
  const [selectedKec, setSelectedKec] = useState<string | null>(null);
  const [kecArticles, setKecArticles] = useState<any[]>([]);
  const [kecSentiment, setKecSentiment] = useState<any[]>([]);
  const [kecSentByCat, setKecSentByCat] = useState<any[]>([]);
  const [kecTrend, setKecTrend] = useState<any[]>([]);
  const [allData, setAllData] = useState<any[]>([]);
  const [kecCategoryStats, setKecCategoryStats] = useState<Record<string, Record<string, number>>>({});
  const [activeLayer, setActiveLayer] = useState<MapLayer>("count");

  useEffect(() => {
    (async () => {
      try {
        const data = await fetch(`${API}&select=primary_kecamatan,sentiment,category,title,source,published_date,url`).then(r => r.json()).then(d => d.data || []);
        setAllData(data);

        const kecCount: Record<string, number> = {};
        const categoryByKec: Record<string, Record<string, number>> = {};
        const kec7d: Record<string, number> = {};
        const kecPrev7d: Record<string, number> = {};

        data.forEach((r: any) => {
          if (!r.primary_kecamatan) return;
          const k = r.primary_kecamatan;
          kecCount[k] = (kecCount[k] || 0) + 1;
          const category = (r.category || "uncategorized").toLowerCase();
          categoryByKec[k] = categoryByKec[k] || {};
          categoryByKec[k][category] = (categoryByKec[k][category] || 0) + 1;
          const pd = r.published_date?.slice(0, 10);
          if (pd >= daysAgo(6)) kec7d[k] = (kec7d[k] || 0) + 1;
          if (pd >= daysAgo(13) && pd < daysAgo(6)) kecPrev7d[k] = (kecPrev7d[k] || 0) + 1;
        });

        const sorted = Object.entries(kecCount).sort((a, b) => b[1] - a[1]);
        setStats(sorted.map(([name, value]) => ({ name, value })));
        setStatsWithDelta(sorted.map(([name, value]) => ({
          name, value,
          delta: (kec7d[name] || 0) - (kecPrev7d[name] || 0),
        })));
        setKecCategoryStats(categoryByKec);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  function getLayerInfo(kecamatan: string) {
    const total = stats.find(s => s.name.toLowerCase() === kecamatan.toLowerCase())?.value || 0;
    if (activeLayer === "count") {
      return {
        value: total,
        label: String(total),
        hoverLabel: `${total} berita`,
        detail: `${total.toLocaleString()} berita`,
      };
    }

    const category = activeLayer.replace("category:", "");
    const categoryKey = Object.keys(kecCategoryStats).find(k => k.toLowerCase() === kecamatan.toLowerCase()) || kecamatan;
    const categoryCount = kecCategoryStats[categoryKey]?.[category] || 0;
    const percent = total > 0 ? (categoryCount / total) * 100 : 0;
    return {
      value: percent,
      label: `${percent.toFixed(0)}%`,
      hoverLabel: `${categoryCount} dari ${total} berita (${percent.toFixed(1)}%)`,
      detail: `${categoryCount.toLocaleString()} dari ${total.toLocaleString()} berita • ${percent.toFixed(1)}%`,
    };
  }

  function getLayerTitle() {
    if (activeLayer === "count") return "Jumlah Berita";
    const category = activeLayer.replace("category:", "");
    return `% ${category.charAt(0).toUpperCase()}${category.slice(1)}`;
  }

  function selectKecamatan(name: string) {
    setSelectedKec(name);
    const filtered = allData.filter((r: any) => r.primary_kecamatan?.toLowerCase() === name.toLowerCase());
    const sortedArticles = [...filtered].sort((a: any, b: any) =>
      String(b.published_date || "").localeCompare(String(a.published_date || ""))
    );
    setKecArticles(sortedArticles);

    const sentCount: Record<string, number> = {};
    filtered.forEach((r: any) => { const s = r.sentiment || "unknown"; sentCount[s] = (sentCount[s] || 0) + 1; });
    setKecSentiment(Object.entries(sentCount).map(([name, value]) => ({ name, value })));

    const catSent: Record<string, Record<string, number>> = {};
    filtered.forEach((r: any) => {
      const cat = r.category || "uncategorized";
      catSent[cat] = catSent[cat] || {};
      catSent[cat][r.sentiment || "unknown"] = (catSent[cat][r.sentiment || "unknown"] || 0) + 1;
    });
    setKecSentByCat(Object.entries(catSent).map(([name, vals]) => ({
      name, positive: vals.positive || 0, neutral: vals.neutral || 0, negative: vals.negative || 0,
    })));

    // Real date trend
    const dateSent: Record<string, number> = {};
    filtered.filter((r: any) => r.published_date).forEach((r: any) => {
      const d = r.published_date.slice(0, 10);
      dateSent[d] = (dateSent[d] || 0) + 1;
    });
    setKecTrend(
      Object.entries(dateSent).sort(([a], [b]) => a.localeCompare(b)).map(([date, berita]) => ({
        date: fmtDate(date), berita,
      }))
    );
  }

  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (mapInstanceRef.current || !mapRef.current) return;

      const isDark = document.documentElement.classList.contains("dark");
      const isCategoryLayer = activeLayer !== "count";
      const tileUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

      const map = L.map(mapRef.current).setView([-8.1, 112.65], 10);
      L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 14,
      }).addTo(map);

      const resp = await fetch("/geo/Kabupaten Malang-KECAMATAN.geojson");
      const geoData = await resp.json();

      const values = stats.map(s => getLayerInfo(s.name).value).sort((a, b) => a - b);
      const maxVal = Math.max(...values, 1);
      const scaleBreaks = isCategoryLayer
        ? [0, 5, 10, 20, 40, 60, 80, 100]
        : [0, Math.ceil(maxVal * 0.05), Math.ceil(maxVal * 0.15), Math.ceil(maxVal * 0.3), Math.ceil(maxVal * 0.5), Math.ceil(maxVal * 0.75), maxVal];
      function getColor(value: number) {
        const idx = scaleBreaks.findIndex(b => value <= b);
        return HEAT_COLORS[Math.min(idx === -1 ? HEAT_COLORS.length - 1 : idx, HEAT_COLORS.length - 1)];
      }

      const geoLayer = L.geoJSON(geoData, {
        style: (feature: any) => {
          const name = feature.properties?.kecamatan || "";
          const layerInfo = getLayerInfo(name);
          return {
            color: isDark ? "#374151" : "#D1D5DB",
            weight: 1.2,
            fillOpacity: 0.75,
            fillColor: getColor(layerInfo.value),
          };
        },
        onEachFeature: (feature: any, layer: any) => {
          const name = feature.properties?.kecamatan || "";
          const layerInfo = getLayerInfo(name);

          const tooltip = L.tooltip({
            permanent: true, direction: "center", className: "kec-label", offset: [0, 0],
          }).setContent(`<div style="font-size:9px;font-weight:600;text-shadow:0 1px 2px rgba(0,0,0,0.6);color:${layerInfo.value > 0 ? '#fff' : isDark ? '#9CA3AF' : '#6B7280'};background:transparent;border:none;box-shadow:none;text-align:center;line-height:1.2">${name}<br/><span style="font-size:10px">${layerInfo.label}</span></div>`);
          layer.bindTooltip(tooltip);

          layer.on("click", () => selectKecamatan(name));
          layer.on("mouseover", () => {
            layer.setStyle({ fillOpacity: 0.9, weight: 2.5 });
            if (layer.getTooltip()) {
              layer.setTooltipContent(`<div style="font-size:10px;font-weight:600;text-shadow:0 1px 2px rgba(0,0,0,0.6);color:#fff;background:transparent;border:none;box-shadow:none;text-align:center;line-height:1.2">${name}<br/><span style="font-size:11px;color:#fff">${layerInfo.hoverLabel}</span></div>`);
            }
          });
          layer.on("mouseout", () => {
            layer.setStyle({ fillOpacity: 0.75, weight: 1.2 });
            if (layer.getTooltip()) {
              layer.setTooltipContent(`<div style="font-size:9px;font-weight:600;text-shadow:0 1px 2px rgba(0,0,0,0.6);color:${layerInfo.value > 0 ? '#fff' : isDark ? '#9CA3AF' : '#6B7280'};background:transparent;border:none;box-shadow:none;text-align:center;line-height:1.2">${name}<br/><span style="font-size:10px">${layerInfo.label}</span></div>`);
            }
          });
        },
      }).addTo(map);
      map.fitBounds(geoLayer.getBounds());

      const legend = (L as any).control({ position: "bottomright" });
      legend.onAdd = () => {
        const div = L.DomUtil.create("div", "info legend");
        div.style.background = isDark ? "#1F2937" : "white";
        div.style.padding = "8px 12px";
        div.style.borderRadius = "8px";
        div.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
        div.style.fontSize = "12px";
        div.style.color = isDark ? "#E5E7EB" : "#374151";
        div.innerHTML = `<b>${getLayerTitle()}</b><br/>`;
        const unit = isCategoryLayer ? "%" : "";
        for (let i = 0; i < scaleBreaks.length; i++) {
          const start = i === 0 ? "0" : String(scaleBreaks[i - 1]);
          const end = String(scaleBreaks[i]);
          const label = i === 0 ? `0${unit}` : `${start}${unit} - ${end}${unit}`;
          div.innerHTML +=
            `<i style="background:${HEAT_COLORS[i]};width:14px;height:14px;display:inline-block;margin-right:4px;border-radius:2px;border:1px solid ${isDark ? '#4B5563' : '#D1D5DB'}"></i>` +
            `${label}<br/>`;
        }
        return div;
      };
      legend.addTo(map);
      map.invalidateSize();
      mapInstanceRef.current = map;
    })();
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [loading, stats, activeLayer, kecCategoryStats]);

  const sentColors = ["#4bb062", "#EAB308", "#E11D48", "#9C9590"];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Peta Spasial</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Klik kecamatan untuk melihat detail berita dan analisis sentimen</p>
      </div>

      <div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Layer Peta</h3>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Aktif: {getLayerTitle()}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            {HEAT_COLORS.map((color, i) => (
              <span key={i} className="h-2.5 w-6 first:rounded-l-full last:rounded-r-full" style={{ backgroundColor: color }} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors"
            style={{ backgroundColor: activeLayer === "count" ? "var(--accent)" : "var(--bg-primary)", color: activeLayer === "count" ? "#fff" : "var(--text-secondary)" }}>
            <input type="radio" name="map-layer" checked={activeLayer === "count"} onChange={() => setActiveLayer("count")} className="h-3 w-3" />
            Jumlah Berita
          </label>
          {CATEGORY_LAYERS.map((category) => {
            const layerId = `category:${category}` as MapLayer;
            const active = activeLayer === layerId;
            return (
              <label key={category} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs capitalize transition-colors"
                style={{ backgroundColor: active ? "var(--accent)" : "var(--bg-primary)", color: active ? "#fff" : "var(--text-secondary)" }}>
                <input type="radio" name="map-layer" checked={active} onChange={() => setActiveLayer(layerId)} className="h-3 w-3" />
                % {category}
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div ref={mapRef} style={{ height: 520, borderColor: "var(--border)" }}
          className="w-full md:flex-1 md:min-w-0 rounded-xl overflow-hidden shadow-sm border transition-all duration-300">
          {loading && (
            <div className="flex items-center justify-center h-full" style={{ backgroundColor: "var(--bg-card)" }}>
              <MapIcon size={32} style={{ color: "var(--text-muted)" }} className="animate-pulse" />
            </div>
          )}
        </div>

        {selectedKec && (
          <div className="rounded-xl p-4 shadow-sm overflow-y-auto w-full md:basis-[42%] md:max-h-[520px] md:min-w-0" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{selectedKec}</h3>
              <button onClick={() => setSelectedKec(null)} className="p-1 rounded-lg hover:bg-black/10 transition-colors" style={{ color: "var(--text-muted)" }}>
                <X size={16} />
              </button>
            </div>

            {/* Real Date Trend */}
            <div className="mb-4">
              <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Tren Berita</h4>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={kecTrend}>
                  <defs><linearGradient id="wkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4bb062" stopOpacity={0.3} /><stop offset="95%" stopColor="#4bb062" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 7, fill: "var(--text-muted)" }} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 10 }} />
                  <Area type="monotone" dataKey="berita" stroke="#4bb062" fill="url(#wkGrad)" strokeWidth={2} dot={false} />
                  <Brush dataKey="date" height={24} stroke="#157f3b" fill="var(--bg-card)" travellerWidth={8} gap={1} style={{ color: "var(--text-secondary)", fontSize: 8 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Sentiment Pie */}
            <div className="mb-4">
              <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Analisa Sentimen</h4>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={kecSentiment} cx="50%" cy="50%" innerRadius={25} outerRadius={48} paddingAngle={3} dataKey="value">
                    {kecSentiment.map((_, i) => <Cell key={i} fill={sentColors[i % sentColors.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 10, padding: 6 }}
                    formatter={(v: any) => [v, "Artikel"] as [string, string]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-2 justify-center text-[10px] mt-1">
                {kecSentiment.map((s: any, i: number) => (
                  <span key={i} style={{ color: "var(--text-muted)" }}>
                    <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: sentColors[i] }} />
                    {s.name}: {s.value}
                  </span>
                ))}
              </div>
            </div>

            {/* Sentiment per Category */}
            <div className="mb-4">
              <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Proporsi Sentimen per Kategori</h4>
              {kecSentByCat.length > 0 ? (
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={kecSentByCat} margin={{ left: 0, right: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 7, fill: "var(--text-muted)" }} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 9 }} />
                    <Bar dataKey="positive" stackId="a" fill="#4bb062" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="neutral" stackId="a" fill="#EAB308" />
                    <Bar dataKey="negative" stackId="a" fill="#E11D48" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Tidak ada data kategori</p>
              )}
            </div>

            {/* News Table */}
            <div>
              <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>List Berita</h4>
              <div className="space-y-1 max-h-[140px] overflow-y-auto">
                {kecArticles.map((a: any, i: number) => (
                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                    className="block px-2 py-1 rounded-lg text-xs transition-colors hover:bg-black/5"
                    style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-1 flex-1">{a.title}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        a.sentiment === "positive" ? "bg-emerald-200 text-emerald-900" :
                        a.sentiment === "negative" ? "bg-red-200 text-red-900" :
                        "bg-yellow-200 text-yellow-900"
                      }`}>{a.sentiment || "—"}</span>
                    </div>
                    <div className="flex gap-2 mt-0.5">
                      <span style={{ color: "var(--text-muted)" }} className="text-[9px]">{a.source}</span>
                      <span style={{ color: "var(--text-muted)" }} className="text-[9px]">{a.published_date?.slice(0, 10)}</span>
                    </div>
                  </a>
                ))}
                {kecArticles.length === 0 && (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Tidak ada berita untuk kecamatan ini</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Kecamatan List with 7d Delta */}
      <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Daftar Kecamatan</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {statsWithDelta.map((s, i) => {
            const layerInfo = getLayerInfo(s.name);
            return (
              <button key={i} onClick={() => selectKecamatan(s.name)}
                className={`flex items-center justify-between px-3 py-1.5 rounded-lg transition-all text-left ${selectedKec === s.name ? "ring-2 ring-orange-500" : ""}`}
                style={{ backgroundColor: "var(--bg-primary)" }}>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{s.name}</span>
                  <span className={`flex items-center gap-0.5 text-[10px] font-medium ${s.delta > 0 ? "text-emerald-600" : s.delta < 0 ? "text-red-600" : "text-gray-400"}`}>
                    {s.delta > 0 ? <TrendingUp size={10} /> : s.delta < 0 ? <TrendingDown size={10} /> : null}
                    <span className="text-[8px] opacity-60">7d</span>
                    {s.delta !== 0 ? (s.delta > 0 ? "+" : "") + s.delta : "—"}
                  </span>
                  {activeLayer !== "count" && (
                    <span className="text-[9px] truncate" style={{ color: "var(--text-muted)" }}>{layerInfo.detail}</span>
                  )}
                </div>
                <span className="text-xs font-semibold flex-shrink-0 ml-2" style={{ color: "var(--accent)" }}>{layerInfo.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <style jsx global>{`
        .kec-label .leaflet-tooltip-content { margin: 0 !important; line-height: 1.2 !important; }
        .kec-label { background: transparent !important; border: none !important; box-shadow: none !important; pointer-events: none !important; }
        .kec-label::before { border: none !important; }
      `}</style>
    </div>
  );
}
