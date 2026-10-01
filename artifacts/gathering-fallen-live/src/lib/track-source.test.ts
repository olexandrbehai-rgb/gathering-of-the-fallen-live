import assert from "node:assert/strict";
import test from "node:test";
import { canPlayTrackInline, parseTrackSource } from "./track-source";

test("parses standard and localized YouTube links", () => {
  assert.deepEqual(
    parseTrackSource("https://youtu.be/dQw4w9WgXcQ"),
    { kind: "youtube", videoId: "dQw4w9WgXcQ" },
  );
  assert.deepEqual(
    parseTrackSource(
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ",
    ),
    { kind: "youtube", videoId: "dQw4w9WgXcQ" },
  );
  assert.equal(parseTrackSource("https://youtube.com/watch?v=bad").kind, "external");
});

test("parses Spotify links into the embed API URI", () => {
  assert.deepEqual(
    parseTrackSource("https://open.spotify.com/intl-en/track/4uLU6hMCjMI75M1A2tKUQC"),
    { kind: "spotify", uri: "spotify:track:4uLU6hMCjMI75M1A2tKUQC" },
  );
});

test("builds a user-controlled SoundCloud embed without autoplay", () => {
  const source = parseTrackSource("https://soundcloud.com/artist/example-track");
  assert.equal(source.kind, "soundcloud");
  if (source.kind !== "soundcloud") return;

  const embed = new URL(source.embedUrl);
  assert.equal(embed.origin, "https://w.soundcloud.com");
  assert.equal(embed.searchParams.get("auto_play"), "false");
  assert.equal(
    embed.searchParams.get("url"),
    "https://soundcloud.com/artist/example-track",
  );
});

test("recognizes direct audio files and leaves unsupported providers as links", () => {
  assert.deepEqual(parseTrackSource("https://cdn.example.test/song.MP3?download=1"), {
    kind: "audio",
    url: "https://cdn.example.test/song.MP3?download=1",
  });
  assert.equal(
    parseTrackSource("https://bandcamp.com/track/example").kind,
    "external",
  );
  assert.deepEqual(parseTrackSource("javascript:alert(1)"), {
    kind: "external",
    url: "",
  });
  assert.equal(canPlayTrackInline("https://youtu.be/dQw4w9WgXcQ"), true);
  assert.equal(canPlayTrackInline("https://bandcamp.com/track/example"), false);
  assert.equal(parseTrackSource("  ").kind, "empty");
});