# Kommo MCP — test integration

Read-only CRM integration on Netlify Functions. This branch is a development draft, not a production release.

## Local validation

Node 22 or newer. Run npm ci --ignore-scripts, npm test, npm run typecheck.

## Server configuration

Set secrets through the hosting provider. Never commit credentials.
Required: KOMMO_BASE_URL, KOMMO_ACCOUNT_ID, KOMMO_CLIENT_ID, KOMMO_CLIENT_SECRET, KOMMO_REDIRECT_URI, MCP_AUTH_TOKEN, OAUTH_STATE_SECRET (at least 32 random characters).

OAuth state expires after ten minutes, is bound to a secure browser cookie and consumed once in PostgreSQL. Tokens are authenticated-encrypted, verified against the expected account, and refreshed under a database row lock. Changing OAUTH_STATE_SECRET requires a token migration or new authorization because it also protects the vault.

## Deployment requirements

This folder is the Netlify base directory. It uses @netlify/database with migrations in netlify/database/migrations. Database availability and billing must be checked before deployment. Do not replace an existing production deploy directly: this version requires a prepared database and new OAuth authorization, and does not migrate an older Blobs store automatically.

MCP tools expose read-only allowlisted resources. Outbound messages, orders, visits and Salesbot are not implemented here. The custom MCP transport still requires client compatibility validation.

## Validation limits

Local tests verify state, encryption, sequential refresh persistence, runtime validation and endpoint routing. The local database does not prove row-lock behavior across instances. Hosted concurrent refresh, revoked credentials, authenticated CRM reads and end-to-end delivery remain release gates. A crash after provider-side refresh but before database commit can require new authorization; do not retry token rotation blindly.
