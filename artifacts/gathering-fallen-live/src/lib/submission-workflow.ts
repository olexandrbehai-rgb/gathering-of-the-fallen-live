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
  void queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
  void queryClient.invalidateQueries({
    queryKey: getGetSessionQueuePreviewQueryKey(sessionId),
  });
}
export type SubmissionFormIssue = "sessionRequired" | "formIncomplete" | "rightsRequired" | null;

/** Explains why the artist form cannot be sent yet, instead of silently ignoring the click. */
export function submissionFormIssue(
  session: SubmittableSession | null | undefined,
  form: ArtistSubmissionForm,
): SubmissionFormIssue {
  if (!isSessionSubmittable(session)) return "sessionRequired";
  const required = [form.artistName, form.songTitle, form.intro, form.genre, form.country, form.trackUrl];
  if (required.some((value) => !value.trim())) return "formIncomplete";
  if (!form.rightsAccepted) return "rightsRequired";
  return null;
}

/** Maps an API error from POST /api/submissions to a translation key. */
export function submissionErrorKey(error: unknown): string {
  const data = (error as { data?: unknown } | null)?.data;
  const message = typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : "";
  if (/session is full/i.test(message)) return "fullNote";
  if (/no longer accepting/i.test(message)) return "sessionClosed";
  if (/HTTP or HTTPS|url/i.test(message)) return "linkInvalid";
  if ((error as { status?: number } | null)?.status === 400) return "formIncomplete";
  return "error";
}
