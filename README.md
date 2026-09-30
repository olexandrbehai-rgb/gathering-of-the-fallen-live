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

## GitHub and deployment

The public repository contains source code and required app assets. Conversation uploads and build prompts are intentionally excluded. Keep `.env`, `.dev.vars`, database URLs, Clerk secret keys, and Cloudflare API tokens out of Git.

The GitHub Actions workflow is manual-only (`workflow_dispatch`). Configure its required GitHub variables and Cloudflare secrets before using it. Pushing a commit does not automatically deploy the app.