# Codex continuation — ELEAR Sales Brain
Updated 2026-10-13. Technical handoff only; no secrets or internal business documents belong in this public repository.

## Start here
Repository: raphaelduarteofc/ai-hub.
Working branch: codex/elear-kommo-oauth-v03.
Application directory: kommo-mcp.
Draft PR: https://github.com/raphaelduarteofc/ai-hub/pull/1.
Do not use the default branch as though it contains this application.
Preserve unrelated repository files.

## Objective and boundaries
Build an OpenAI Agents SDK sales service connected to Kommo, with deterministic operational tools.
Target outcomes: confirmed technical visit, or verified payment plus registered order.
Current deployed service supports CRM reads only. It does not yet implement the sales agent, channel delivery, Salesbot receiver, queue or worker.
Never infer business prices, promotions, stock, schedules, payment confirmation or technical suitability. Obtain approved private source documents separately.
Keep internal documents and customer records out of this public repository.

## Existing architecture
TypeScript .mts Netlify functions, pg PostgreSQL pool, dedicated Supabase database.
OAuth state is HMAC signed, expires after 10 minutes, browser-session bound and consumed once through atomic database DELETE.
OAuth token pairs are AES-GCM encrypted at rest. Refresh uses a transaction and SELECT FOR UPDATE.
Canonical callback origin and CRM account ID are validated before storing tokens.
Database schema elear_private has oauth_states and oauth_tokens; RLS enabled and public roles denied schema access.
TLS certificate validation remains enabled. src/supabase-ca.mts bundles the public CA downloaded from the official Supabase dashboard. Do not disable rejectUnauthorized to work around errors.
The custom MCP transport still needs protocol compatibility and input/Origin hardening; do not claim a complete MCP implementation.

## Verified evidence
13 local tests passed; npm run typecheck passed.
Netlify test project elear-sales-brain-test is Git-linked to this working branch, base kommo-mcp, publish public, functions netlify/functions.
Five functions deployed: health, mcp, oauth-start, oauth-callback, readiness.
Authenticated GET /.netlify/functions/readiness returned:
databaseConnected=true, schemaReady=true,
missing=[KOMMO_ACCOUNT_ID,KOMMO_CLIENT_ID,KOMMO_CLIENT_SECRET], ready=false.
This was before the latest credential UI changes. Re-check current configuration.
Unauthenticated readiness returned 401.
Health returned 200, read-only.
Hosted multi-instance OAuth refresh concurrency has NOT been proved. Local database test demonstrates one-use state and sequential refresh persistence, not distributed locking.

## Current configuration and immediate blocker
Required server environment keys:
DATABASE_URL, MCP_AUTH_TOKEN, OAUTH_STATE_SECRET,
KOMMO_BASE_URL, KOMMO_REDIRECT_URI, KOMMO_ACCOUNT_ID,
KOMMO_CLIENT_ID, KOMMO_CLIENT_SECRET.
DATABASE_CA_CERT is an optional override.
Never print credential values, inspect sign-in secrets or commit .env files.
Production here means the published context of the isolated test project, not live customer operation.
Do not supply these secrets to deploy previews or agent runner contexts.
KOMMO_CLIENT_ID has been saved through the UI for the new isolated test integration.
KOMMO_CLIENT_SECRET was saved by the user, but last verified metadata still said "not marked as secret". Verify and correct its secret flag first.
KOMMO_ACCOUNT_ID remains unknown/unconfigured. Get the actual CRM account ID from an authorized source; do not confuse it with user ID, pipeline ID, or integration UUID.
The existing ELEAR Home MCP integration points to the older kommo-mcp service. Preserve it.
A separate ELEAR Sales Brain — Teste integration was created with the test callback.
Do not rotate existing credentials or move callbacks without evaluating existing authorizations.

## Connector and browser limitations
Netlify manage-env-vars returned success without a corresponding variable appearing in the UI. Do not trust mutation acknowledgements alone.
Its upsert cannot change an existing variable's secret flag or scopes. Do not delete a secret to change flags unless the value can be restored securely and the action is authorized.
Use authenticated official API/CLI when configured; do not scrape tokens from CLI config or browser storage.
Browser credential protections repeatedly blocked observations and manual handoff did not always surface to the user. Prepared forms in one browser session do not automatically appear in another.
A move to Codex does not transfer connector sessions, credentials or this entire conversation automatically.

## Next work, in order
1. Read repository instructions, preserve user changes, verify branch/head and available access.
2. Check secret metadata only; correct KOMMO_CLIENT_SECRET secret flag and Production-only context. Verify current credential is the intended current key.
3. Obtain correct KOMMO_ACCOUNT_ID. Redeploy after environment changes; deployed functions freeze env values.
4. Verify readiness, then run OAuth through /oauth/start and validate the account before token storage. Do not reuse an expired or pasted authorization code.
5. Test account/users/pipelines reads, expiry and refresh. Exercise actual hosted concurrency, rollback, revocation and account mismatch.
6. Harden MCP transport; add runtime validation and sanitized error reporting.
7. Implement Salesbot widget_request receiver using verified official JWT contract, fast acknowledgment, durable deduplication and transactional job queue.
8. Add agent worker, bounded retries, rate limits, conversation ordering, human takeover and delivery status handling.
9. Add deterministic tool integrations for approved operational sources. Keep price/stock/schedule/payment simulations explicitly separate from real execution.
10. Run a restricted authorized test contact end-to-end, then channel-specific tests. No customer rollout or paid upgrade without readiness and budget authorization.

## Completion criteria
Real authenticated CRM read; token refresh and concurrency validated;
signed inbound test event durably accepted once; one authorized response delivered once;
human takeover prevents further agent responses; logs contain no secrets;
failure/retry paths tested; rollback documented; actual costs measured.
Do not equate HTTP accepted with delivered, health with readiness, or deployment with a working sales agent.

## Local checks
From kommo-mcp:
npm ci --ignore-scripts
npm run typecheck
npm test

## Working style
Continue authorized reversible development autonomously. Ask only for essential missing access, a business decision, a new cost, or a required security confirmation.
Report verified results and blockers plainly. Maintain this handoff when state changes.
