CREATE SCHEMA elear_private;
REVOKE ALL ON SCHEMA elear_private FROM PUBLIC;
CREATE TABLE elear_private.oauth_states (state_hash text PRIMARY KEY, session_hash text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE elear_private.oauth_tokens (account_origin text PRIMARY KEY, account_id bigint NOT NULL, encrypted_tokens text NOT NULL, expires_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE elear_private.oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE elear_private.oauth_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA elear_private FROM PUBLIC;
