"use client";

import { BriefcaseBusiness, GraduationCap, Handshake, HeartPulse } from "lucide-react";

const CATEGORY_CONFIG = {
  ekonomi: { label: "Ekonomi", background: "#dbeafe", Icon: BriefcaseBusiness },
  sosial: { label: "Sosial", background: "#f3e8ff", Icon: Handshake },
  kesehatan: { label: "Kesehatan", background: "#dcfce7", Icon: HeartPulse },
  pendidikan: { label: "Pendidikan", background: "#ffedd5", Icon: GraduationCap },
} as const;

const SENTIMENT_CONFIG = {
  positive: { label: "Positif", color: "#15803d" },
  neutral: { label: "Netral", color: "#eab308" },
  negative: { label: "Negatif", color: "#dc2626" },
} as const;

export function CategoryBadge({ category }: { category?: string | null }) {
  const config = category ? CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] : undefined;
  if (!config) return <span className="text-xs" style={{ color: "var(--text-muted)" }}>-</span>;

  const { Icon } = config;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium" style={{ backgroundColor: config.background, color: "#1c1917" }}>
      <Icon size={12} strokeWidth={2.1} />
      {config.label}
    </span>
  );
}

export function SentimentBadge({ sentiment }: { sentiment?: string | null }) {
  const config = sentiment ? SENTIMENT_CONFIG[sentiment as keyof typeof SENTIMENT_CONFIG] : undefined;
  if (!config) return <span className="text-xs" style={{ color: "var(--text-muted)" }}>-</span>;

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: config.color }} />
      {config.label}
    </span>
  );
}
