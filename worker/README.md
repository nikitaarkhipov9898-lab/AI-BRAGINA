# AI-БРАГИНА — Cloudflare Worker

Worker source and Wrangler configuration for the existing API.

## Existing service

- Worker name: `chef-api`
- Endpoint: `https://chef-api.bosstayson24.workers.dev`
- Allowed frontend origin: `https://nikitaarkhipov9898-lab.github.io`
- D1 binding name: `DB`
- Encrypted runtime secrets (keep in Cloudflare only): `GROQ_API_KEY`, `OWNER_SETUP_CODE`

## Source compatibility

`index.js` is based on the current Worker source supplied by the project owner. It preserves the existing routes:
- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /` (authenticated Groq proxy)

The password PBKDF2 iteration count is set to **100000**, matching the working Cloudflare deployment. The supplied pasted source contained 120000, but Cloudflare previously rejected that value in this project. Do not raise it without testing compatibility and planning a password-hash migration.

## Git and deployment safety

Development changes are being prepared on branch `admin-panel`. A harmless documentation commit on this branch can be used to trigger and verify a Cloudflare Preview build. Keep `main` as the Cloudflare production branch. Enable Preview builds for non-production branches so `admin-panel` creates a Preview rather than changing the live Worker.

When connecting Workers Builds, use:
- Repository: `nikitaarkhipov9898-lab/AI-BRAGINA`
- Root directory: `worker`
- Production branch: `main`
- Deploy command: `npx wrangler deploy`
- Preview builds: enabled

## Cloudflare configuration still to verify

Before connecting or deploying, confirm the existing Worker has:
1. D1 database binding named `DB` pointing to the current production database.
2. Encrypted secrets `GROQ_API_KEY` and `OWNER_SETUP_CODE`.
3. The same production Worker name, `chef-api`.

The Wrangler file intentionally does not contain a fabricated D1 database ID. The existing D1 binding must be represented in the final Wrangler configuration using the real database ID, which must be read from the Cloudflare account. Do not deploy until this is verified.

Never commit secret values, session tokens, password hashes, or private user data.

 
## React frontend (new preview)

The new interface is being developed separately in `frontend/` with React, TypeScript and Vite. It builds into `assets/next/`, while the existing application remains available at `/app`.

- Install/build: `npm run build:frontend` from this `worker/` directory.
- Preview path after the build is deployed: `/app-next`.
- Cloudflare Workers Builds must run `npm run build:frontend && npx wrangler deploy` so the React bundle exists before Wrangler packages static assets.
- Do not replace the existing `/app` until authentication, data, navigation and core workflows have been migrated and verified.
