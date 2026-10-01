# Gathering of the Fallen LIVE

A multilingual live-listening room for independent artists. Artists can submit tracks to upcoming sessions, see the queue position, and hosts can review and run the live queue.

The project is a pnpm monorepo:

- `artifacts/gathering-fallen-live` — React and Vite web app
- `artifacts/api-server` — Express API, with both a Node.js entry point and a Cloudflare Workers entry point
- `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, `lib/db` — shared contracts, generated clients, and PostgreSQL schema
- `attached_assets` — artwork used by the web app

The app supports English, Canadian French, and Ukrainian. Authentication uses Clerk and application data is stored in PostgreSQL.

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer
- PostgreSQL for the API

Install the workspace dependencies with:

```sh
pnpm install
```

## Run locally

Set `DATABASE_URL` and Clerk values in your local environment, then start the API and web app in separate terminals:

```sh
pnpm --filter @workspace/api-server run dev
```

```sh
PORT=20541 BASE_PATH=/ pnpm --filter @workspace/gathering-fallen-live run dev
```

The database schema is managed with Drizzle in `lib/db`. Database setup or schema changes are not run automatically by the application.

## Build and checks

```sh
pnpm run typecheck
pnpm run build
```

## Cloudflare

Cloudflare configuration lives in `artifacts/api-server/wrangler.jsonc`. It packages the Vite static assets and Express API into one Worker, routes `/api/*` through the Worker, uses Hyperdrive for PostgreSQL, and keeps Clerk's frontend API proxy on the same origin.

Read [CLOUDFLARE.md](./CLOUDFLARE.md) before configuring a Cloudflare account. You must provide your own Hyperdrive binding and Clerk environment values. This repository does not include credentials or move database data.

For a local Cloudflare build, provide the publishable key at build time:

```sh
VITE_CLERK_PUBLISHABLE_KEY=pk_test_... pnpm run cloudflare:build
```

The `cloudflare:dev` and `cloudflare:deploy` scripts use Wrangler 4.144.0 through `pnpm dlx`. The deploy script is provided for you to run when ready; no Cloudflare deployment is performed as part of preparing this repository.

## Render

The root [`render.yaml`](./render.yaml) defines one free Node web service. It builds the React site and Express API together, serves both from one origin, and uses `/api/healthz` for health checks. The free service can spin down while idle, so its first request after inactivity may be slow.

Import the repository as a Render Blueprint to create or sync the service. If it is already linked to Render with automatic deploys enabled, a push to `main` will trigger the configured build. During Blueprint setup, provide `DATABASE_URL` for the existing PostgreSQL database and the three Clerk variables (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `VITE_CLERK_PUBLISHABLE_KEY`) in Render's environment settings. The Blueprint does not provision, migrate, or alter the database, and it does not contain secret values.

The [`check-render-deployment.yml`](./.github/workflows/check-render-deployment.yml) workflow checks the homepage and `/api/healthz` after pushes to `main`, retrying while Render deploys. Set the non-secret GitHub Actions repository variable `RENDER_SERVICE_URL` to the service's public HTTPS base URL (without a trailing slash) under **Settings → Secrets and variables → Actions → Variables**. The workflow does not need database or Clerk secrets.

To see which commit is running on Render, open `https://<your-render-service>/api/healthz`. The JSON `revision` field is Render's deployed commit SHA from its built-in `RENDER_GIT_COMMIT` metadata; it is `null` when that metadata is unavailable. To compare it with the latest GitHub Release, find that release's tag on this repository's GitHub Releases page, then run `git fetch --tags` and `git rev-parse v1.2.3^{commit}` in a clone of this repository, replacing `v1.2.3` with the release tag. If the resulting full SHA matches `revision`, Render is running the commit tagged by that release.

## GitHub Releases

Use stable version tags in `vMAJOR.MINOR.PATCH` format, such as `v1.2.3`. To release a commit, create and push an annotated tag:

```sh
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

The [`create-release.yml`](./.github/workflows/create-release.yml) workflow checks that the tag follows this format, installs the locked dependencies, and runs `pnpm run typecheck` and `pnpm run build`. It publishes a GitHub Release with automatically generated notes only after both checks pass. The workflow needs the repository's Actions token to have `contents: write` permission.

## GitHub and deployment

The public repository contains source code and required app assets. Conversation uploads and build prompts are intentionally excluded. Keep `.env`, `.dev.vars`, database URLs, Clerk secret keys, and Cloudflare API tokens out of Git.

The manual Cloudflare deployment workflow is included as [`cloudflare-deploy.workflow.yml`](./cloudflare-deploy.workflow.yml). Once the repository has GitHub Actions workflow-write permission, place it at `.github/workflows/deploy-cloudflare.yml` and configure its GitHub variable and Cloudflare secrets. Pushing a commit does not automatically deploy the app. Until then, the `cloudflare:deploy` script is available for manual use from an authenticated environment.
