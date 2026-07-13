"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Maximize2, Minimize2, Send } from "lucide-react";
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
  processSteps?: ProcessStep[];
};

type ProcessStep = {
  id: string;
  label: string;
  elapsedMs?: number;
};

type LLMResponsePayload = {
  response?: string;
  sources?: Source[];
  tablePanel?: { type: "sql" | "rag"; rows: { reference: number; title: string; url: string; content: string }[] };
  processSteps?: ProcessStep[];
  error?: string;
};

const AI_WARNING_TEXT = "Jawaban AI dapat mengandung kesalahan. Harap cross-check dengan sumber berita asli melalui link yang tersedia.";
const MEMORY_NOTICE = "Chatbot menyimpan konteks terbatas hingga 10 percakapan terakhir agar jawaban tetap relevan dan efisien.";

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

async function readLLMStream(response: Response, onProcess: (step: ProcessStep) => void): Promise<LLMResponsePayload> {
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
        const step = parsed.data as { id?: unknown; label?: unknown; elapsedMs?: unknown };
        if (typeof step.id === "string" && typeof step.label === "string") {
          onProcess({
            id: step.id,
            label: step.label,
            elapsedMs: typeof step.elapsedMs === "number" ? step.elapsedMs : undefined,
          });
        }
      }
      if (parsed?.event === "result" || parsed?.event === "error") {
        finalPayload = parsed.data as LLMResponsePayload;
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  return finalPayload || { error: "Respons stream kosong" };
}

function ProcessTimeline({ steps, active }: { steps: ProcessStep[]; active: boolean }) {
  return (
    <div className="relative space-y-2.5 py-1">
      {steps.map((step, index) => {
        const isCurrent = active && index === steps.length - 1;
        return (
          <div key={`${step.id}-${index}`} className="relative flex items-start gap-2.5 text-xs">
            {index < steps.length - 1 && <span className="absolute left-[4px] top-3.5 h-[calc(100%+0.65rem)] w-px" style={{ backgroundColor: "var(--border)" }} />}
            <span className={`relative z-10 mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full border ${isCurrent ? "animate-pulse" : ""}`} style={{ backgroundColor: isCurrent ? "var(--bg-card)" : "var(--accent)", borderColor: "var(--accent)" }} />
            <span style={{ color: isCurrent ? "var(--text-primary)" : "var(--text-secondary)" }}>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function createSessionId() {
  if (typeof window === "undefined") return "";
  const storageKey = "llm_session_id";
  let sessionId = localStorage.getItem(storageKey);
  if (!sessionId) {
    sessionId = `llm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(storageKey, sessionId);
  }
  return sessionId;
}

function initialMessages(): ChatMessage[] {
  return [{
    role: "assistant",
    content: "Halo! Saya siap membantu analisis berita daerah Kabupaten Malang.",
  }];
}

function TypingAssistantContent({ text, sources }: { text: string; sources: Source[] }) {
  const [visibleLength, setVisibleLength] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let frameId = 0;
    let currentLength = 0;
    const chunkSize = Math.max(4, Math.ceil(text.length / 36));

    const typeNextChunk = () => {
      currentLength = Math.min(text.length, currentLength + chunkSize);
      setVisibleLength(currentLength);
      if (currentLength < text.length) frameId = requestAnimationFrame(typeNextChunk);
      else setComplete(true);
    };

    frameId = requestAnimationFrame(() => {
      setVisibleLength(0);
      setComplete(false);
      typeNextChunk();
    });
    return () => cancelAnimationFrame(frameId);
  }, [text]);

  if (complete) return <InlineContent text={text} sources={sources} />;
  return <span className="whitespace-pre-wrap">{text.slice(0, visibleLength)}<span className="animate-pulse">|</span></span>;
}

export default function LLMPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages());
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([]);
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [activeTableIndex, setActiveTableIndex] = useState<number | null>(null);
  const [expandedProcessIndex, setExpandedProcessIndex] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef("");

  useEffect(() => {
    sessionId.current = createSessionId();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, processSteps]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    const assistantMessageIndex = messages.length + 1;
    const activeSessionId = sessionId.current || createSessionId();
    sessionId.current = activeSessionId;
    let streamedSteps: ProcessStep[] = [];
    setInput("");
    setMessages((previous) => [...previous, { role: "user", content: userMessage }]);
    setProcessSteps([]);
    setExpandedProcessIndex(null);
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
        data = await readLLMStream(response, (step) => {
          streamedSteps = [...streamedSteps, step];
          setProcessSteps((previous) => [...previous, step]);
        });
      } catch {
        const fallback = await fetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-session-id": activeSessionId },
          body: JSON.stringify(payload),
        });
        data = await fallback.json() as LLMResponsePayload;
      }

      const completedSteps = data.processSteps?.length ? data.processSteps : streamedSteps;

      if (data.error) {
        setMessages((previous) => [...previous, { role: "assistant", content: data.error || "Maaf, terjadi kendala saat memproses jawaban.", processSteps: completedSteps }]);
      } else {
        if (data.tablePanel?.rows.length) setActiveTableIndex(assistantMessageIndex);
        setMessages((previous) => [...previous, {
          role: "assistant",
          content: data.response || "Maaf, respons kosong.",
          sources: data.sources || [],
          tableData: data.tablePanel,
          processSteps: completedSteps,
        }]);
      }
    } catch {
      setMessages((previous) => [...previous, { role: "assistant", content: "Gagal terhubung ke server." }]);
    } finally {
      setIsLoading(false);
      setProcessSteps([]);
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
                {message.role === "assistant"
                  ? <TypingAssistantContent text={message.content} sources={message.sources || []} />
                  : <InlineContent text={message.content} sources={message.sources || []} />}
                {message.role === "assistant" && message.processSteps && message.processSteps.length > 0 && (
                  <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                    <button onClick={() => setExpandedProcessIndex(expandedProcessIndex === index ? null : index)} className="text-[11px] font-medium transition-opacity hover:opacity-75" style={{ color: "var(--accent)" }} aria-expanded={expandedProcessIndex === index}>
                      {expandedProcessIndex === index ? "Sembunyikan proses" : `Lihat proses (${message.processSteps.length} langkah)`}
                    </button>
                    {expandedProcessIndex === index && <div className="mt-2"><ProcessTimeline steps={message.processSteps} active={false} /></div>}
                  </div>
                )}
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
            <div className="min-w-[220px] rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
              {processSteps.length > 0
                ? <ProcessTimeline steps={processSteps} active />
                : <div className="flex items-center gap-2"><Loader2 size={15} className="animate-spin" style={{ color: "var(--accent)" }} /><span>Memulai pemrosesan pertanyaan...</span></div>}
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
        <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{MEMORY_NOTICE}</p>
      </div>
    </div>
  );

  return (
    <div className="relative flex h-[calc(100vh-9rem)] w-full min-w-0 flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>AI Assistant Chatbot</h2>
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
    </div>
  );
}
