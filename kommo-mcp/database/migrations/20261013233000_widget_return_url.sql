ALTER TABLE elear_private.widget_events ADD COLUMN IF NOT EXISTS return_url text NOT NULL DEFAULT '';
ALTER TABLE elear_private.agent_jobs ADD COLUMN IF NOT EXISTS return_url text NOT NULL DEFAULT '';
