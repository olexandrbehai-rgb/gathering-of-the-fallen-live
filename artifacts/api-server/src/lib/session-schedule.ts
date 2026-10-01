import type { Session } from "@workspace/db";

const SESSION_TIME_ZONE = "America/Toronto";
const CALENDAR_DAY_MS = 86_400_000;

type SessionSchedule = {
  sessionType: Session["sessionType"];
  hour: number;
};

const WEEKDAY_SCHEDULE: Partial<Record<number, SessionSchedule>> = {
  2: { sessionType: "artist_spotlight", hour: 20 },
  4: { sessionType: "genre_showcase", hour: 20 },
  6: { sessionType: "weekend_takeover", hour: 21 },
};

const DEFAULT_DAILY_SCHEDULE: SessionSchedule = {
  sessionType: "artist_spotlight",
  hour: 20,
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

export function torontoWallTimeToUtc(
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

export function generateUpcomingSessionInstances(
  now: Date,
  count = 14,
): Array<{ sessionType: Session["sessionType"]; startsAt: Date }> {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("Session count must be a non-negative integer.");
  }

  const localNow = torontoParts(now);
  const localTodayUtc = Date.UTC(
    Number(localNow.year),
    Number(localNow.month) - 1,
    Number(localNow.day),
  );
  const sessions: Array<{
    sessionType: Session["sessionType"];
    startsAt: Date;
  }> = [];

  // One extra calendar date lets us still return the requested count if today's
  // session time has already passed.
  for (
    let dayOffset = 0;
    dayOffset <= count && sessions.length < count;
    dayOffset += 1
  ) {
    const localDate = new Date(localTodayUtc + dayOffset * CALENDAR_DAY_MS);
    const schedule =
      WEEKDAY_SCHEDULE[localDate.getUTCDay()] ?? DEFAULT_DAILY_SCHEDULE;
    const startsAt = torontoWallTimeToUtc(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth() + 1,
      localDate.getUTCDate(),
      schedule.hour,
    );

    if (startsAt <= now) continue;

    sessions.push({ sessionType: schedule.sessionType, startsAt });
  }

  return sessions;
}