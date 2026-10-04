import {
  CreateSubmissionBody,
  CreateSubmissionResponse,
  GetAdminAccessResponse,
  GetAdminSessionQueueParams,
  GetAdminSessionQueueResponse,
  GetSessionQueuePreviewParams,
  GetSessionQueuePreviewResponse,
  ListAdminSessionsResponse,
  ListSessionsResponse,
  UpdateSubmissionStatusBody,
  UpdateSubmissionStatusParams,
  UpdateSubmissionStatusResponse,
} from "@workspace/api-zod";
import {
  db,
  sessionsTable,
  submissionsTable,
  type Session,
  type Submission,
} from "@workspace/db";
import { and, asc, count, eq, gt, gte, inArray, max, sql } from "drizzle-orm";
import { Router, type IRouter, type RequestHandler } from "express";
import { logger } from "../lib/logger";
import { requireHost } from "../middlewares/requireHost";
import {
  generateUpcomingSessionInstances,
  kyivWallTimeOnDate,
  legacyTorontoDateAtKyivWallTime,
} from "../lib/session-schedule";

export function createGatheringRouter(
  database: typeof db = db,
  hostAuthorization: RequestHandler = requireHost,
): IRouter {
const router: IRouter = Router();

function safeErrorDetails(
  error: unknown,
  depth = 0,
): Record<string, unknown> {
  if (typeof error !== "object" || error === null) {
    return { message: sanitizeErrorMessage(String(error)) };
  }

  const source = error as Record<string, unknown>;
  const details: Record<string, unknown> = {};
  for (const field of [
    "name",
    "message",
    "code",
    "errno",
    "syscall",
    "hostname",
    "port",
    "severity",
    "schema",
    "table",
    "column",
    "constraint",
    "routine",
  ]) {
    const value = source[field];
    if (typeof value === "string" || typeof value === "number") {
      details[field] =
        field === "message" ? sanitizeErrorMessage(String(value)) : value;
    }
  }

  if (depth < 2 && source.cause !== undefined) {
    details.cause = safeErrorDetails(source.cause, depth + 1);
  }

  return details;
}

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted-postgres-url]")
    .replace(
      /\b(password|passwd|pwd)\s*[:=]\s*[^,\s;]+/gi,
      "$1=[redacted]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]");
}

async function ensureUpcomingSessions(): Promise<void> {
  const now = new Date();
  const localTodayStart = kyivWallTimeOnDate(now, 0);
  const sessions = generateUpcomingSessionInstances(now, 14).map((session) => ({
    ...session,
    capacity: 30,
    isOpen: true,
  }));

  if (sessions.length === 0) return;

  await database.transaction(async (transaction) => {
    // Render may still have a legacy sessions table without the starts_at
    // unique index. Serialize seeders and check existing rows before inserting
    // so the public sessions endpoint does not depend on that index.
    await transaction.execute(sql`select pg_advisory_xact_lock(1193051001, 1)`);

    const existingSessions = await transaction
      .select({ id: sessionsTable.id, startsAt: sessionsTable.startsAt })
      .from(sessionsTable)
      .where(gte(sessionsTable.startsAt, localTodayStart));
    const existingStartsAt = new Set<number>();
    for (const existing of existingSessions) {
      if (existing.startsAt < localTodayStart) continue;

      const alreadyAtKyivSeven =
        kyivWallTimeOnDate(existing.startsAt, 7).getTime() ===
        existing.startsAt.getTime();
      const startsAt = alreadyAtKyivSeven
        ? existing.startsAt
        : legacyTorontoDateAtKyivWallTime(existing.startsAt, 7);
      if (startsAt.getTime() !== existing.startsAt.getTime()) {
        await transaction
          .update(sessionsTable)
          .set({ startsAt })
          .where(eq(sessionsTable.id, existing.id))
          .returning({ id: sessionsTable.id });
      }
      existingStartsAt.add(startsAt.getTime());
    }
    const missingSessions = sessions.filter(
      (session) => !existingStartsAt.has(session.startsAt.getTime()),
    );

    if (missingSessions.length > 0) {
      await transaction
        .insert(sessionsTable)
        .values(missingSessions)
        .onConflictDoNothing();
    }
  });
}

function asIso(value: Date): string {
  return value.toISOString();
}

