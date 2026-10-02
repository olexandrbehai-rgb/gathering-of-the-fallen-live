import assert from "node:assert/strict";
import { once } from "node:events";
import express, { type Request, type RequestHandler } from "express";
import { test } from "node:test";
import { createRequireHostMiddleware } from "./requireHost";

function createTestApp(hostAuthorization: RequestHandler) {
  const app = express();
  app.use((req: Request, _res, next) => {
    const userId = req.get("x-test-user") || null;
    const authHandler = Object.assign(
      () => ({
        userId,
        tokenType: "session_token",
        sessionId: userId ? "sess_fixture" : null,
        sessionClaims: userId ? { sub: userId } : null,
        sessionStatus: userId ? "active" : null,
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    Object.defineProperty(req, "auth", { configurable: true, value: authHandler });
    next();
  });
  app.get("/host-only", hostAuthorization, (_req, res) => {
    res.sendStatus(204);
  });
  return app;
}

async function withApi(
  hostAuthorization: RequestHandler,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createTestApp(hostAuthorization).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The test API server did not bind to a TCP port.");
  }

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("host access requires a verified email on the allowlist", async () => {
  const lookedUp: string[] = [];
  const hostAuthorization = createRequireHostMiddleware({
    getAllowedEmails: () => " HOST@example.test ",
    getUserById: async (userId) => {
      lookedUp.push(userId);
      if (userId === "allowed") {
        return {
          emailAddresses: [
            {
              emailAddress: "host@example.test",
              verification: { status: "verified" },
            },
          ],
        };
      }
      if (userId === "unverified") {
        return {
          emailAddresses: [
            {
              emailAddress: "host@example.test",
              verification: { status: "unverified" },
            },
          ],
        };
      }
      return {
        emailAddresses: [
          {
            emailAddress: "other@example.test",
            verification: { status: "verified" },
          },
        ],
      };
    },
  });

  await withApi(hostAuthorization, async (baseUrl) => {
    const anonymous = await fetch(`${baseUrl}/host-only`);
    assert.equal(anonymous.status, 401);

    const unlisted = await fetch(`${baseUrl}/host-only`, {
      headers: { "x-test-user": "unlisted" },
    });
    assert.equal(unlisted.status, 403);

    const unverified = await fetch(`${baseUrl}/host-only`, {
      headers: { "x-test-user": "unverified" },
    });
    assert.equal(unverified.status, 403);

    const allowed = await fetch(`${baseUrl}/host-only`, {
      headers: { "x-test-user": "allowed" },
    });
    assert.equal(allowed.status, 204);
  });

  assert.deepEqual(lookedUp, ["unlisted", "unverified", "allowed"]);
});

test("host access fails closed when configuration or Clerk verification is unavailable", async () => {
  const notConfigured = createRequireHostMiddleware({
    getAllowedEmails: () => "",
    getUserById: async () => {
      throw new Error("A lookup should not run without an allowlist.");
    },
  });
  const clerkUnavailable = createRequireHostMiddleware({
    getAllowedEmails: () => "host@example.test",
    getUserById: async () => {
      throw new Error("Clerk is unavailable.");
    },
  });

  await withApi(notConfigured, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/host-only`, {
      headers: { "x-test-user": "allowed" },
    });
    assert.equal(response.status, 503);
  });

  await withApi(clerkUnavailable, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/host-only`, {
      headers: { "x-test-user": "allowed" },
    });
    assert.equal(response.status, 503);
  });
});