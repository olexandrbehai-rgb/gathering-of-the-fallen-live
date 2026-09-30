import {
  CreateSubmissionBody,
  CreateSubmissionResponse,
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
import { and, asc, count, desc, eq, gt, max, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
const SESSION_TIME_ZONE = "America/Toronto";
const SESSION_SCHEDULE = {
  2: { sessionType: "artist_spotlight" as const, hour: 20 },
  4: { sessionType: "genre_showcase" as const, hour: 20 },
  6: { sessionType: "weekend_takeover" as const, hour: 21 },
};

function torontoParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: SESSION_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
}

function torontoWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
): Date {
  const intendedWallTime = Date.UTC(year, month - 1, day, hour);
  let result = new Date(intendedWallTime);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SESSION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(result)
        .filter((part) => part.type !== "literal")
        .map(({ type, value }) => [type, value]),
    );
    const renderedWallTime = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    result = new Date(result.getTime() + intendedWallTime - renderedWallTime);
  }

  return result;
}

async function ensureUpcomingSessions(): Promise<void> {
  const now = new Date();
  const localNow = torontoParts(now);
  const localTodayUtc = Date.UTC(
    Number(localNow.year),
    Number(localNow.month) - 1,
    Number(localNow.day),
  );
  const sessions: Array<{
    sessionType: Session["sessionType"];
    startsAt: Date;
    capacity: number;
    isOpen: boolean;
  }> = [];

  for (let dayOffset = 0; dayOffset < 14 && sessions.length < 3; dayOffset += 1) {
    const localDate = new Date(localTodayUtc + dayOffset * 86_400_000);
    const schedule =
      SESSION_SCHEDULE[localDate.getUTCDay() as keyof typeof SESSION_SCHEDULE];
    if (!schedule) continue;

    const startsAt = torontoWallTimeToUtc(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth() + 1,
      localDate.getUTCDate(),
      schedule.hour,
    );
    if (startsAt <= now) continue;

    sessions.push({
      sessionType: schedule.sessionType,
      startsAt,
      capacity: 30,
      isOpen: true,
    });
  }

  if (sessions.length > 0) {
    await db
      .insert(sessionsTable)
      .values(sessions)
      .onConflictDoNothing({ target: sessionsTable.startsAt });
  }
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
  const grouped = await db
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
  await ensureUpcomingSessions();
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(gt(sessionsTable.startsAt, new Date()))
    .orderBy(asc(sessionsTable.startsAt))
    .limit(6);
  const counts = await registrationCounts(sessions);

  const response = sessions.map((session) =>
    sessionSummary(session, counts.get(session.id) ?? 0),
  );
  res.json(ListSessionsResponse.parse(response));
});

router.get(
  "/sessions/:sessionId/queue-preview",
  async (req, res): Promise<void> => {
    const parsedParams = GetSessionQueuePreviewParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }

    const [session] = await db
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(eq(sessionsTable.id, parsedParams.data.sessionId))
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    const rows = await db
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

  const submission = await db.transaction(async (tx) => {
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
  "/admin/sessions",
  requireAuth,
  async (_req, res): Promise<void> => {
    await ensureUpcomingSessions();
    const sessions = await db
      .select()
      .from(sessionsTable)
      .orderBy(desc(sessionsTable.startsAt))
      .limit(12);
    const counts = await registrationCounts(sessions);
    const statusCounts = await db
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
  requireAuth,
  async (req, res): Promise<void> => {
    const parsedParams = GetAdminSessionQueueParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }
    const [session] = await db
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(eq(sessionsTable.id, parsedParams.data.sessionId))
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    const rows = await db
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
  requireAuth,
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

    const [current] = await db
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
          nextStatus === "rejected"));
    if (!allowed) {
      res.status(400).json({ error: "This status change is not allowed." });
      return;
    }

    const [updated] = await db
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

export default router;