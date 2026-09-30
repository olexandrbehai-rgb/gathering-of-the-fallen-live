# Cloudflare setup

This project can be deployed as a single Cloudflare Worker with static assets. The Worker runs the Express API, serves the Vite app from the asset binding, proxies Clerk frontend API requests with Fetch, and connects to PostgreSQL through Hyperdrive.

This guide prepares the deployment only. It does not deploy the app, create Cloudflare resources, change the database, or transfer data.

## 1. Create a Hyperdrive configuration

Create a Hyperdrive configuration that points to the PostgreSQL database you intend to use. You can do this in the Cloudflare dashboard or with Wrangler. Do not put the database connection string in this repository.

Replace `replace-with-hyperdrive-id` in `artifacts/api-server/wrangler.jsonc` with the Hyperdrive configuration ID. The ID is a resource identifier, not a database password.

For local Wrangler development, set the connection string using the documented environment variable instead of adding it to the config file:

```sh
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE='postgresql://...'
```

This variable is a credential. Keep it in a local shell environment or secret manager and never commit it. `wrangler dev --remote` uses the configured Hyperdrive resource instead of this local connection string.

The database must already have the schema expected by `lib/db/src/schema`. This setup does not migrate or copy data.

## 2. Configure Clerk

The Worker needs `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` at runtime. Set them as Worker secrets in Cloudflare or with Wrangler:

```sh
pnpm dlx wrangler@4.144.0 secret put CLERK_PUBLISHABLE_KEY --config artifacts/api-server/wrangler.jsonc
pnpm dlx wrangler@4.144.0 secret put CLERK_SECRET_KEY --config artifacts/api-server/wrangler.jsonc
```

The Vite build also needs `VITE_CLERK_PUBLISHABLE_KEY`. This is a public browser key, but set it as a protected build variable in the CI or Cloudflare build environment. `VITE_CLERK_PROXY_URL` defaults to `/api/__clerk`.

Add the Cloudflare hostname to the Clerk instance's allowed origins and redirect URLs. Confirm that the Clerk instance and keys you use are permitted for that hostname; Replit-managed Clerk settings may be tied to the Replit project.

## 3. Build and test locally

```sh
VITE_CLERK_PUBLISHABLE_KEY=pk_test_... pnpm run cloudflare:build
pnpm dlx wrangler@4.144.0 dev --config artifacts/api-server/wrangler.jsonc
```

To exercise database-backed routes locally, also provide `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`. Local Wrangler development connects directly to that PostgreSQL endpoint; Hyperdrive caching is only active when the Worker runs on Cloudflare.

## 4. Deploy manually

After configuring the Hyperdrive ID and Worker secrets:

```sh
VITE_CLERK_PUBLISHABLE_KEY=pk_live_... pnpm run cloudflare:deploy
```

Wrangler must be authenticated to the intended Cloudflare account. The Worker is configured to serve the static site and `/api/*` from the same origin.

## GitHub Actions

`.github/workflows/deploy-cloudflare.yml` runs only when manually dispatched. Before using it:

1. Set the GitHub repository variable `VITE_CLERK_PUBLISHABLE_KEY`.
2. Add the GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Configure the Hyperdrive ID in `wrangler.jsonc` and the Clerk Worker secrets in Cloudflare.
4. Run the workflow from the repository's Actions tab when you explicitly want to deploy.