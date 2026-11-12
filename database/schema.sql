-- Greenface's private family adventures. The API also runs these safe,
-- additive statements on the first authenticated account request.
CREATE TABLE IF NOT EXISTS greenface_families (
  id UUID PRIMARY KEY,
  code VARCHAR(24) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  state JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Account authentication is limited atomically across serverless instances.
-- Keys are HMACs of IP addresses; raw IP addresses are never stored.
CREATE TABLE IF NOT EXISTS greenface_auth_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
