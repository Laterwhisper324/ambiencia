import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          height?: string | number;
          width?: string | number;
          videoId?: string;
          host?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
            onError?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YTPlayerInstance {
  loadVideoById?: (videoId: string, startSeconds?: number) => void;
  cueVideoById?: (videoId: string, startSeconds?: number) => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  stopVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume?: (volume: number) => void;
  getVolume?: () => number;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
  destroy?: () => void;
}

export interface YouTubePlayerHandle {
  loadVideo: (videoId: string, startSec: number, autoPlay: boolean) => void;
  play: () => void;
  pause: () => void;
  seekTo: (sec: number) => void;
  setVolume: (vol0to1: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

interface Props {
  active: boolean;
  onEnded: () => void;
  onDurationChange: (durationSec: number) => void;
  onTimeUpdate: (currentSec: number) => void;
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT && typeof window.YT.Player === 'function') {
    return Promise.resolve();
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve) => {
    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevCallback) prevCallback();
      resolve();
    };
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    } else if (window.YT && typeof window.YT.Player === 'function') {
      resolve();
    }
  });

  return ytApiPromise;
}

export const YouTubeEmbedPlayer = forwardRef<YouTubePlayerHandle, Props>(
  ({ active, onEnded, onDurationChange, onTimeUpdate }, ref) => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<YTPlayerInstance | null>(null);
    const readyRef = useRef<boolean>(false);
    const initializingRef = useRef<boolean>(false);
    const currentVideoIdRef = useRef<string | null>(null);
    const desiredVolumeRef = useRef<number>(85);
    const pendingCommandRef = useRef<{
      videoId: string;
      startSec: number;
      autoPlay: boolean;
    } | null>(null);

    // Keep latest callbacks in refs so we never recreate YT.Player on parent re-renders
    const activeRef = useRef(active);
    const onEndedRef = useRef(onEnded);
    const onDurationChangeRef = useRef(onDurationChange);
    const onTimeUpdateRef = useRef(onTimeUpdate);

    useEffect(() => {
      activeRef.current = active;
      onEndedRef.current = onEnded;
      onDurationChangeRef.current = onDurationChange;
      onTimeUpdateRef.current = onTimeUpdate;
    }, [active, onEnded, onDurationChange, onTimeUpdate]);

    const applyCommandToReadyPlayer = (
      player: YTPlayerInstance,
      cmd: { videoId: string; startSec: number; autoPlay: boolean }
    ) => {
      try {
        if (typeof player.setVolume === 'function') {
          player.setVolume(desiredVolumeRef.current);
        }
        if (currentVideoIdRef.current !== cmd.videoId) {
          currentVideoIdRef.current = cmd.videoId;
          const safeStart = Math.max(0, cmd.startSec || 0);
          if (cmd.autoPlay && typeof player.loadVideoById === 'function') {
            player.loadVideoById(cmd.videoId, safeStart);
          } else if (typeof player.cueVideoById === 'function') {
            player.cueVideoById(cmd.videoId, safeStart);
          }
        } else {
          const cur =
            typeof player.getCurrentTime === 'function' ? player.getCurrentTime() || 0 : 0;
          const playerState =
            typeof player.getPlayerState === 'function' ? player.getPlayerState() : -1;

          if (
            cmd.startSec >= 0 &&
            Math.abs(cur - cmd.startSec) > 2.5 &&
            typeof player.seekTo === 'function'
          ) {
            player.seekTo(cmd.startSec, true);
          }
          if (cmd.autoPlay && playerState !== 1 && playerState !== 3 && typeof player.playVideo === 'function') {
            player.playVideo();
          } else if (!cmd.autoPlay && (playerState === 1 || playerState === 3) && typeof player.pauseVideo === 'function') {
            player.pauseVideo();
          }
        }
      } catch (err) {
        console.warn('[YouTubePlayer] Aviso ao executar comando no player:', err);
      }
    };

    const ensurePlayerInitialized = (initialVideoId: string, startSec: number, autoPlay: boolean) => {
      if (readyRef.current && playerRef.current) {
        applyCommandToReadyPlayer(playerRef.current, {
          videoId: initialVideoId,
          startSec,
          autoPlay,
        });
        return;
      }

      pendingCommandRef.current = { videoId: initialVideoId, startSec, autoPlay };
      if (initializingRef.current) return;
      initializingRef.current = true;

      loadYouTubeIframeApi().then(() => {
        if (!wrapperRef.current || !window.YT || typeof window.YT.Player !== 'function') {
          initializingRef.current = false;
          return;
        }

        // Create an isolated child node so React's DOM reconciler never conflicts with YT's iframe replacement
        wrapperRef.current.innerHTML = '';
        const mountNode = document.createElement('div');
        wrapperRef.current.appendChild(mountNode);

        const initCmd = pendingCommandRef.current || {
          videoId: initialVideoId,
          startSec,
          autoPlay,
        };
        currentVideoIdRef.current = initCmd.videoId;

        new window.YT.Player(mountNode, {
          width: '200',
          height: '112',
          videoId: initCmd.videoId,
          host: 'https://www.youtube.com',
          playerVars: {
            autoplay: initCmd.autoPlay ? 1 : 0,
            start: Math.floor(initCmd.startSec || 0),
            controls: 1,
            disablekb: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onReady: (event) => {
              const instance = event.target;
              playerRef.current = instance;
              readyRef.current = true;
              initializingRef.current = false;

              if (typeof instance.setVolume === 'function') {
                instance.setVolume(desiredVolumeRef.current);
              }

              if (pendingCommandRef.current) {
                const cmd = pendingCommandRef.current;
                pendingCommandRef.current = null;
                applyCommandToReadyPlayer(instance, cmd);
              }
            },
            onStateChange: (event) => {
              if (event.data === 0) {
                onEndedRef.current();
              } else if (event.data === 1 && event.target) {
                const dur =
                  typeof event.target.getDuration === 'function'
                    ? event.target.getDuration() || 0
                    : 0;
                if (dur > 0) onDurationChangeRef.current(dur);
              }
            },
          },
        });
      });
    };

    // Single poll timer for progress updates while active
    useEffect(() => {
      const interval = window.setInterval(() => {
        const player = playerRef.current;
        if (readyRef.current && player && activeRef.current) {
          try {
            const state =
              typeof player.getPlayerState === 'function' ? player.getPlayerState() : -1;
            if (state === 1) {
              const cur =
                typeof player.getCurrentTime === 'function' ? player.getCurrentTime() || 0 : 0;
              const dur =
                typeof player.getDuration === 'function' ? player.getDuration() || 0 : 0;
              onTimeUpdateRef.current(cur);
              if (dur > 0) onDurationChangeRef.current(dur);
            }
          } catch {
            // ignore transient iframe errors
          }
        }
      }, 300);

      return () => {
        window.clearInterval(interval);
        if (playerRef.current && typeof playerRef.current.destroy === 'function') {
          try {
            playerRef.current.destroy();
          } catch {
            // ignore
          }
        }
        playerRef.current = null;
        readyRef.current = false;
        initializingRef.current = false;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      loadVideo(videoId: string, startSec: number, autoPlay: boolean) {
        if (!videoId) return;
        ensurePlayerInitialized(videoId, startSec, autoPlay);
      },
      play() {
        const player = playerRef.current;
        if (readyRef.current && player && typeof player.playVideo === 'function') {
          player.playVideo();
        }
      },
      pause() {
        const player = playerRef.current;
        if (readyRef.current && player && typeof player.pauseVideo === 'function') {
          player.pauseVideo();
        }
      },
      seekTo(sec: number) {
        const player = playerRef.current;
        if (readyRef.current && player && typeof player.seekTo === 'function') {
          player.seekTo(sec, true);
        }
      },
      setVolume(vol0to1: number) {
        const vol100 = Math.round(Math.max(0, Math.min(1, vol0to1)) * 100);
        desiredVolumeRef.current = vol100;
        const player = playerRef.current;
        if (readyRef.current && player && typeof player.setVolume === 'function') {
          player.setVolume(vol100);
        }
      },
      getCurrentTime() {
        const player = playerRef.current;
        if (readyRef.current && player && typeof player.getCurrentTime === 'function') {
          return player.getCurrentTime() || 0;
        }
        return 0;
      },
      getDuration() {
        const player = playerRef.current;
        if (readyRef.current && player && typeof player.getDuration === 'function') {
          return player.getDuration() || 0;
        }
        return 0;
      },
    }));

    return (
      <div
        className={`transition-all duration-300 overflow-hidden rounded-lg border border-slate-700/80 bg-black shadow-xl ${
          active
            ? 'w-36 h-20 opacity-100 pointer-events-auto'
            : 'w-0 h-0 opacity-0 pointer-events-none absolute -z-10'
        }`}
        title="Player Embutido Oficial do YouTube (IFrame API)"
      >
        <div ref={wrapperRef} className="w-full h-full" />
      </div>
    );
  }
);
