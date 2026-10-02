import { createClerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { logger } from "../lib/logger";

type HostUser = {
  emailAddresses: Array<{
    emailAddress: string;
    verification?: { status: string } | null;
  }>;
};

type RequireHostOptions = {
  getAllowedEmails: () => string | undefined;
  getUserById: (userId: string) => Promise<HostUser>;
};

export function createRequireHostMiddleware({
  getAllowedEmails,
  getUserById,
}: RequireHostOptions): RequestHandler {
  return async (req, res, next): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in is required." });
      return;
    }

    const allowedEmails = new Set(
      (getAllowedEmails() ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
    if (allowedEmails.size === 0) {
      logger.error("Host access is not configured.");
      res.status(503).json({ error: "Host access is not configured." });
      return;
    }

    try {
      const user = await getUserById(userId);
      const isAllowedHost = user.emailAddresses.some(
        (email) =>
          email.verification?.status === "verified" &&
          allowedEmails.has(email.emailAddress.trim().toLowerCase()),
      );

      if (!isAllowedHost) {
        res.status(403).json({ error: "Host access is required." });
        return;
      }

      next();
    } catch (error) {
      logger.error({ err: error }, "Could not verify host access with Clerk.");
      res.status(503).json({ error: "Host access could not be verified." });
    }
  };
}

let clerkClient: ReturnType<typeof createClerkClient> | undefined;

async function getClerkUserById(userId: string): Promise<HostUser> {
  const secretKey = process.env.GOFL_CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("GOFL_CLERK_SECRET_KEY is not configured.");
  }

  clerkClient ??= createClerkClient({ secretKey });
  return clerkClient.users.getUser(userId);
}

export const requireHost = createRequireHostMiddleware({
  getAllowedEmails: () => process.env.GOFL_HOST_EMAILS,
  getUserById: getClerkUserById,
});