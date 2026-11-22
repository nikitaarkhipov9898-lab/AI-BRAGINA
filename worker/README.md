# AI-БРАГИНА — Cloudflare Worker

## Текущий Worker

- Cloudflare Worker name: `chef-api`
- Public endpoint: `https://chef-api.bosstayson24.workers.dev`
- Frontend origin: `https://nikitaarkhipov9898-lab.github.io`
- Runtime secrets (must remain in Cloudflare, never commit them):
  - `GROQ_API_KEY`
  - `OWNER_SETUP_CODE`
- D1 binding: `DB`

## Deployment safety

The repository's production branch is `main`. The development work for this setup is being prepared on `admin-panel`.

When connecting Cloudflare Workers Builds, keep `main` as the production branch and enable Preview builds for other branches. Do not select `admin-panel` as the production branch: pushes to that branch must create previews, not replace the live Worker.

## Required Worker source

The current deployed Worker source must be copied into this directory as `index.js) before enabling automatic deployment. The complete deployed source was not available in the connected GitHub repository during setup, so no replacement implementation is fabricated here.

Preserve the existing routes and data contract:
- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /` (Groq proxy)

Password hashing must remain at PBKDF2 100000 iterations (Cloudflare rejected 120000). Keep the existing D1 schema and authentication/session behavior intact.

## Before first deployment

1. Add the exact current Worker source as `worker/index.js`.
2. Add `worker/wrangler.toml` with Worker name `chef-api`, entry point `index.js`, and the existing D1 database binding ID.
3. Confirm the existing D1 database is bound as `DB`.
4. Confirm `GROQ_API_KEY` and `OWNER_SETUP_CODE` exist as encrypted Worker secrets in Cloudflare.
5. Connect Workers Builds to this repository with root directory `worker`, production branch `main`, and Preview builds enabled.
6. Test a Preview deployment before allowing any production deployment.

Never put secret values, session tokens, password hashes, or private user data in Git.
