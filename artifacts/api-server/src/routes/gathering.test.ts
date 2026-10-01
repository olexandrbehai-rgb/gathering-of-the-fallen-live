import assert from "node:assert/strict";
import { once } from "node:events";
import express, { type Request } from "express";
import { test } from "node:test";
import {
  db,
  sessionsTable,
  submissionsTable,
  type Session,
  type Submission,
} from "@workspace/db";
import { generateUpcomingSessionInstances } from "../lib/session-schedule";
import { createGatheringRouter } from "./gathering";

const sessionId = "00000000-0000-4000-8000-000000000001";
const existingSubmissionId = "00000000-0000-4000-8000-000000000002";
const sessionStartsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const createdAt = new Date("2026-10-01T12:00:00.000Z");
let createdSubmissionCounter = 10;

class FixtureQuery implements PromiseLike<unknown[]> {
  private table: unknown;
  private limitCount: number | undefined;

  constructor(
    private readonly database: FixtureDatabase,
    private readonly projection: Record<string, unknown> | undefined,
  ) {}

  from(table: unknown): this {
    this.table = table;
    return this;
  }

  where(): this {
    return this;
  }

  orderBy(): this {
    return this;
  }

  groupBy(): this {
    return this;
  }

  for(): this {
    return this;
  }

  limit(limit: number): this {
    this.limitCount = limit;
    return this;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.rows()).then(onfulfilled, onrejected);
  }

  private rows(): unknown[] {
    let rows: unknown[];
    const fields = Object.keys(this.projection ?? {});

    if (this.table === sessionsTable) {
      rows =
        fields.length > 0
          ? this.database.sessions.map((session) =>
              Object.fromEntries(
                fields.map((field) => [
                  field,
                  session[field as keyof Session],
                ]),
              ),
            )
          : this.database.sessions;
    } else if (this.table === submissionsTable) {
      if (fields.includes("registered") && fields.includes("highestQueueNumber")) {
        rows = [
          {
            registered: this.database.submissions.length,
            highestQueueNumber: Math.max(
              0,
              ...this.database.submissions.map((item) => item.queueNumber),
            ),
          },
        ];
      } else if (fields.includes("sessionId") && fields.includes("total")) {
        rows = [
          {
            sessionId,
            total: this.database.submissions.length,
          },
        ];
      } else if (fields.length > 0) {
        rows = this.database.submissions
          .filter((item) => item.status === "approved")
          .map(({ queueNumber, artistName, songTitle, genre }) => ({
            queueNumber,
            artistName,
            songTitle,
            genre,
          }));
      } else {
        rows = this.database.submissions;
      }
    } else {
      rows = [];
    }

    return this.limitCount === undefined ? rows : rows.slice(0, this.limitCount);
  }
}

class FixtureDatabase {
  readonly sessionInsertions: Array<{
    rows: Record<string, unknown>[];
    conflictTarget: unknown;
  }> = [];

  constructor(
    readonly sessions: Session[],
    readonly submissions: Submission[] = [],
    private readonly persistSessionInserts = false,
  ) {}

  select(projection?: Record<string, unknown>): FixtureQuery {
    return new FixtureQuery(this, projection);
  }

  insert(table: unknown) {
    let values: Record<string, unknown> | Record<string, unknown>[] = {};
    const database = this;
    return {
      values(input: Record<string, unknown> | Record<string, unknown>[]) {
        values = input;
        return this;
      },
      onConflictDoNothing: async (config?: { target?: unknown }) => {
        if (table === sessionsTable) {
          const rows = Array.isArray(values) ? values : [values];
          database.sessionInsertions.push({
            rows,
            conflictTarget: config?.target,
          });

          if (database.persistSessionInserts) {
            for (const row of rows) {
              const startsAt = row.startsAt as Date;
              if (
                database.sessions.some(
                  (session) =>
                    session.startsAt.getTime() === startsAt.getTime(),
                )
              ) {
                continue;
              }
              database.sessions.push({
                id: `00000000-0000-4000-8000-${String(database.sessions.length + 100).padStart(12, "0")}`,
                sessionType: row.sessionType as Session["sessionType"],
                startsAt,
                capacity: row.capacity as number,
                isOpen: row.isOpen as boolean,
                createdAt,
              });
            }
          }
        }
        return [];
      },
      returning: async () => {
        assert.equal(table, submissionsTable);
        assert.ok(!Array.isArray(values));
        const created: Submission = {
          ...(values as Record<string, unknown>),
          id: `00000000-0000-4000-8000-${String(createdSubmissionCounter++).padStart(12, "0")}`,
          status: "pending",
          createdAt,
        } as Submission;
        database.submissions.push(created);
        return [created];
      },
    };
  }

