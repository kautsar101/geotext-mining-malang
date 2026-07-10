"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, Loader2, LockKeyhole, LogOut, Maximize2, Minimize2, Send, X } from "lucide-react";
import InlineContent from "@/frontend/components/InlineContent";
import TablePanel from "@/frontend/components/TablePanel";

type Source = {
  id: number;
  url?: string;
  source?: string;
  title?: string;
};

type ChatMessage = {
  role: string;
  content: string;
  sources?: Source[];
  tableData?: { type: "sql" | "rag"; rows: { reference: number; title: string; url: string; content: string }[] };
};

type LLMResponsePayload = {
  response?: string;
  sources?: Source[];
  tablePanel?: { type: "sql" | "rag"; rows: { reference: number; title: string; url: string; content: string }[] };
  error?: string;
};

const AI_WARNING_TEXT = "Jawaban AI dapat mengandung kesalahan. Harap cross-check dengan sumber berita asli melalui link yang tersedia.";
const GUEST_MEMORY_NOTICE = "Untuk menjaga respons tetap cepat dan efisien, chatbot tidak menyimpan konteks percakapan sebelumnya. Mohon tulis pertanyaan secara lengkap dan jelas dalam satu pesan.";
const ADMIN_MEMORY_NOTICE = "Mode admin memakai konteks hingga 10 percakapan terakhir untuk menjaga kesinambungan diskusi.";

function parseSSEBlock(block: string): { event: string; data: unknown } | null {
  const event = block.split("\n").find((line) => line.startsWith("event: "))?.slice(7).trim();
  const dataLine = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
  if (!event || !dataLine) return null;

  try {
    return { event, data: JSON.parse(dataLine) as unknown };
  } catch {
    return null;
  }
}

async function readLLMStream(response: Response, onProcess: (label: string) => void): Promise<LLMResponsePayload> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    return response.json() as Promise<LLMResponsePayload>;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: LLMResponsePayload | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const parsed = parseSSEBlock(buffer.slice(0, boundary).trim());
      buffer = buffer.slice(boundary + 2);

      if (parsed?.event === "step") {
        const step = parsed.data as { label?: unknown };
        if (typeof step.label === "string") onProcess(step.label);
      }
      if (parsed?.event === "result" || parsed?.event === "error") {
        finalPayload = parsed.data as LLMResponsePayload;
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  return finalPayload || { error: "Respons stream kosong" };
}

