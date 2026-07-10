"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, Send, Maximize2, Minimize2 } from "lucide-react";
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
  tableData?: { type: "sql" | "rag"; rows: { title: string; url: string; content: string }[] };
  debug?: unknown;
};

type LLMResponsePayload = {
  response?: string;
  sources?: Source[];
  tablePanel?: { type: "sql" | "rag"; rows: { title: string; url: string; content: string }[] };
  debug?: unknown;
  error?: string;
};

const AI_WARNING_TEXT = "Jawaban AI dapat mengandung kesalahan. Harap cross-check dengan sumber berita asli melalui link yang tersedia.";
const MEMORY_NOTICE_TEXT = "Untuk menjaga performa dan efisiensi, chatbot hanya menyimpan konteks percakapan dalam kapasitas terbatas. Mohon sertakan ulang informasi penting jika diskusi sudah berlangsung panjang.";

function parseSSEBlock(block: string): { event: string; data: unknown } | null {
  const event = block.split('\n').find((line) => line.startsWith('event: '))?.slice(7).trim();
  const dataLine = block.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
  if (!event || !dataLine) return null;

  try {
    return { event, data: JSON.parse(dataLine) as unknown };
  } catch {
    return null;
  }
}

async function readLLMStream(
  response: Response,
  onProcess: (label: string) => void,
): Promise<LLMResponsePayload> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    return response.json() as Promise<LLMResponsePayload>;
  }

  if (!response.body) return response.json() as Promise<LLMResponsePayload>;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalPayload: LLMResponsePayload | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');

    while (boundary >= 0) {
      const rawBlock = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);

      const parsed = parseSSEBlock(rawBlock);
      if (parsed?.event === 'step') {
        const step = parsed.data as { label?: unknown };
        if (typeof step.label === 'string') onProcess(step.label);
      }
      if (parsed?.event === 'result') {
        finalPayload = parsed.data as LLMResponsePayload;
      }
      if (parsed?.event === 'error') {
        finalPayload = parsed.data as LLMResponsePayload;
      }

      boundary = buffer.indexOf('\n\n');
    }
  }

  return finalPayload || { error: 'Respons stream kosong' };
}

function genSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = localStorage.getItem('llm_session_id');
  if (!sid) { sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); localStorage.setItem('llm_session_id', sid); }
  return sid;
}