function sessionSummary(
  session: Session,
  registered: number,
): {
  id: string;
  sessionType: Session["sessionType"];
  startsAt: string;
  capacity: number;
  registered: number;
  available: number;
  isOpen: boolean;
} {
  return {
    id: session.id,
    sessionType: session.sessionType,
    startsAt: asIso(session.startsAt),
    capacity: session.capacity,
    registered,
    available: Math.max(0, session.capacity - registered),
    isOpen: session.isOpen && session.startsAt > new Date(),
  };
}

async function registrationCounts(
  sessions: Session[],
): Promise<Map<string, number>> {
  if (sessions.length === 0) return new Map();
  const grouped = await database
    .select({ sessionId: submissionsTable.sessionId, total: count() })
    .from(submissionsTable)
    .groupBy(submissionsTable.sessionId);
  return new Map(grouped.map((row) => [row.sessionId, Number(row.total)]));
}

function publicSessionType(value: string): value is Session["sessionType"] {
  return (
    value === "artist_spotlight" ||
    value === "genre_showcase" ||
    value === "weekend_takeover"
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

router.get("/sessions", async (_req, res): Promise<void> => {
  try {
    await ensureUpcomingSessions();
    const sessions = await database
      .select()
      .from(sessionsTable)
      .where(gt(sessionsTable.startsAt, new Date()))
      .orderBy(asc(sessionsTable.startsAt))
      .limit(7);
    const counts = await registrationCounts(sessions);

    const response = sessions.map((session) =>
      sessionSummary(session, counts.get(session.id) ?? 0),
    );
    res.json(ListSessionsResponse.parse(response));
  } catch (error) {
    logger.error(
      { event: "public_sessions_failed", error: safeErrorDetails(error) },
      "Failed to load public sessions",
    );
    throw error;
  }
});

router.get(
  "/sessions/:sessionId/queue-preview",
  async (req, res): Promise<void> => {
    const parsedParams = GetSessionQueuePreviewParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }

    const [session] = await database
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(eq(sessionsTable.id, parsedParams.data.sessionId))
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    const rows = await database
      .select({
        queueNumber: submissionsTable.queueNumber,
        artistName: submissionsTable.artistName,
        songTitle: submissionsTable.songTitle,
        genre: submissionsTable.genre,
      })
      .from(submissionsTable)
      .where(
        and(
          eq(submissionsTable.sessionId, parsedParams.data.sessionId),
          eq(submissionsTable.status, "approved"),
        ),
      )
      .orderBy(asc(submissionsTable.queueNumber))
      .limit(5);
    res.json(GetSessionQueuePreviewResponse.parse(rows));
  },
);

router.post("/submissions", async (req, res): Promise<void> => {
  const parsedBody = CreateSubmissionBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  const input = parsedBody.data;
  if (
    !isHttpUrl(input.trackUrl) ||
    (input.socialUrl && !isHttpUrl(input.socialUrl))
  ) {
    res.status(400).json({ error: "Links must use HTTP or HTTPS." });
    return;
  }

  const submission = await database.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, input.sessionId))
      .for("update")
      .limit(1);

    if (
      !session ||
      !session.isOpen ||
      session.startsAt <= new Date() ||
      !publicSessionType(session.sessionType)
    ) {
      return { error: "This session is no longer accepting submissions." } as const;
    }

    const [current] = await tx
      .select({ registered: count(), highestQueueNumber: max(submissionsTable.queueNumber) })
      .from(submissionsTable)
      .where(eq(submissionsTable.sessionId, session.id));
    const registered = Number(current?.registered ?? 0);
    if (registered >= session.capacity) {
      return { error: "This session is full." } as const;
    }

    const [created] = await tx
      .insert(submissionsTable)
      .values({
        sessionId: input.sessionId,
        queueNumber: Number(current?.highestQueueNumber ?? 0) + 1,
        artistName: input.artistName.trim(),
        songTitle: input.songTitle.trim(),
        intro: input.intro.trim(),
        genre: input.genre.trim(),
        country: input.country.trim(),
        socialUrl: input.socialUrl?.trim() || null,
        trackUrl: input.trackUrl,
        rightsAccepted: input.rightsAccepted,
      })
      .returning();

    return { created } as const;
  });

  if ("error" in submission) {
    res.status(400).json({ error: submission.error });
    return;
  }

  const receipt = CreateSubmissionResponse.parse({
    id: submission.created.id,
    sessionId: submission.created.sessionId,
    queueNumber: submission.created.queueNumber,
    status: submission.created.status,
    artistName: submission.created.artistName,
    songTitle: submission.created.songTitle,
    createdAt: asIso(submission.created.createdAt),
  });
  res.status(201).json(receipt);
});

