import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import { generateUpcomingSessionInstances } from "./session-schedule";

const KYIV_TIME_ZONE = "Europe/Kyiv";

function kyivDateAndTime(date: Date): {
  date: string;
  time: string;
} {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: KYIV_TIME_ZONE,
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

test("generates one session for every consecutive Kyiv calendar day across year-end", () => {
  const now = new Date("2026-12-30T04:00:00.000Z");
  const sessions = generateUpcomingSessionInstances(now, 14);
  const actualDates = sessions.map(({ startsAt }) =>
    kyivDateAndTime(startsAt).date,
  );
  const expectedDates = Array.from({ length: 14 }, (_, offset) =>
    new Date(Date.UTC(2026, 11, 30 + offset)).toISOString().slice(0, 10),
  );

  strictEqual(sessions.length, 14);
  deepStrictEqual(actualDates, expectedDates);
});

test("preserves daily session types and starts every session at 7 AM Kyiv time", () => {
  const sessions = generateUpcomingSessionInstances(
    new Date("2026-10-06T03:00:00.000Z"),
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
    sessions.map(({ startsAt }) => kyivDateAndTime(startsAt).time),
    ["07:00", "07:00", "07:00", "07:00", "07:00"],
  );
});

test("keeps 7 AM Kyiv time across daylight-saving changes", () => {
  const springSessions = generateUpcomingSessionInstances(
    new Date("2026-03-28T04:00:00.000Z"),
    3,
  );
  const fallSessions = generateUpcomingSessionInstances(
    new Date("2026-10-24T03:00:00.000Z"),
    2,
  );

  deepStrictEqual(
    springSessions.map(({ startsAt }) => kyivDateAndTime(startsAt).time),
    ["07:00", "07:00", "07:00"],
  );
  deepStrictEqual(
    fallSessions.map(({ startsAt }) => kyivDateAndTime(startsAt).time),
    ["07:00", "07:00"],
  );
});

test("skips a session whose local start time has already passed", () => {
  const sessions = generateUpcomingSessionInstances(
    new Date("2026-10-06T05:00:00.000Z"),
    2,
  );

  deepStrictEqual(
    sessions.map(({ startsAt }) => kyivDateAndTime(startsAt).date),
    ["2026-10-07", "2026-10-08"],
  );
});