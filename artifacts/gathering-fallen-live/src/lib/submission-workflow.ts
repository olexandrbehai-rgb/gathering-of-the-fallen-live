import type { QueryClient } from "@tanstack/react-query";
import {
  getGetAdminSessionQueueQueryKey,
  getGetSessionQueuePreviewQueryKey,
  getListAdminSessionsQueryKey,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import type { SubmissionInput } from "@workspace/api-client-react";

export type SubmittableSession = {
  isOpen: boolean;
  available: number;
};

export type ArtistSubmissionForm = {
  artistName: string;
  songTitle: string;
  intro: string;
  genre: string;
  country: string;
  socialUrl: string;
  trackUrl: string;
  rightsAccepted: boolean;
};

export function isSessionSubmittable(
  session: SubmittableSession | null | undefined,
): boolean {
  return Boolean(session?.isOpen && session.available > 0);
}

export function buildSubmissionInput(
  sessionId: string,
  form: ArtistSubmissionForm,
): SubmissionInput {
  return {
    ...form,
    sessionId,
    socialUrl: form.socialUrl || null,
    rightsAccepted: true,
  };
}

export function refreshAfterArtistSubmission(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  sessionId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
  void queryClient.invalidateQueries({
    queryKey: getGetSessionQueuePreviewQueryKey(sessionId),
  });
}

export function refreshAfterHostQueueChange(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  sessionId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: getGetAdminSessionQueueQueryKey(sessionId),
  });
  void queryClient.invalidateQueries({
    queryKey: getListAdminSessionsQueryKey(),
  });
}