router.get(
  "/admin/access",
  hostAuthorization,
  (_req, res): void => {
    res.json(GetAdminAccessResponse.parse({ authorized: true }));
  },
);

router.get(
  "/admin/sessions",
  hostAuthorization,
  async (_req, res): Promise<void> => {
    await ensureUpcomingSessions();
    const now = new Date();
    const sessions = await database
      .select()
      .from(sessionsTable)
      // Default to the nearest upcoming session, then include recent history.
      .orderBy(
        sql`case when ${sessionsTable.startsAt} > ${now} then ${sessionsTable.startsAt} end asc`,
        sql`case when ${sessionsTable.startsAt} <= ${now} then ${sessionsTable.startsAt} end desc`,
      )
      .limit(20);
    const counts = await registrationCounts(sessions);
    const statusCounts = await database
      .select({
        sessionId: submissionsTable.sessionId,
        status: submissionsTable.status,
        total: count(),
      })
      .from(submissionsTable)
      .groupBy(submissionsTable.sessionId, submissionsTable.status);
    const groupedStatus = new Map(
      statusCounts.map((row) => [
        `${row.sessionId}:${row.status}`,
        Number(row.total),
      ]),
    );
    const response = sessions.map((session) => ({
      ...sessionSummary(session, counts.get(session.id) ?? 0),
      pending: groupedStatus.get(`${session.id}:pending`) ?? 0,
      approved: groupedStatus.get(`${session.id}:approved`) ?? 0,
      played: groupedStatus.get(`${session.id}:played`) ?? 0,
    }));
    res.json(ListAdminSessionsResponse.parse(response));
  },
);

router.get(
  "/admin/sessions/:sessionId/queue",
  hostAuthorization,
  async (req, res): Promise<void> => {
    const parsedParams = GetAdminSessionQueueParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }
    const [session] = await database
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(eq(sessionsTable.id, parsedParams.data.sessionId))
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    const rows = await database
      .select()
      .from(submissionsTable)
      .where(eq(submissionsTable.sessionId, parsedParams.data.sessionId))
      .orderBy(asc(submissionsTable.queueNumber));
    const response = rows.map((submission: Submission) => ({
      ...submission,
      createdAt: asIso(submission.createdAt),
    }));
    res.json(GetAdminSessionQueueResponse.parse(response));
  },
);

router.patch(
  "/admin/submissions/:submissionId",
  hostAuthorization,
  async (req, res): Promise<void> => {
    const parsedParams = UpdateSubmissionStatusParams.safeParse(req.params);
    const parsedBody = UpdateSubmissionStatusBody.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      res.status(400).json({
        error: !parsedParams.success
          ? parsedParams.error.message
          : parsedBody.success
            ? "Invalid request."
            : parsedBody.error.message,
      });
      return;
    }

    const [current] = await database
      .select()
      .from(submissionsTable)
      .where(eq(submissionsTable.id, parsedParams.data.submissionId))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Submission not found." });
      return;
    }

    const nextStatus = parsedBody.data.status;
    const allowed =
      (current.status === "pending" &&
        (nextStatus === "approved" || nextStatus === "rejected")) ||
      (current.status === "approved" &&
        (nextStatus === "played" ||
          nextStatus === "skipped" ||
          nextStatus === "rejected")) ||
      (current.status === "played" && nextStatus === "approved");
    if (!allowed) {
      res.status(400).json({ error: "This status change is not allowed." });
      return;
    }

    const [updated] = await database
      .update(submissionsTable)
      .set({ status: nextStatus })
      .where(
        and(
          eq(submissionsTable.id, parsedParams.data.submissionId),
          eq(submissionsTable.status, current.status),
        ),
      )
      .returning();
    if (!updated) {
      res.status(400).json({ error: "This queue item has already changed." });
      return;
    }

    res.json(
      UpdateSubmissionStatusResponse.parse({
        ...updated,
        createdAt: asIso(updated.createdAt),
      }),
    );
  },
);

return router;
}

export default createGatheringRouter();