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
  response TEXT,
  latency_ms INTEGER,
  error TEXT
);

-- Index for faster queries by session
CREATE INDEX IF NOT EXISTS idx_chat_logs_session ON chat_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs(created_at DESC);