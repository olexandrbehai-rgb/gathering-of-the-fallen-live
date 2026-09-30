import express, { type Express } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { CLERK_PROXY_PATH, getClerkProxyHost } from "./middlewares/clerkProxyShared";
import type { Request, RequestHandler } from "express";

type ClerkKeys = {
  publishableKey?: string;
  secretKey?: string;
};

export type AppOptions = {
  getClerkKeys: () => ClerkKeys;
  clerkProxyMiddleware?: RequestHandler;
  requestLogger?: RequestHandler;
  logRequests?: boolean;
  staticDir?: string;
};

export function createApp(options: AppOptions): Express {
  const app: Express = express();

  if (options.requestLogger) {
    app.use(options.requestLogger);
  } else if (options.logRequests !== false) {
    app.use((req, res, next) => {
      const startedAt = Date.now();
      res.on("finish", () => {
        console.log(
          JSON.stringify({
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
          }),
        );
      });
      next();
    });
  }

  // Clerk's frontend API proxy must see the raw request body.
  if (options.clerkProxyMiddleware) {
    app.use(CLERK_PROXY_PATH, options.clerkProxyMiddleware);
  }

  app.use(cors({ credentials: true, origin: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(
    clerkMiddleware((_req: Request) => {
      const keys = options.getClerkKeys();
      return {
        publishableKey: publishableKeyFromHost(
          getClerkProxyHost(_req) ?? "",
          keys.publishableKey,
        ),
        secretKey: keys.secretKey,
      };
    }),
  );

  app.use("/api", router);

  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    app.use((req, res, next) => {
      if (
        (req.method !== "GET" && req.method !== "HEAD") ||
        req.path === "/api" ||
        req.path.startsWith("/api/")
      ) {
        next();
        return;
      }

      res.sendFile(`${options.staticDir}/index.html`, (error) => {
        if (error) next(error);
      });
    });
  }

  return app;
}
