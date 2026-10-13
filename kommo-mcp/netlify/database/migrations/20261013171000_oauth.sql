CREATE TABLE elear_oauth_states (state_hash text PRIMARY KEY, session_hash text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE elear_oauth_tokens (account_origin text PRIMARY KEY, account_id bigint NOT NULL, encrypted_tokens text NOT NULL, expires_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
