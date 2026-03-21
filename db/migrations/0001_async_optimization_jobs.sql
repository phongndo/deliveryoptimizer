CREATE TABLE IF NOT EXISTS optimization_jobs (
  job_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  request_payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  result_payload JSONB,
  error_code TEXT,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  worker_id TEXT,
  lease_expires_at_epoch BIGINT,
  created_at_epoch BIGINT NOT NULL,
  started_at_epoch BIGINT,
  completed_at_epoch BIGINT,
  expires_at_epoch BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS optimization_jobs_status_created_idx
  ON optimization_jobs (status, created_at_epoch);

CREATE INDEX IF NOT EXISTS optimization_jobs_lease_idx
  ON optimization_jobs (lease_expires_at_epoch);

CREATE INDEX IF NOT EXISTS optimization_jobs_expires_idx
  ON optimization_jobs (expires_at_epoch);
