-- Chat logs table for LLM debugging
CREATE TABLE IF NOT EXISTS chat_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  session_id TEXT NOT NULL,
  query_raw TEXT NOT NULL,
  route TEXT,
  sql_generated TEXT,
  sql_result JSONB,
  sources JSONB,
  embedding_debug JSONB,
  status TEXT NOT NULL DEFAULT 'success',
  current_stage TEXT,
  last_completed_stage TEXT,
  failed_stage TEXT,
  process_steps JSONB NOT NULL DEFAULT '[]'::JSONB,
  query_plan JSONB,
  routing_reason TEXT,
  provider TEXT,
  model TEXT,
  provider_debug JSONB,
  response TEXT,
  latency_ms INTEGER,
  error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster queries by session
CREATE INDEX IF NOT EXISTS idx_chat_logs_session ON chat_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_status_created ON chat_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_failed_stage ON chat_logs(failed_stage) WHERE failed_stage IS NOT NULL;

-- Optional compact memory per chat session
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id TEXT PRIMARY KEY,
  summary TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
