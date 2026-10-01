import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import { generateUpcomingSessionInstances } from "./session-schedule";

const TORONTO_TIME_ZONE = "America/Toronto";

function torontoDateAndTime(date: Date): {
  date: string;
  time: string;
} {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TORONTO_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map(({ type, value }) => [type, value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

test("generates one session for every consecutive Toronto calendar day across year-end", () => {
  const now = new Date("2026-12-30T12:00:00.000Z");
  const sessions = generateUpcomingSessionInstances(now, 14);
  const actualDates = sessions.map(({ startsAt }) =>
    torontoDateAndTime(startsAt).date,
  );
  const expectedDates = Array.from({ length: 14 }, (_, offset) =>
    new Date(Date.UTC(2026, 11, 30 + offset)).toISOString().slice(0, 10),
  );

  strictEqual(sessions.length, 14);
  deepStrictEqual(actualDates, expectedDates);
});

test("preserves the existing Tuesday, Thursday, and Saturday schedule", () => {
  const sessions = generateUpcomingSessionInstances(
    new Date("2026-10-06T12:00:00-04:00"),
    5,
  );

  deepStrictEqual(
    sessions.map(({ sessionType }) => sessionType),
    [
      "artist_spotlight",
      "artist_spotlight",
      "genre_showcase",
      "artist_spotlight",
      "weekend_takeover",
    ],
  );
  deepStrictEqual(
    sessions.map(({ startsAt }) => torontoDateAndTime(startsAt).time),
    ["20:00", "20:00", "20:00", "20:00", "21:00"],
  );
});

test("keeps the scheduled Toronto wall time across daylight-saving changes", () => {
  const springSessions = generateUpcomingSessionInstances(
    new Date("2026-03-07T12:00:00-05:00"),
    3,
  );
  const fallSessions = generateUpcomingSessionInstances(
    new Date("2026-10-31T12:00:00-04:00"),
    2,
  );

  deepStrictEqual(
    springSessions.map(({ startsAt }) => torontoDateAndTime(startsAt).time),
    ["21:00", "20:00", "20:00"],
  );
  deepStrictEqual(
    fallSessions.map(({ startsAt }) => torontoDateAndTime(startsAt).time),
    ["21:00", "20:00"],
  );
});

test("skips a session whose local start time has already passed", () => {
  const sessions = generateUpcomingSessionInstances(
    new Date("2026-10-06T21:00:00-04:00"),
    2,
  );

  deepStrictEqual(
    sessions.map(({ startsAt }) => torontoDateAndTime(startsAt).date),
    ["2026-10-07", "2026-10-08"],
  );
});