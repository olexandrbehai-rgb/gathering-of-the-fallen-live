import type { Session } from "@workspace/db";

const SESSION_TIME_ZONE = "Europe/Kyiv";
const LEGACY_SESSION_TIME_ZONE = "America/Toronto";
const CALENDAR_DAY_MS = 86_400_000;

/** Daily live session start, as a wall-clock hour in Europe/Kyiv (20:00 = 8 PM). */
export const SESSION_HOUR = 20;
/** Previous schedule (07:00 Kyiv); existing rows at this time are moved to SESSION_HOUR. */
export const PREVIOUS_SESSION_HOUR = 7;

type SessionSchedule = {
  sessionType: Session["sessionType"];
  hour: number;
};

const WEEKDAY_SCHEDULE: Partial<Record<number, SessionSchedule>> = {
  2: { sessionType: "artist_spotlight", hour: SESSION_HOUR },
  4: { sessionType: "genre_showcase", hour: SESSION_HOUR },
  6: { sessionType: "weekend_takeover", hour: SESSION_HOUR },
};

const DEFAULT_DAILY_SCHEDULE: SessionSchedule = {
  sessionType: "artist_spotlight",
  hour: SESSION_HOUR,
};

function dateParts(date: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
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

function wallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  const intendedWallTime = Date.UTC(year, month - 1, day, hour);
  let result = new Date(intendedWallTime);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
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

export function kyivWallTimeOnDate(date: Date, hour: number): Date {
  const localDate = dateParts(date, SESSION_TIME_ZONE);
  return wallTimeToUtc(
    Number(localDate.year),
    Number(localDate.month),
    Number(localDate.day),
    hour,
    SESSION_TIME_ZONE,
  );
}

export function legacyTorontoWallTimeOnDate(date: Date, hour: number): Date {
  const localDate = dateParts(date, LEGACY_SESSION_TIME_ZONE);
  return wallTimeToUtc(
    Number(localDate.year),
    Number(localDate.month),
    Number(localDate.day),
    hour,
    LEGACY_SESSION_TIME_ZONE,
  );
}

export function legacyTorontoDateAtKyivWallTime(
  date: Date,
  hour: number,
): Date {
  const legacyDate = dateParts(date, LEGACY_SESSION_TIME_ZONE);
  return wallTimeToUtc(
    Number(legacyDate.year),
    Number(legacyDate.month),
    Number(legacyDate.day),
    hour,
    SESSION_TIME_ZONE,
  );
}

export function generateUpcomingSessionInstances(
  now: Date,
  count = 14,
): Array<{ sessionType: Session["sessionType"]; startsAt: Date }> {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("Session count must be a non-negative integer.");
  }

  const localNow = dateParts(now, SESSION_TIME_ZONE);
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
    const startsAt = wallTimeToUtc(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth() + 1,
      localDate.getUTCDate(),
      schedule.hour,
      SESSION_TIME_ZONE,
    );

    if (startsAt <= now) continue;

    sessions.push({ sessionType: schedule.sessionType, startsAt });
  }

  return sessions;
}