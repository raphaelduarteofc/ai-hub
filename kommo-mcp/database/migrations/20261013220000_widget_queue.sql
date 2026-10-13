CREATE TABLE elear_private.widget_events (
  event_id text PRIMARY KEY,
  conversation_id text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE elear_private.agent_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL REFERENCES elear_private.widget_events(event_id),
  conversation_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX agent_jobs_event_id_unique ON elear_private.agent_jobs(event_id);
ALTER TABLE elear_private.widget_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE elear_private.agent_jobs ENABLE ROW LEVEL SECURITY;
