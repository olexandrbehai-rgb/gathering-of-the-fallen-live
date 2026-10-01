import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ExternalLink } from "lucide-react";
import { parseTrackSource, type TrackSource } from "@/lib/track-source";

const YOUTUBE_API_URL = "https://www.youtube.com/iframe_api";
const SPOTIFY_API_URL = "https://open.spotify.com/embed/iframe-api/v1";
const SOUNDCLOUD_API_URL = "https://w.soundcloud.com/player/api.js";

type PlaybackUpdate = { data: { isPaused: boolean } };
type SpotifyController = {
  addListener(event: "playback_update", listener: (event: PlaybackUpdate) => void): void;
  play(): void;
  pause(): void;
};
type SpotifyIframeApi = {
  createController(
    element: HTMLElement,
    options: { uri: string; width: string; height: string },
    callback: (controller: SpotifyController) => void,
  ): void;
};
type SpotifyWindow = Window & {
  onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void;
};

type YouTubePlayer = {
  destroy(): void;
  getIframe(): HTMLIFrameElement;
  pauseVideo(): void;
  playVideo(): void;
};
type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      height: string;
      width: string;
      videoId: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady: (event: { target: YouTubePlayer }) => void;
        onStateChange: (event: { data: number }) => void;
        onError: () => void;
        onAutoplayBlocked: () => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: { PLAYING: number };
};
type YouTubeWindow = Window & {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

type SoundCloudWidget = {
  bind(event: string, listener: () => void): void;
  pause(): void;
  play(): void;
};
type SoundCloudWidgetFactory = ((iframe: HTMLIFrameElement) => SoundCloudWidget) & {
  Events: { READY: string; PLAY: string; PAUSE: string; ERROR: string };
};
type SoundCloudWindow = Window & {
  SC?: { Widget: SoundCloudWidgetFactory };
};

export type LiveTrackPlayerHandle = {
  togglePlayback(): void;
  stopPlayback(): void;
};

type LiveTrackPlayerProps = {
  url: string;
  playing: boolean;
  setPlaying: (value: boolean) => void;
  onReadyChange: (ready: boolean) => void;
  embeddedPlayerTitle: string;
  t: (key: string) => string;
};

const scriptLoads = new Map<string, Promise<void>>();
let youtubeApiLoad: Promise<YouTubeApi> | undefined;
let spotifyApiLoad: Promise<SpotifyIframeApi> | undefined;

export const LiveTrackPlayer = forwardRef<
  LiveTrackPlayerHandle,
  LiveTrackPlayerProps
>(function LiveTrackPlayer(
  { url, playing, setPlaying, onReadyChange, embeddedPlayerTitle, t },
  ref,
) {
  const source = useMemo(() => parseTrackSource(url), [url]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubeContainerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const spotifyContainerRef = useRef<HTMLDivElement>(null);
  const spotifyControllerRef = useRef<SpotifyController | null>(null);
  const soundCloudIframeRef = useRef<HTMLIFrameElement>(null);
  const soundCloudWidgetRef = useRef<SoundCloudWidget | null>(null);
  const playingRef = useRef(playing);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState(false);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    let active = true;
    onReadyChange(false);
    setPlayerError(false);
    setPlayerLoading(false);

    const reportReady = () => {
      if (!active) return;
      setPlayerLoading(false);
      onReadyChange(true);
    };
    const reportError = () => {
      if (!active) return;
      setPlayerLoading(false);
      setPlayerError(true);
      onReadyChange(false);
      setPlaying(false);
    };

    if (source.kind === "empty" || source.kind === "external") {
      return () => {
        active = false;
      };
    }

    if (source.kind === "audio") {
      reportReady();
      return () => {
        active = false;
        audioRef.current?.pause();
      };
    }

    setPlayerLoading(true);

    if (source.kind === "youtube") {
      void loadYouTubeApi()
        .then((api) => {
          if (!active || !youtubeContainerRef.current) return;
          youtubePlayerRef.current = new api.Player(youtubeContainerRef.current, {
            height: "270",
            width: "100%",
            videoId: source.videoId,
            playerVars: {
              autoplay: 0,
              playsinline: 1,
              rel: 0,
              origin: window.location.origin,
            },
            events: {
              onReady: ({ target }) => {
                target.getIframe().title = embeddedPlayerTitle;
                reportReady();
              },
              onStateChange: ({ data }) => {
                const isPlaying = data === api.PlayerState.PLAYING;
                playingRef.current = isPlaying;
                setPlaying(isPlaying);
                if (isPlaying) setPlayerError(false);
              },
              onError: reportError,
              onAutoplayBlocked: reportError,
            },
          });
        })
        .catch(reportError);

      return () => {
        active = false;
        youtubePlayerRef.current?.destroy();
        youtubePlayerRef.current = null;
      };
    }

    if (source.kind === "spotify") {
      void loadSpotifyApi()
        .then((api) => {
          if (!active || !spotifyContainerRef.current) return;
          api.createController(
            spotifyContainerRef.current,
            { uri: source.uri, width: "100%", height: "166" },
            (controller) => {
              if (!active) {
                controller.pause();
                return;
              }
              spotifyControllerRef.current = controller;
              controller.addListener("playback_update", ({ data }) => {
                playingRef.current = !data.isPaused;
                setPlaying(!data.isPaused);
                if (!data.isPaused) setPlayerError(false);
              });
              reportReady();
            },
          );
        })
        .catch(reportError);

      return () => {
        active = false;
        spotifyControllerRef.current?.pause();
        spotifyControllerRef.current = null;
      };
    }

    void loadSoundCloudApi()
      .then((api) => {
        const iframe = soundCloudIframeRef.current;
        if (!active || !iframe) return;
        const widget = api.Widget(iframe);
        soundCloudWidgetRef.current = widget;
        widget.bind(api.Widget.Events.READY, reportReady);
        widget.bind(api.Widget.Events.PLAY, () => {
          playingRef.current = true;
          setPlaying(true);
          setPlayerError(false);
        });
        widget.bind(api.Widget.Events.PAUSE, () => {
          playingRef.current = false;
          setPlaying(false);
        });
        widget.bind(api.Widget.Events.ERROR, reportError);
      })
      .catch(reportError);

    return () => {
      active = false;
      soundCloudWidgetRef.current?.pause();
      soundCloudWidgetRef.current = null;
    };
  }, [embeddedPlayerTitle, onReadyChange, setPlaying, source]);

  const togglePlayback = useCallback(() => {
    const shouldPause = playingRef.current;
    setPlayerError(false);

    try {
      if (source.kind === "audio") {
        const audio = audioRef.current;
        if (!audio) return;
        if (shouldPause) {
          audio.pause();
        } else {
          void audio.play().catch(() => {
            setPlaying(false);
            setPlayerError(true);
          });
        }
      } else if (source.kind === "youtube") {
        const player = youtubePlayerRef.current;
        if (!player) return;
        if (shouldPause) player.pauseVideo();
        else player.playVideo();
      } else if (source.kind === "spotify") {
        const controller = spotifyControllerRef.current;
        if (!controller) return;
        if (shouldPause) controller.pause();
        else controller.play();
      } else if (source.kind === "soundcloud") {
        const widget = soundCloudWidgetRef.current;
        if (!widget) return;
        if (shouldPause) widget.pause();
        else widget.play();
      }
    } catch {
      setPlayerError(true);
      setPlaying(false);
    }
  }, [setPlaying, source]);

  const stopPlayback = useCallback(() => {
    try {
      if (source.kind === "audio") audioRef.current?.pause();
      else if (source.kind === "youtube") youtubePlayerRef.current?.pauseVideo();
      else if (source.kind === "spotify") spotifyControllerRef.current?.pause();
      else if (source.kind === "soundcloud") soundCloudWidgetRef.current?.pause();
    } catch {
      setPlayerError(true);
    }
    playingRef.current = false;
    setPlaying(false);
  }, [setPlaying, source]);

  useImperativeHandle(ref, () => ({ togglePlayback, stopPlayback }), [
    stopPlayback,
    togglePlayback,
  ]);

  if (source.kind === "empty") return null;

  if (source.kind === "external") {
    return (
      <div className="mt-5">
        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-primary/40 px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/10"
            data-testid="link-live-track"
          >
            <ExternalLink className="size-3.5" />
            {t("openLink")}
          </a>
        )}
        <p className="mt-2 text-xs text-muted-foreground" data-testid="text-live-track-fallback">
          {t("audioFallback")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="overflow-hidden rounded-lg border border-border bg-background/60">
        {source.kind === "audio" && (
          <audio
            ref={audioRef}
            src={source.url}
            controls
            onPlay={() => {
              playingRef.current = true;
              setPlaying(true);
              setPlayerError(false);
            }}
            onPause={() => {
              playingRef.current = false;
              setPlaying(false);
            }}
            onEnded={() => {
              playingRef.current = false;
              setPlaying(false);
            }}
            onError={() => setPlayerError(true)}
            className="h-10 w-full"
            data-testid="audio-live-player"
          />
        )}
        {source.kind === "youtube" && (
          <div
            ref={youtubeContainerRef}
            className="h-[270px] w-full"
            data-testid="youtube-live-player"
          />
        )}
        {source.kind === "spotify" && (
          <div
            ref={spotifyContainerRef}
            className="h-[166px] w-full"
            data-testid="spotify-live-player"
          />
        )}
        {source.kind === "soundcloud" && (
          <iframe
            ref={soundCloudIframeRef}
            src={source.embedUrl}
            title={embeddedPlayerTitle}
            allow="autoplay"
            className="h-[166px] w-full border-0"
            data-testid="soundcloud-live-player"
          />
        )}
      </div>
      {playerLoading && (
        <p className="mt-2 text-xs text-muted-foreground" role="status" data-testid="status-live-player-loading">
          {t("playerLoading")}
        </p>
      )}
      {playerError && (
        <p className="mt-2 text-xs text-accent" role="alert" data-testid="status-live-player-error">
          {t("playerError")}
        </p>
      )}
    </div>
  );
});

