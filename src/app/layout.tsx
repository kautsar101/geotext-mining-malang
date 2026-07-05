"use client";

import { useState, useEffect } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { LayoutDashboard, Map, BarChart3, Newspaper, MessageSquare, ChevronLeft, ChevronRight, Sun, Moon } from "lucide-react";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Peta Spasial", icon: Map, href: "/map" },
  { label: "Analisis Sentimen", icon: BarChart3, href: "/sentiment" },
  { label: "List Berita", icon: Newspaper, href: "/news" },
  { label: "LLM Chat", icon: MessageSquare, href: "/llm" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      setDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <html lang="id">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "var(--bg-primary)" }}>
          <aside style={{ backgroundColor: "var(--bg-sidebar)", borderRight: "1px solid var(--border)" }}
            className={`flex-shrink-0 flex flex-col transition-all duration-300 ${collapsed ? "w-20" : "w-64"}`}>
            <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
              {!collapsed && (
                <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                  Malang<span style={{ color: "var(--accent)" }}>News</span>
                </h1>
              )}
              <button onClick={() => setCollapsed(!collapsed)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: "var(--text-muted)", backgroundColor: "transparent" }}>
                {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
            </div>
            <nav className="flex-1 py-3 space-y-1 px-2">
              {NAV_ITEMS.map((item) => (
                <a key={item.label} href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group"
                  style={{ color: "var(--text-secondary)" }}>
                  <item.icon size={20} className="flex-shrink-0" />
                  {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                </a>
              ))}
            </nav>
            <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
              <button onClick={toggleTheme}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}>
                {dark ? <Sun size={20} /> : <Moon size={20} />}
                {!collapsed && <span>{dark ? "Terang" : "Gelap"}</span>}
              </button>
            </div>
          </aside>
          <main className="flex-1 overflow-y-auto p-6 lg:p-8" style={{ backgroundColor: "var(--bg-primary)" }}>
            <div className="animate-fade-in max-w-7xl mx-auto">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}