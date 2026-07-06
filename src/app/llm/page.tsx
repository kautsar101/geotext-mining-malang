"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Key, Bot, ExternalLink } from "lucide-react";
import InlineContent from "@/components/InlineContent";

const KEY_LINKS: Record<string, string> = {
  groq: "https://console.groq.com/keys",
  gemini: "https://aistudio.google.com/apikey",
  deepseek: "https://platform.deepseek.com/api_keys",
  openai: "https://platform.openai.com/api-keys",
  claude: "https://console.anthropic.com/",
};

const PROVIDERS = [
  { id: "groq", label: "Groq (Mixtral 8x7B)", keyPrefix: "gsk_", desc: "Gratis — daftar di console.groq.com" },
  { id: "gemini", label: "Gemini 2.0 Flash", keyPrefix: "AIza", desc: "Butuh API Key" },
  { id: "deepseek", label: "DeepSeek V4 Flash", keyPrefix: "sk-", desc: "Butuh API Key" },
  { id: "openai", label: "OpenAI GPT-4o Mini", keyPrefix: "sk-", desc: "Butuh API Key" },
  { id: "claude", label: "Claude 3 Haiku", keyPrefix: "sk-ant-", desc: "Butuh API Key" },
];

const STORAGE_PREFIX = "llm_provider_";

export default function LLMPage() {
  const [messages, setMessages] = useState<{ role: string; content: string; sources?: any[] }[]>([
    { role: "assistant", content: "Halo! Pilih provider LLM, masukkan API Key, lalu tanyakan topik berita yang Anda cari." },
  ]);
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState("groq");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + provider);
    if (saved) setApiKey(saved);
    else setApiKey("");
  }, [provider]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const saveKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem(STORAGE_PREFIX + provider, key);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    if (!apiKey.trim()) {
      setMessages(prev => [...prev, { role: "assistant", content: `Silakan masukkan API Key untuk ${PROVIDERS.find(p => p.id === provider)?.label}.` }]);
      return;
    }

    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const history = messages.slice(-5).map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg, apiKey, provider, messages: history }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.response, sources: data.sources || [] }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Gagal terhubung ke server." }]);
    }
    setIsLoading(false);
  };

  const currentProvider = PROVIDERS.find(p => p.id === provider);

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      <div className="mb-4">
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>RAG Chat</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Multi-provider LLM + database berita daerah</p>
      </div>

      {/* Provider + API Key */}
      <div className="mb-4 p-3 rounded-xl space-y-3" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <Bot size={16} style={{ color: "var(--text-muted)" }} />
          <select value={provider} onChange={e => setProvider(e.target.value)}
            className="flex-1 text-sm font-medium bg-transparent border-none outline-none cursor-pointer"
            style={{ color: "var(--text-primary)" }}>
            {PROVIDERS.map(p => (
              <option key={p.id} value={p.id}>
                {p.label} 🔑
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 px-1">
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {currentProvider?.desc}
          </span>
          <a href={KEY_LINKS[provider]} target="_blank" rel="noopener noreferrer"
            className="text-[10px] opacity-50 hover:opacity-100 transition-opacity flex items-center gap-0.5"
            style={{ color: "var(--accent)" }}>
            Dapatkan API Key <ExternalLink size={10} />
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Key size={16} style={{ color: "var(--text-muted)" }} />
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={e => saveKey(e.target.value)}
            placeholder={currentProvider?.keyPrefix + "xxxxxxxxxxxx"}
            className="flex-1 text-xs font-mono bg-transparent border-none outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          <button onClick={() => setShowKey(!showKey)} className="text-xs px-2 py-1 rounded flex-shrink-0"
            style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-primary)" }}>
            {showKey ? "Sembunyi" : "Lihat"}
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-xl overflow-hidden flex flex-col shadow-sm border"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
              <div className="max-w-[80%] space-y-2">
                <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "text-white" : ""}`}
                  style={m.role === "user" ? { backgroundColor: "var(--accent)" } : { backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
                  <InlineContent text={m.content} sources={m.sources || []} />
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start animate-fade-in">
              <div className="rounded-xl px-4 py-3 flex gap-1.5" style={{ backgroundColor: "var(--bg-primary)" }}>
                {[0, 0.2, 0.4].map((d, i) => (
                  <div key={i} className="w-2 h-2 rounded-full animate-pulse-dot"
                    style={{ backgroundColor: "var(--accent)", animationDelay: `${d}s` }} />
                ))}
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
        </div>
      </div>
    </div>
  );
}