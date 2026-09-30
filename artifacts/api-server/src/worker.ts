import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import { configureDatabase } from "@workspace/db";
import { createApp } from "./app";
import { proxyClerkFrontendApi } from "./middlewares/cloudflareClerkProxy";
import { CLERK_PROXY_PATH } from "./middlewares/clerkProxyShared";

const app = createApp({
  getClerkKeys: () => ({
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
  }),
});

app.listen(8787);
const handleExpress = httpServerHandler({ port: 8787 });

export default {
  async fetch(
    request: Request,
    bindings: CloudflareEnvironment,
    context: CloudflareExecutionContext,
  ): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (
      pathname === CLERK_PROXY_PATH ||
      pathname.startsWith(`${CLERK_PROXY_PATH}/`)
    ) {
      return proxyClerkFrontendApi(request, bindings.CLERK_SECRET_KEY);
    }

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      configureDatabase(bindings.HYPERDRIVE.connectionString, {
        maxConnections: 1,
      });
      return handleExpress.fetch(request, bindings, context);
    }

    return bindings.ASSETS.fetch(request);
  },
};