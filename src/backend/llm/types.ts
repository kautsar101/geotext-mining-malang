export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type LLMIntent = 'chat' | 'rag' | 'sql';

export type LLMProcessStepId = 'understand' | 'search_documents' | 'analyze_data' | 'compose_answer';

export type LLMProcessStep = {
  id: LLMProcessStepId;
  label: string;
  elapsedMs: number;
};

export type Source = {
  id: number;
  articleId?: number;
  chunkIndices?: number[];
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