  update(table: unknown) {
    let patch: Record<string, unknown> = {};
    const database = this;
    return {
      set(values: Record<string, unknown>) {
        patch = values;
        return this;
      },
      where() {
        return this;
      },
      returning: async () => {
        assert.equal(table, submissionsTable);
        const current = database.submissions[0];
        if (!current) return [];
        Object.assign(current, patch);
        return [current];
      },
    };
  }

  transaction<T>(callback: (transaction: FixtureDatabase) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async execute(): Promise<{ rows: [] }> {
    return { rows: [] };
  }
}

function makeSession(
  options: Partial<Pick<Session, "capacity" | "isOpen" | "startsAt">> = {},
): Session {
  return {
    id: sessionId,
    sessionType: "artist_spotlight",
    startsAt: options.startsAt ?? sessionStartsAt,
    capacity: options.capacity ?? 5,
    isOpen: options.isOpen ?? true,
    createdAt,
  };
}

function makeSubmission(status: Submission["status"] = "pending"): Submission {
  return {
    id: existingSubmissionId,
    sessionId,
    queueNumber: 1,
    artistName: "Fixture Artist",
    songTitle: "Fixture Song",
    intro: "A test fixture, never a live submission.",
    genre: "Indie",
    country: "Canada",
    socialUrl: null,
    trackUrl: "https://open.spotify.com/track/fixture",
    rightsAccepted: true,
    status,
    createdAt,
  };
}

function createTestApp(database: FixtureDatabase) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res, next) => {
    const userId = req.get("x-test-host") || null;
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
  app.use(
    "/api",
    createGatheringRouter(database as unknown as typeof db),
  );
  return app;
}

async function withApi(
  database: FixtureDatabase,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createTestApp(database).listen(0, "127.0.0.1");
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

const submissionInput = {
  sessionId,
  artistName: "  Fixture Artist  ",
  songTitle: "  Fixture Song  ",
  intro: "A fixture for an isolated API test.",
  genre: "Indie",
  country: "Canada",
  socialUrl: "",
  trackUrl: "https://open.spotify.com/track/fixture",
  rightsAccepted: true,
};

test("upcoming sessions seed without a starts_at conflict target and remain idempotent", async () => {
  const scheduledSessions = generateUpcomingSessionInstances(new Date(), 14);
  const alreadyExisting = scheduledSessions[0];
  assert.ok(alreadyExisting);
  const database = new FixtureDatabase(
    [makeSession({ startsAt: alreadyExisting.startsAt })],
    [],
    true,
  );

  await withApi(database, async (baseUrl) => {
    const firstResponse = await fetch(`${baseUrl}/api/sessions`);
    assert.equal(firstResponse.status, 200);
    const secondResponse = await fetch(`${baseUrl}/api/sessions`);
    assert.equal(secondResponse.status, 200);
  });

  assert.equal(database.sessionInsertions.length, 1);
  assert.equal(
    database.sessionInsertions[0]?.rows.length,
    scheduledSessions.length - 1,
  );
  assert.equal(database.sessionInsertions[0]?.conflictTarget, undefined);
  assert.equal(database.sessions.length, scheduledSessions.length);
});

test("an artist can select an open session, submit a track, and receive its queue receipt", async () => {
  const database = new FixtureDatabase([makeSession()]);

  await withApi(database, async (baseUrl) => {
    const listResponse = await fetch(`${baseUrl}/api/sessions`);
    assert.equal(listResponse.status, 200);
    const sessions = (await listResponse.json()) as Array<{
      id: string;
      isOpen: boolean;
      available: number;
    }>;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, sessionId);
    assert.equal(sessions[0].isOpen, true);
    assert.equal(sessions[0].available, 5);

    const response = await fetch(`${baseUrl}/api/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...submissionInput, sessionId: sessions[0].id }),
    });
    assert.equal(response.status, 201);
    const receipt = (await response.json()) as Record<string, unknown>;
    assert.equal(receipt.sessionId, sessionId);
    assert.equal(receipt.queueNumber, 1);
    assert.equal(receipt.status, "pending");
    assert.equal(receipt.artistName, "Fixture Artist");
    assert.equal(receipt.songTitle, "Fixture Song");
    assert.equal(typeof receipt.id, "string");
    assert.equal(typeof receipt.createdAt, "string");
    assert.equal(database.submissions.length, 1);
    assert.equal(database.submissions[0].trackUrl, submissionInput.trackUrl);
  });
});

test("a full session is shown with no availability and rejects a new submission", async () => {
  const database = new FixtureDatabase(
    [makeSession({ capacity: 1 })],
    [makeSubmission()],
  );

  await withApi(database, async (baseUrl) => {
    const sessionsResponse = await fetch(`${baseUrl}/api/sessions`);
    const [session] = (await sessionsResponse.json()) as Array<{
      available: number;
    }>;
    assert.equal(session.available, 0);

    const response = await fetch(`${baseUrl}/api/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(submissionInput),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "This session is full." });
    assert.equal(database.submissions.length, 1);
  });
});

