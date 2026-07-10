"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import { LayoutGrid, Map, BarChart3, Newspaper, ChevronLeft, ChevronRight, Menu, MessageSquare, Moon, Sun, UserRound, X } from "lucide-react";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutGrid, href: "/" },
  { label: "Peta Spasial", icon: Map, href: "/map" },
  { label: "Analisis Sentimen", icon: BarChart3, href: "/sentiment" },
  { label: "List Berita", icon: Newspaper, href: "/news" },
  { label: "Tanya AI", icon: MessageSquare, href: "/llm" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const pathname = usePathname();
  const isLLMPage = pathname === "/llm";
  const sidebarWidth = collapsed ? "5rem" : "16rem";
  const shellStyle = {
    backgroundColor: "var(--bg-primary)",
  } as React.CSSProperties;
  const bodyStyle = { "--sidebar-width": sidebarWidth } as React.CSSProperties;

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      window.requestAnimationFrame(() => setDark(true));
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const openAdminLogin = () => {
    window.dispatchEvent(new Event("open-llm-admin-login"));
  };

  return (
    <html lang="id">
      <head>
        <link rel="icon" href="/logo.png" type="image/png" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} style={bodyStyle}>
        <div className="flex h-screen overflow-hidden" style={shellStyle}>
          <aside style={{ backgroundColor: "var(--bg-sidebar)", borderRight: "1px solid var(--border)" }}
            className={`hidden flex-shrink-0 flex-col transition-all duration-300 lg:flex ${collapsed ? "w-20" : "w-64"}`}>
            <div className={`flex items-center p-4 ${collapsed ? "flex-col gap-2 justify-center" : "justify-between"}`} style={{ borderBottom: "1px solid var(--border)" }}>
              {!collapsed && (
                <div className="flex items-center gap-2">
                  <Image src="/logo.png" alt="GeoText Mining Logo" width={52} height={52} className="flex-shrink-0" />
                  <div>
                    <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                      Geotext<span style={{ color: "var(--accent)" }}> Mining</span>
                    </h1>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Kabupaten Malang</p>
                  </div>
                </div>
              )}
              {collapsed && (
                <Image src="/logo.png" alt="GeoText Mining Logo" width={56} height={56} className="flex-shrink-0" unoptimized />
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
              {isLLMPage && (
                <button onClick={openAdminLogin}
                  className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all"
                  style={{ color: "var(--text-secondary)" }}>
                  <UserRound size={20} />
                  {!collapsed && <span>Admin</span>}
                </button>
              )}
              <button onClick={toggleTheme}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}>
                {dark ? <Sun size={20} /> : <Moon size={20} />}
                {!collapsed && <span>{dark ? "Terang" : "Gelap"}</span>}
              </button>
            </div>
          </aside>
          <button
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Buka navigasi"
            aria-expanded={mobileMenuOpen}
            className="fixed left-4 top-4 z-50 rounded-xl border p-3 shadow-lg lg:hidden"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            <Menu size={20} />
          </button>

          {mobileMenuOpen && (
            <aside className="fixed inset-0 z-[60] flex flex-col lg:hidden" style={{ backgroundColor: "var(--bg-sidebar)" }}>
              <div className="flex items-center justify-between border-b p-4" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  <Image src="/logo.png" alt="GeoText Mining Logo" width={46} height={46} />
                  <div>
                    <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                      Geotext<span style={{ color: "var(--accent)" }}> Mining</span>
                    </h1>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Kabupaten Malang</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Tutup navigasi"
                  className="rounded-lg p-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <X size={20} />
                </button>
              </div>
              <nav className="flex-1 space-y-2 p-4">
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium"
                    style={{ color: "var(--text-secondary)", backgroundColor: pathname === item.href ? "var(--bg-card)" : "transparent" }}
                  >
                    <item.icon size={20} />
                    {item.label}
                  </a>
                ))}
              </nav>
              <div className="border-t p-4" style={{ borderColor: "var(--border)" }}>
                {isLLMPage && (
                  <button onClick={openAdminLogin}
                    className="mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium"
                    style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" }}>
                    <UserRound size={20} />
                    <span>Admin</span>
                  </button>
                )}
                <button onClick={toggleTheme}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium"
                  style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" }}>
                  {dark ? <Sun size={20} /> : <Moon size={20} />}
                  <span>{dark ? "Mode terang" : "Mode gelap"}</span>
                </button>
              </div>
            </aside>
          )}
          <main className="flex-1 overflow-y-auto p-4 pt-20 lg:p-8" style={{ backgroundColor: "var(--bg-primary)" }}>
            <div className={`animate-fade-in mx-auto ${isLLMPage ? "w-full max-w-none" : "max-w-7xl"}`}>{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
