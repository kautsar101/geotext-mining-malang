export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ProviderId = 'groq' | 'gemini' | 'deepseek' | 'openai' | 'claude';

export type LLMIntent = 'chat' | 'rag' | 'sql';

export type Source = {
  id: number;
  title?: string;
  snippet?: string;
  source?: string;
  date?: string;
  kecamatan?: string;
  category?: string;
  sentiment?: string;
  url?: string;
  similarity?: number;
};

