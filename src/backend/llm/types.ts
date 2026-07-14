export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type LLMIntent = 'chat' | 'rag' | 'sql';

export type LLMProcessStepId =
  | 'understand'
  | 'classify_request'
  | 'parse_query'
  | 'search_documents'
  | 'match_documents'
  | 'fallback_search'
  | 'select_documents'
  | 'analyze_data'
  | 'validate_query'
  | 'query_database'
  | 'validate_data'
  | 'combine_context'
  | 'compose_answer'
  | 'format_answer';

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
