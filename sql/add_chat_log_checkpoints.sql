-- Durable LLM stage diagnostics for existing chat_logs installations.
ALTER TABLE chat_logs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS current_stage TEXT,
  ADD COLUMN IF NOT EXISTS last_completed_stage TEXT,
  ADD COLUMN IF NOT EXISTS failed_stage TEXT,
  ADD COLUMN IF NOT EXISTS process_steps JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS query_plan JSONB,
  ADD COLUMN IF NOT EXISTS routing_reason TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS provider_debug JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_chat_logs_status_created
  ON chat_logs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_logs_failed_stage
  ON chat_logs(failed_stage)
  WHERE failed_stage IS NOT NULL;
