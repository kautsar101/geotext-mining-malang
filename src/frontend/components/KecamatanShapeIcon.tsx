"use client";

import { useEffect, useState } from "react";

type Position = [number, number, number?];
type Polygon = Position[][];
type Geometry = { type?: string; coordinates?: Polygon | Polygon[] };
type Feature = { properties?: { kecamatan?: string }; geometry?: Geometry };
type FeatureCollection = { features?: Feature[] };

let pathsPromise: Promise<Map<string, string>> | null = null;

function sampleRing(ring: Position[]) {
  const step = Math.max(1, Math.ceil(ring.length / 90));
  return ring.filter((_, index) => index % step === 0 || index === ring.length - 1);
}

function geometryToPath(geometry: Geometry | undefined) {
  if (!geometry?.coordinates) return "";
  const polygons: Polygon[] = geometry.type === "MultiPolygon"
    ? geometry.coordinates as Polygon[]
    : [geometry.coordinates as Polygon];
  const rings = polygons.map((polygon) => sampleRing(polygon[0] || [])).filter((ring) => ring.length > 2);
  const points = rings.flat();
  if (points.length === 0) return "";

  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const scale = 22 / Math.max(maxX - minX, maxY - minY, 0.0001);
  const offsetX = (24 - (maxX - minX) * scale) / 2;
  const offsetY = (24 - (maxY - minY) * scale) / 2;

  return rings.map((ring) => ring.map(([x, y], index) => {
    const px = offsetX + (x - minX) * scale;
    const py = offsetY + (maxY - y) * scale;
    return `${index === 0 ? "M" : "L"}${px.toFixed(2)} ${py.toFixed(2)}`;
  }).join(" ") + " Z").join(" ");
}

function loadPaths() {
  if (!pathsPromise) {
    pathsPromise = fetch("/geo/Kabupaten%20Malang-KECAMATAN.geojson")
      .then((response) => response.json() as Promise<FeatureCollection>)
      .then((collection) => new Map((collection.features || []).map((feature) => [
        feature.properties?.kecamatan?.toLowerCase() || "",
        geometryToPath(feature.geometry),
      ])));
  }
  return pathsPromise;
}

export default function KecamatanShapeIcon({ name }: { name?: string | null }) {
  const [path, setPath] = useState("");

  useEffect(() => {
    let active = true;
    if (!name) return;
    void loadPaths().then((paths) => {
      if (active) setPath(paths.get(name.toLowerCase()) || "");
    });
    return () => { active = false; };
  }, [name]);

  if (!path) return <span className="inline-block h-5 w-5 rounded-sm border" style={{ borderColor: "var(--border)" }} aria-hidden="true" />;
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0"><path d={path} fill="currentColor" /></svg>;
}
