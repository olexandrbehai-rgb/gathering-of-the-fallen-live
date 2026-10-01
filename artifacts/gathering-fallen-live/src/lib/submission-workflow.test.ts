import assert from "node:assert/strict";
import test from "node:test";
import {
  getGetAdminSessionQueueQueryKey,
  getGetSessionQueuePreviewQueryKey,
  getListAdminSessionsQueryKey,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import {
  buildSubmissionInput,
  isSessionSubmittable,
  refreshAfterArtistSubmission,
  refreshAfterHostQueueChange,
} from "./submission-workflow";

const sessionId = "00000000-0000-4000-8000-000000000001";

test("artist submission payload keeps the chosen session and valid track link", () => {
  assert.deepEqual(
    buildSubmissionInput(sessionId, {
      artistName: "Artist",
      songTitle: "Song",
      intro: "A short note for the host.",
      genre: "Indie",
      country: "Canada",
      socialUrl: "",
      trackUrl: "https://open.spotify.com/track/example",
      rightsAccepted: true,
    }),
    {
      sessionId,
      artistName: "Artist",
      songTitle: "Song",
      intro: "A short note for the host.",
      genre: "Indie",
      country: "Canada",
      socialUrl: null,
      trackUrl: "https://open.spotify.com/track/example",
      rightsAccepted: true,
    },
  );
});

test("only open sessions with available capacity can be submitted to", () => {
  assert.equal(isSessionSubmittable({ isOpen: true, available: 4 }), true);
  assert.equal(isSessionSubmittable({ isOpen: true, available: 0 }), false);
  assert.equal(isSessionSubmittable({ isOpen: false, available: 4 }), false);
  assert.equal(isSessionSubmittable(undefined), false);
});

test("artist receipts refresh the session list and that session's public queue", () => {
  const invalidations: unknown[][] = [];
  const queryClient = {
    invalidateQueries: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
      invalidations.push([...queryKey]);
    },
  };

  refreshAfterArtistSubmission(queryClient as never, sessionId);

  assert.deepEqual(invalidations, [
    getListSessionsQueryKey(),
    getGetSessionQueuePreviewQueryKey(sessionId),
  ]);
});

test("every host status change refreshes its queue and the admin session summary", () => {
  const invalidations: unknown[][] = [];
  const queryClient = {
    invalidateQueries: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
      invalidations.push([...queryKey]);
    },
  };

  refreshAfterHostQueueChange(queryClient as never, sessionId);

  assert.deepEqual(invalidations, [
    getGetAdminSessionQueueQueryKey(sessionId),
    getListAdminSessionsQueryKey(),
  ]);
});