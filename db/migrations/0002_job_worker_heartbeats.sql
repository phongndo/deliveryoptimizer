CREATE TABLE IF NOT EXISTS optimization_job_workers (
  worker_id TEXT PRIMARY KEY,
  healthy BOOLEAN NOT NULL,
  detail TEXT NOT NULL,
  heartbeat_at_epoch BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS optimization_job_workers_heartbeat_idx
  ON optimization_job_workers (heartbeat_at_epoch);