function createSessionId(mode: "guest" | "admin") {
  if (typeof window === "undefined") return "";
  const storageKey = `llm_${mode}_session_id`;
  let sessionId = localStorage.getItem(storageKey);
  if (!sessionId) {
    sessionId = `${mode}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(storageKey, sessionId);
  }
  return sessionId;
}

function initialMessages(adminMode: boolean): ChatMessage[] {
  return [{
    role: "assistant",
    content: adminMode
      ? "Mode admin aktif. Saya dapat membantu analisis berita Kabupaten Malang dengan konteks percakapan yang lebih panjang."
      : "Halo! Saya siap membantu pertanyaan seputar berita daerah Kabupaten Malang.",
  }];
}

export default function LLMPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages(false));
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeProcess, setActiveProcess] = useState("Mengirim pertanyaan...");
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [activeTableIndex, setActiveTableIndex] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef("");

  const switchChatMode = (adminMode: boolean) => {
    sessionId.current = createSessionId(adminMode ? "admin" : "guest");
    setMessages(initialMessages(adminMode));
    setActiveTableIndex(null);
    setInput("");
  };

  useEffect(() => {
    let cancelled = false;
    const checkAdminSession = async () => {
      try {
        const response = await fetch("/api/llm/admin/session", { cache: "no-store" });
        const data = await response.json() as { authenticated?: boolean };
        if (cancelled) return;
        const authenticated = data.authenticated === true;
        setIsAdmin(authenticated);
        switchChatMode(authenticated);
      } catch {
        if (!cancelled) switchChatMode(false);
      }
    };
    void checkAdminSession();

    const openAdminLogin = () => setAdminModalOpen(true);
    window.addEventListener("open-llm-admin-login", openAdminLogin);
    return () => {
      cancelled = true;
      window.removeEventListener("open-llm-admin-login", openAdminLogin);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, activeProcess]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleAdminLogin = async () => {
    if (!username.trim() || !password || authLoading) return;
    setAuthLoading(true);
    setAuthError("");
    try {
      const response = await fetch("/api/llm/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json() as { authenticated?: boolean; error?: string };
      if (!response.ok || !data.authenticated) {
        setAuthError(data.error || "Login admin gagal.");
        return;
      }

      setIsAdmin(true);
      switchChatMode(true);
      setPassword("");
      setShowPassword(false);
      setAdminModalOpen(false);
    } catch {
      setAuthError("Gagal terhubung ke server.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    setAuthLoading(true);
    try {
      await fetch("/api/llm/admin/logout", { method: "POST" });
    } finally {
      setIsAdmin(false);
      switchChatMode(false);
      setAdminModalOpen(false);
      setAuthLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    const assistantMessageIndex = messages.length + 1;
    const activeSessionId = sessionId.current || createSessionId(isAdmin ? "admin" : "guest");
    sessionId.current = activeSessionId;
    setInput("");
    setMessages((previous) => [...previous, { role: "user", content: userMessage }]);
    setActiveProcess("Mengirim pertanyaan...");
    setIsLoading(true);
    setActiveTableIndex(null);

    try {
      const payload = { query: userMessage };
      const response = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-id": activeSessionId },
        body: JSON.stringify({ ...payload, stream: true }),
      });

      let data: LLMResponsePayload;
      try {
        data = await readLLMStream(response, setActiveProcess);
      } catch {
        const fallback = await fetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-session-id": activeSessionId },
          body: JSON.stringify(payload),
        });
        data = await fallback.json() as LLMResponsePayload;
      }

      if (data.error) {
        setMessages((previous) => [...previous, { role: "assistant", content: data.error || "Maaf, terjadi kendala saat memproses jawaban." }]);
      } else {
        if (data.tablePanel?.rows.length) setActiveTableIndex(assistantMessageIndex);
        setMessages((previous) => [...previous, {
          role: "assistant",
          content: data.response || "Maaf, respons kosong.",
          sources: data.sources || [],
          tableData: data.tablePanel,
        }]);
      }
    } catch {
      setMessages((previous) => [...previous, { role: "assistant", content: "Gagal terhubung ke server." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const chatPanel = (
    <div className="relative flex flex-1 flex-col overflow-hidden rounded-xl border shadow-sm" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      {chatFullscreen && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 px-4 pb-8 pt-4" style={{ background: "linear-gradient(to bottom, var(--bg-card) 0%, color-mix(in srgb, var(--bg-card) 88%, transparent) 55%, transparent 100%)" }}>
          <div className="inline-flex max-w-[calc(100%-4rem)] items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] shadow-sm" style={{ backgroundColor: "color-mix(in srgb, var(--bg-primary) 88%, transparent)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            <span className="flex-shrink-0">⚠️</span>
            <span>{AI_WARNING_TEXT}</span>
          </div>
        </div>
      )}
      <button onClick={() => setChatFullscreen((value) => !value)} title={chatFullscreen ? "Keluar fullscreen chat" : "Fullscreen chat"} className="absolute right-4 top-4 z-30 rounded-lg border p-2 shadow-sm transition-opacity hover:opacity-80" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-secondary)", borderColor: "var(--border)" }}>
        {chatFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>

      <div className={`flex-1 space-y-4 overflow-y-auto p-4 ${chatFullscreen ? "pt-24" : "pt-14"}`}>
        {messages.map((message, index) => (
          <div key={index} className={`flex animate-fade-in ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`space-y-2 ${message.role === "user" ? "max-w-[92%] md:max-w-[86%]" : "max-w-[96%] lg:max-w-[90%]"}`}>
              <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${message.role === "user" ? "text-white" : ""}`} style={message.role === "user" ? { backgroundColor: "var(--accent)" } : { backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
                <InlineContent text={message.content} sources={message.sources || []} />
                {message.role === "assistant" && message.tableData && message.tableData.rows.length > 0 && (
                  <button onClick={() => setActiveTableIndex(activeTableIndex === index ? null : index)} className="mt-2 rounded-lg px-3 py-1 text-xs transition-colors hover:opacity-80" style={{ backgroundColor: activeTableIndex === index ? "var(--accent)" : "color-mix(in srgb, var(--accent) 15%, transparent)", color: activeTableIndex === index ? "#fff" : "var(--accent)", border: "1px solid var(--accent)" }}>
                    {activeTableIndex === index ? "Sembunyikan Tabel" : `Lihat Tabel (${message.tableData.rows.length})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex animate-fade-in justify-start">
            <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
              <Loader2 size={15} className="animate-spin" style={{ color: "var(--accent)" }} />
              <span>{activeProcess}</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t p-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-3">
          <input type="text" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && !event.shiftKey && handleSend()} placeholder="Tanya tentang berita daerah..." className="flex-1 rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-2" style={{ color: "var(--text-primary)", backgroundColor: "var(--bg-primary)", borderColor: "var(--border)" }} />
          <button onClick={handleSend} disabled={!input.trim() || isLoading} className="rounded-lg px-4 py-2.5 text-white transition-colors disabled:opacity-40" style={{ backgroundColor: "var(--accent)" }}>
            <Send size={18} />
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {isAdmin ? ADMIN_MEMORY_NOTICE : GUEST_MEMORY_NOTICE}
        </p>
      </div>
    </div>
  );

  const adminModal = adminModalOpen && (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setAdminModalOpen(false)}>
      <div className="w-full max-w-sm rounded-xl border p-5 shadow-2xl" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2" style={{ color: "var(--text-primary)" }}><LockKeyhole size={17} /><h3 className="font-semibold">Admin LLM</h3></div>
          <button onClick={() => setAdminModalOpen(false)} className="rounded-lg p-1" style={{ color: "var(--text-muted)" }}><X size={18} /></button>
        </div>
        {isAdmin ? (
          <>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Mode admin aktif dengan DeepSeek V4 Pro.</p>
            <button onClick={handleAdminLogout} disabled={authLoading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "var(--accent)" }}><LogOut size={16} />Keluar mode admin</button>
          </>
        ) : (
          <>
            <label className="block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Username
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)", borderColor: "var(--border)" }} />
            </label>
            <label className="mt-3 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Password
              <div className="relative mt-1.5">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && handleAdminLogin()} autoComplete="current-password" className="w-full rounded-lg border py-2 pl-3 pr-10 text-sm outline-none" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)", borderColor: "var(--border)" }} />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"} className="absolute inset-y-0 right-0 flex items-center px-3" style={{ color: "var(--text-muted)" }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            {authError && <p className="mt-3 text-xs text-red-600">{authError}</p>}
            <button onClick={handleAdminLogin} disabled={!username.trim() || !password || authLoading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "var(--accent)" }}>
              {authLoading ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={16} />}Masuk sebagai admin
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative flex h-[calc(100vh-9rem)] w-full min-w-0 flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>AI Assistant Chatbot</h2>
          {isAdmin && <p className="mt-1 text-xs font-medium" style={{ color: "var(--accent)" }}>Mode admin: DeepSeek V4 Pro</p>}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px]" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-muted)" }}>
        <span className="flex-shrink-0">⚠️</span>{AI_WARNING_TEXT}
      </div>

      {chatFullscreen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-y-0 left-0 z-[100] flex flex-col bg-[var(--bg-card)] lg:left-[var(--sidebar-width)] md:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{chatPanel}</div>
          {activeTableIndex !== null && messages[activeTableIndex]?.tableData && <div className="w-full flex-shrink-0 overflow-y-auto border-t md:w-[420px] md:border-l md:border-t-0 lg:w-[480px]" style={{ borderColor: "var(--border)" }}><TablePanel data={messages[activeTableIndex].tableData!} onClose={() => setActiveTableIndex(null)} /></div>}
        </div>, document.body,
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-0 md:flex-row md:gap-3">
          <div className="flex min-w-0 flex-1 flex-col">{chatPanel}</div>
          {activeTableIndex !== null && messages[activeTableIndex]?.tableData && <div className="mt-3 w-full flex-shrink-0 overflow-y-auto md:mt-0 md:w-[420px] lg:w-[480px]"><TablePanel data={messages[activeTableIndex].tableData!} onClose={() => setActiveTableIndex(null)} /></div>}
        </div>
      )}
      {typeof document !== "undefined" && adminModal ? createPortal(adminModal, document.body) : null}
    </div>
  );
}
