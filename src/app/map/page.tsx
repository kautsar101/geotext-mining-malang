"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { MapIcon } from "lucide-react";

const API = "/api/db?table=clean_news_articles";

export default function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetch(`${API}&select=primary_kecamatan`).then(r => r.json()).then(d => d.data || []);
        const kecCount: Record<string, number> = {};
        data.forEach((r: any) => {
          if (r.primary_kecamatan) kecCount[r.primary_kecamatan] = (kecCount[r.primary_kecamatan] || 0) + 1;
        });
        setStats(Object.entries(kecCount).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (mapInstanceRef.current || !mapRef.current) return;

      const isDark = document.documentElement.classList.contains("dark");
      const tileUrl = isDark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

      const map = L.map(mapRef.current).setView([-8.1, 112.65], 10);
      L.tileLayer(tileUrl, {
        attribution: isDark ? '&copy; <a href="https://carto.com/">CARTO</a>' : '&copy; OpenStreetMap',
        maxZoom: 14,
      }).addTo(map);

      const resp = await fetch("/geo/Kabupaten Malang-KECAMATAN.geojson");
      const geoData = await resp.json();
      const maxCount = Math.max(...stats.map(s => s.value), 1);

      function getColor(count: number) {
        const ratio = count / maxCount;
        if (ratio > 0.8) return "#8B4513";
        if (ratio > 0.5) return "#B45309";
        if (ratio > 0.2) return "#D97706";
        return "#FDE68A";
      }

      const geoLayer = L.geoJSON(geoData, {
        style: (feature: any) => {
          const name = feature.properties?.kecamatan || "";
          const count = stats.find(s => s.name.toLowerCase() === name.toLowerCase())?.value || 0;
          return { color: isDark ? "#44403C" : "#8B7355", weight: 1.5, fillOpacity: 0.7, fillColor: getColor(count) };
        },
        onEachFeature: (feature: any, layer: any) => {
          const name = feature.properties?.kecamatan || "";
          const count = stats.find(s => s.name.toLowerCase() === name.toLowerCase())?.value || 0;
          layer.bindPopup(`<b>${name}</b><br/>${count} berita`);
          layer.on("mouseover", () => layer.setStyle({ fillOpacity: 0.9, weight: 2.5 }));
          layer.on("mouseout", () => layer.setStyle({ fillOpacity: 0.7, weight: 1.5 }));
        },
      }).addTo(map);
      map.fitBounds(geoLayer.getBounds());
      mapInstanceRef.current = map;
    })();
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [loading, stats]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Peta Spasial</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Persebaran berita per kecamatan di Kabupaten Malang</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {stats.slice(0, 3).map((s, i) => (
          <div key={i} className="card-hover rounded-xl p-4 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{s.name}</p>
            <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{s.value} berita</p>
          </div>
        ))}
      </div>
      <div ref={mapRef} style={{ height: 500, borderColor: "var(--border)" }} className="rounded-xl overflow-hidden shadow-sm border">
        {loading && (
          <div className="flex items-center justify-center h-full" style={{ backgroundColor: "var(--bg-card)" }}>
            <MapIcon size={32} style={{ color: "var(--text-muted)" }} className="animate-pulse" />
          </div>
        )}
      </div>
      <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Daftar Kecamatan</h3>
        <div className="grid grid-cols-4 gap-2">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-lg" style={{ backgroundColor: "var(--bg-primary)" }}>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{s.name}</span>
              <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
