interface CloudflareEnvironment {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
  HYPERDRIVE: {
    connectionString: string;
  };
}

interface CloudflareExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

declare module "cloudflare:workers" {
  export const env: CloudflareEnvironment;
}

declare module "cloudflare:node" {
  export function httpServerHandler(options: {
    port: number;
  }): {
    fetch(
      request: Request,
      env: CloudflareEnvironment,
      context: CloudflareExecutionContext,
    ): Promise<Response>;
  };
}