LiveTrackPlayer.displayName = "LiveTrackPlayer";

async function loadScript(source: string): Promise<void> {
  const cached = scriptLoads.get(source);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load player API: ${source}`));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    scriptLoads.delete(source);
    throw error;
  });

  scriptLoads.set(source, promise);
  return promise;
}

function loadYouTubeApi(): Promise<YouTubeApi> {
  const target = window as YouTubeWindow;
  if (target.YT?.Player) return Promise.resolve(target.YT);
  if (!youtubeApiLoad) {
    youtubeApiLoad = new Promise<YouTubeApi>((resolve, reject) => {
      const previousReady = target.onYouTubeIframeAPIReady;
      const timeout = window.setTimeout(
        () => reject(new Error("YouTube player API timed out.")),
        15_000,
      );
      target.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        window.clearTimeout(timeout);
        if (target.YT?.Player) resolve(target.YT);
        else reject(new Error("YouTube player API did not initialize."));
      };
      void loadScript(YOUTUBE_API_URL).catch((error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      });
    }).catch((error: unknown) => {
      youtubeApiLoad = undefined;
      throw error;
    });
  }
  return youtubeApiLoad;
}

function loadSpotifyApi(): Promise<SpotifyIframeApi> {
  const target = window as SpotifyWindow;
  if (!spotifyApiLoad) {
    spotifyApiLoad = new Promise<SpotifyIframeApi>((resolve, reject) => {
      const previousReady = target.onSpotifyIframeApiReady;
      const timeout = window.setTimeout(
        () => reject(new Error("Spotify player API timed out.")),
        15_000,
      );
      target.onSpotifyIframeApiReady = (api) => {
        previousReady?.(api);
        window.clearTimeout(timeout);
        resolve(api);
      };
      void loadScript(SPOTIFY_API_URL).catch((error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      });
    }).catch((error: unknown) => {
      spotifyApiLoad = undefined;
      throw error;
    });
  }
  return spotifyApiLoad;
}

async function loadSoundCloudApi(): Promise<{
  Widget: SoundCloudWidgetFactory;
}> {
  await loadScript(SOUNDCLOUD_API_URL);
  const api = (window as SoundCloudWindow).SC;
  if (!api?.Widget) throw new Error("SoundCloud player API did not initialize.");
  return api;
}