test("a closed session rejects a new submission without saving it", async () => {
  const database = new FixtureDatabase([makeSession({ isOpen: false })]);

  await withApi(database, async (baseUrl) => {
    const sessionsResponse = await fetch(`${baseUrl}/api/sessions`);
    const [session] = (await sessionsResponse.json()) as Array<{
      isOpen: boolean;
    }>;
    assert.equal(session.isOpen, false);

    const response = await fetch(`${baseUrl}/api/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(submissionInput),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "This session is no longer accepting submissions.",
    });
    assert.equal(database.submissions.length, 0);
  });
});

test("host queue reads and status changes remain Clerk-authenticated", async () => {
  const database = new FixtureDatabase([makeSession()], [makeSubmission()]);

  await withApi(database, async (baseUrl) => {
    const queueResponse = await fetch(
      `${baseUrl}/api/admin/sessions/${sessionId}/queue`,
    );
    assert.equal(queueResponse.status, 401);

    const updateResponse = await fetch(
      `${baseUrl}/api/admin/submissions/${existingSubmissionId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      },
    );
    assert.equal(updateResponse.status, 401);
    assert.equal(database.submissions[0].status, "pending");
  });
});

for (const [startingStatus, nextStatus] of [
  ["pending", "approved"],
  ["pending", "rejected"],
  ["approved", "played"],
  ["approved", "skipped"],
  ["played", "approved"],
] as const) {
  test(`an authenticated host can move ${startingStatus} tracks to ${nextStatus} and read the refreshed queue`, async () => {
    const database = new FixtureDatabase(
      [makeSession()],
      [makeSubmission(startingStatus)],
    );

    await withApi(database, async (baseUrl) => {
      const updateResponse = await fetch(
        `${baseUrl}/api/admin/submissions/${existingSubmissionId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-test-host": "host_fixture",
          },
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      assert.equal(updateResponse.status, 200);
      assert.equal((await updateResponse.json() as { status: string }).status, nextStatus);

      const queueResponse = await fetch(
        `${baseUrl}/api/admin/sessions/${sessionId}/queue`,
        { headers: { "x-test-host": "host_fixture" } },
      );
      assert.equal(queueResponse.status, 200);
      const queue = (await queueResponse.json()) as Array<{ status: string }>;
      assert.equal(queue.length, 1);
      assert.equal(queue[0].status, nextStatus);
    });
  });
}

test("a host cannot skip a pending track", async () => {
  const database = new FixtureDatabase([makeSession()], [makeSubmission()]);

  await withApi(database, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/admin/submissions/${existingSubmissionId}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-test-host": "host_fixture",
        },
        body: JSON.stringify({ status: "skipped" }),
      },
    );
    assert.equal(response.status, 400);
    assert.equal(database.submissions[0].status, "pending");
  });
});