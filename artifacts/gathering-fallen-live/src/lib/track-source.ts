export type TrackSource =
  | { kind: "empty" }
  | { kind: "audio"; url: string }
  | { kind: "youtube"; videoId: string }
  | { kind: "spotify"; uri: string }
  | { kind: "soundcloud"; embedUrl: string }
  | { kind: "external"; url: string };

const AUDIO_PATH = /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseTrackSource(value: string): TrackSource {
  const raw = value.trim();
  if (!raw) return { kind: "empty" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: "external", url: "" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "external", url: "" };
  }

  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  const youtubeId = getYouTubeVideoId(url, hostname);
  if (youtubeId) return { kind: "youtube", videoId: youtubeId };

  if (hostname === "open.spotify.com") {
    const match = url.pathname.match(
      /^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)\/?$/i,
    );
    if (match) {
      return {
        kind: "spotify",
        uri: `spotify:${match[1].toLowerCase()}:${match[2]}`,
      };
    }
  }

  if (
    hostname === "soundcloud.com" ||
    hostname === "m.soundcloud.com"
  ) {
    return { kind: "soundcloud", embedUrl: makeSoundCloudEmbedUrl(url) };
  }

  if (hostname === "w.soundcloud.com" && url.pathname === "/player/") {
    const nestedUrl = url.searchParams.get("url");
    if (nestedUrl) {
      try {
        const trackUrl = new URL(nestedUrl);
        const trackHost = trackUrl.hostname.replace(/^www\./, "").toLowerCase();
        if (
          trackUrl.protocol.startsWith("http") &&
          (trackHost === "soundcloud.com" || trackHost === "m.soundcloud.com")
        ) {
          return {
            kind: "soundcloud",
            embedUrl: makeSoundCloudEmbedUrl(trackUrl),
          };
        }
      } catch {
        // Keep malformed provider URLs as external links below.
      }
    }
  }

  if (AUDIO_PATH.test(url.pathname)) {
    return { kind: "audio", url: url.toString() };
  }

  return { kind: "external", url: raw };
}

export function canPlayTrackInline(value: string): boolean {
  const kind = parseTrackSource(value).kind;
  return (
    kind === "audio" ||
    kind === "youtube" ||
    kind === "spotify" ||
    kind === "soundcloud"
  );
}

function getYouTubeVideoId(url: URL, hostname: string): string | null {
  const isYouTubeHost =
    hostname === "youtu.be" ||
    hostname === "youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "music.youtube.com" ||
    hostname === "youtube-nocookie.com";
  if (!isYouTubeHost) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const videoId =
    hostname === "youtu.be"
      ? segments[0]
      : ["/embed/", "/shorts/", "/live/"].some((prefix) =>
            url.pathname.startsWith(prefix),
          )
        ? segments[1]
        : url.searchParams.get("v");

  return videoId && YOUTUBE_ID.test(videoId) ? videoId : null;
}

function makeSoundCloudEmbedUrl(trackUrl: URL): string {
  const embed = new URL("https://w.soundcloud.com/player/");
  embed.searchParams.set("url", trackUrl.toString());
  embed.searchParams.set("color", "#9b6cff");
  embed.searchParams.set("auto_play", "false");
  embed.searchParams.set("hide_related", "true");
  return embed.toString();
}