export default function LLMPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Halo! Saya siap membantu pertanyaan seputar berita daerah Kabupaten Malang." },
  ]);
  const [input, setInput] = useState("");
  // ponytail: debug toggle disabled — debug data no longer sent from API
  const [isLoading, setIsLoading] = useState(false);
  const [activeProcess, setActiveProcess] = useState("Mengirim pertanyaan...");
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [activeTableIndex, setActiveTableIndex] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(genSessionId());

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

  // ponytail: auto-switch panel — cuma untuk last message assistant
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant" && lastMsg.tableData && lastMsg.tableData.rows.length > 0) {
      setActiveTableIndex(messages.length - 1);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setActiveProcess("Mengirim pertanyaan...");
    setIsLoading(true);
    setActiveTableIndex(null); // tutup table, muncul lagi kalo response punya data

    try {
      const payload = { query: userMsg };

      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-id": sessionId.current },
        body: JSON.stringify({ ...payload, stream: true }),
      });
      let data: LLMResponsePayload;

      try {
        data = await readLLMStream(res, setActiveProcess);
      } catch {
        setActiveProcess("Menyusun jawaban...");
        const fallbackRes = await fetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-session-id": sessionId.current },
          body: JSON.stringify(payload),
        });
        data = await fallbackRes.json();
      }

      if (data.error) {
        setMessages(prev => [...prev, { role: "assistant", content: data.error || "Maaf, terjadi kendala saat memproses jawaban." }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.response || "Maaf, respons kosong.", sources: data.sources || [], tableData: data.tablePanel, debug: data.debug }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Gagal terhubung ke server." }]);
    }
    setIsLoading(false);
  };

  const chatPanelStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" };

  const chatPanel = (
    <div className="relative flex-1 rounded-xl overflow-hidden flex flex-col shadow-sm border"
      style={chatPanelStyle}>
      {chatFullscreen && (
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 z-20 px-4 pb-8 pt-4"
          style={{ background: "linear-gradient(to bottom, var(--bg-card) 0%, color-mix(in srgb, var(--bg-card) 88%, transparent) 55%, transparent 100%)" }}
        >
          <div
            className="inline-flex max-w-[calc(100%-4rem)] items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] shadow-sm"
            style={{ backgroundColor: "color-mix(in srgb, var(--bg-primary) 88%, transparent)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            <span className="flex-shrink-0">⚠️</span>
            <span>{AI_WARNING_TEXT}</span>
          </div>
        </div>
      )}
      <button
        onClick={() => setChatFullscreen(v => !v)}
        title={chatFullscreen ? "Keluar fullscreen chat" : "Fullscreen chat"}
        className="absolute right-4 top-4 z-30 p-2 rounded-lg shadow-sm transition-opacity hover:opacity-80"
        style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
      >
        {chatFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>

      <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${chatFullscreen ? "pt-24" : "pt-14"}`}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
            <div className={`space-y-2 ${m.role === "user" ? "max-w-[86%]" : "max-w-[94%] lg:max-w-[90%]"}`}>
              <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "text-white" : ""}`}
                style={m.role === "user" ? { backgroundColor: "var(--accent)" } : { backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
                <InlineContent text={m.content} sources={m.sources || []} />
                {m.role === "assistant" && m.tableData && m.tableData.rows.length > 0 && (
                  <button onClick={() => setActiveTableIndex(activeTableIndex === i ? null : i)}
                    className="mt-2 px-3 py-1 text-xs rounded-lg transition-colors hover:opacity-80"
                    style={{
                      backgroundColor: activeTableIndex === i ? "var(--accent)" : "color-mix(in srgb, var(--accent) 15%, transparent)",
                      color: activeTableIndex === i ? "#fff" : "var(--accent)",
                      border: "1px solid var(--accent)",
                    }}>
                    {activeTableIndex === i ? "Sembunyikan Table" : `Lihat Table (${m.tableData.rows.length})`}
                  </button>
                )}
                {/* ponytail: debug panel removed — not exposed to client */}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start animate-fade-in">
            <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
              <Loader2 size={15} className="animate-spin" style={{ color: "var(--accent)" }} />
              <span>{activeProcess}</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t p-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-3">
          <input type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Tanya tentang berita daerah..."
            className="flex-1 px-4 py-2.5 text-sm rounded-lg border focus:outline-none focus:ring-2"
            style={{ color: "var(--text-primary)", backgroundColor: "var(--bg-primary)", borderColor: "var(--border)" }} />
          <button onClick={handleSend} disabled={!input.trim() || isLoading}
            className="px-4 py-2.5 text-white rounded-lg disabled:opacity-40 transition-colors"
            style={{ backgroundColor: "var(--accent)" }}>
            <Send size={18} />
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {MEMORY_NOTICE_TEXT}
        </p>
      </div>
    </div>
  );

  return (
    <div className="relative flex flex-col h-[calc(100vh-9rem)] w-full min-w-0">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>AI Assistant Chatbot</h2>
        </div>
      </div>

      <div className="text-[10px] px-3 py-1.5 rounded-lg mb-3 flex items-center gap-1.5"
        style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-muted)" }}>
        <span className="flex-shrink-0">⚠️</span>
        {AI_WARNING_TEXT}
      </div>

      {chatFullscreen && typeof document !== "undefined" ? (
        createPortal(
          <div className="fixed z-[100] flex"
            style={{
              left: "var(--sidebar-width, 16rem)",
              top: 0, right: 0, bottom: 0,
              backgroundColor: "var(--bg-card)",
            }}>
            <div className="flex-1 flex flex-col min-w-0">{chatPanel}</div>
            {activeTableIndex !== null && messages[activeTableIndex]?.tableData && (
              <div className="w-[420px] lg:w-[480px] flex-shrink-0 overflow-y-auto border-l"
                style={{ borderColor: "var(--border)" }}>
                <TablePanel
                  data={messages[activeTableIndex].tableData!}
                  onClose={() => setActiveTableIndex(null)}
                />
              </div>
            )}
          </div>,
          document.body
        )
      ) : (
        <div className="flex flex-1 min-h-0 gap-0">
          <div className="flex-1 flex flex-col min-w-0">{chatPanel}</div>
          {activeTableIndex !== null && messages[activeTableIndex]?.tableData && (
            <div className="w-[420px] lg:w-[480px] flex-shrink-0 overflow-y-auto ml-3">
              <TablePanel
                data={messages[activeTableIndex].tableData!}
                onClose={() => setActiveTableIndex(null)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
