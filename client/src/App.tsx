import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Plus,
  Sparkles,
  Library,
  ListMusic,
  Radio,
  Users,
  Copy,
  Check,
  Lock,
  Unlock,
  CloudRain,
  Sliders,
  Edit3,
  Trash2,
  Headphones,
  Wifi,
  WifiOff,
  RefreshCw,
  Share2,
  Menu,
  X,
} from 'lucide-react';
import type {
  ConnectionStatus,
  Playlist,
  RepeatMode,
  RoomPlaybackState,
  SceneButton,
  Track,
} from './types';
import {
  api,
  API_BASE_URL,
  getTrackStreamUrl,
  getStoredHostPassword,
  getStoredHostToken,
  setStoredHostPassword,
  setStoredHostToken,
} from './services/api';
import {
  YouTubeEmbedPlayer,
  type YouTubePlayerHandle,
} from './components/YouTubeEmbedPlayer';
import { SceneModal } from './components/SceneModal';
import { LibraryView } from './components/LibraryView';
import { PlaylistEditorView } from './components/PlaylistEditorView';
import { WalrusLogo } from './components/WalrusLogo';
import { InteractiveBackground } from './components/InteractiveBackground';
import { AnimatedPlayButton } from './components/AnimatedPlayButton';

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

function parseInitialRoute(): { isListenerRoute: boolean; roomCode: string } {
  const path = window.location.pathname;
  const match = path.match(/^\/sala\/([A-Za-z0-9_-]+)/i);
  if (match && match[1]) {
    return { isListenerRoute: true, roomCode: match[1].toUpperCase() };
  }
  const params = new URLSearchParams(window.location.search);
  const salaParam = params.get('sala');
  if (salaParam) {
    return { isListenerRoute: true, roomCode: salaParam.toUpperCase() };
  }
  return { isListenerRoute: false, roomCode: 'AB12CD' };
}

export const App: React.FC = () => {
  const initialRoute = parseInitialRoute();

  // Navigation & role state
  const [viewMode, setViewMode] = useState<'scenes' | 'library' | 'playlist' | 'listener'>(
    initialRoute.isListenerRoute ? 'listener' : 'scenes'
  );
  const [isHost, setIsHost] = useState<boolean>(!initialRoute.isListenerRoute);
  const [roomCode, setRoomCode] = useState<string>(initialRoute.roomCode);
  const [listenerUnlocked, setListenerUnlocked] = useState<boolean>(!initialRoute.isListenerRoute);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // Catalog state
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [scenes, setScenes] = useState<SceneButton[]>([]);
  const [maxUploadMb, setMaxUploadMb] = useState<number>(50);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(true);

  // Room & Socket synchronization state
  const [roomState, setRoomState] = useState<RoomPlaybackState | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected');
  const [listenerCount, setListenerCount] = useState<number>(1);
  const [oneWayLatencySec, setOneWayLatencySec] = useState<number>(0);
  const [lastDriftFixedMs, setLastDriftFixedMs] = useState<number | null>(null);

  // Local Playback UI state
  const [displayPositionSec, setDisplayPositionSec] = useState<number>(0);
  const [displayDurationSec, setDisplayDurationSec] = useState<number>(0);
  const [localVolume, setLocalVolume] = useState<number>(1);
  const [localMuted, setLocalMuted] = useState<boolean>(false);
  const [isCrossfading, setIsCrossfading] = useState<boolean>(false);

  // Modals & UI helpers
  const [sceneModalOpen, setSceneModalOpen] = useState<boolean>(false);
  const [editingScene, setEditingScene] = useState<SceneButton | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState<string>('');
  const [creatingPlaylist, setCreatingPlaylist] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState<string>(initialRoute.roomCode);

  // Audio Engine Refs: Dual Deck (A & B) for MP3 Crossfade + Ambient Loop Deck + YouTube IFrame Bridge
  const deckARef = useRef<HTMLAudioElement | null>(null);
  const deckBRef = useRef<HTMLAudioElement | null>(null);
  const activeDeckRef = useRef<'A' | 'B'>('A');
  const activeTrackIdRef = useRef<string | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const autoAdvanceLockRef = useRef<string | null>(null);

  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAmbientIdRef = useRef<string | null>(null);

  const ytPlayerRef = useRef<YouTubePlayerHandle | null>(null);

  // Socket & Clock sync refs
  const socketRef = useRef<Socket | null>(null);
  const oneWayLatencySecRef = useRef<number>(0);
  const isHostRef = useRef<boolean>(isHost);
  const roomStateRef = useRef<RoomPlaybackState | null>(roomState);
  const lastDriftCorrectionRef = useRef<number>(0);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  const lastPacketRef = useRef<{
    basePositionSec: number;
    receivedPerfMs: number;
    isPlaying: boolean;
  }>({
    basePositionSec: 0,
    receivedPerfMs: performance.now(),
    isPlaying: false,
  });

  // Fetch initial catalog (tracks, playlists, scenes)
  const refreshCatalog = useCallback(async () => {
    try {
      const [tracksRes, playlistsRes, scenesRes] = await Promise.all([
        api.getTracks(),
        api.getPlaylists(),
        api.getScenes(),
      ]);
      setTracks(tracksRes.tracks);
      setMaxUploadMb(tracksRes.maxUploadMb || 50);
      setPlaylists(playlistsRes.playlists);
      setScenes(scenesRes.scenes);
    } catch (err) {
      console.error('Erro ao carregar catálogo:', err);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  // Helper to compute target synchronized playback position in seconds
  // Uses oneWayLatencySecRef so latency updates never recreate callbacks or tear down Socket.IO/HTTP timers
  const getExpectedPositionSec = useCallback((): number => {
    const pkt = lastPacketRef.current;
    if (!pkt.isPlaying) {
      return pkt.basePositionSec;
    }
    const clientElapsedSec = Math.max(0, (performance.now() - pkt.receivedPerfMs) / 1000);
    return pkt.basePositionSec + oneWayLatencySecRef.current + clientElapsedSec;
  }, []);

  // Calculate effective volume combining room master volume and listener local volume
  const getEffectiveMusicVolume = useCallback(
    (state: RoomPlaybackState | null): number => {
      if (localMuted) return 0;
      const roomVol = state?.volume ?? 0.85;
      return Math.max(0, Math.min(1, roomVol * localVolume));
    },
    [localMuted, localVolume]
  );

  const getEffectiveAmbientVolume = useCallback(
    (state: RoomPlaybackState | null): number => {
      if (localMuted) return 0;
      const ambVol = state?.ambientVolume ?? 0.35;
      return Math.max(0, Math.min(1, ambVol * localVolume));
    },
    [localMuted, localVolume]
  );

  // Apply room state to Dual-Deck MP3 Engine, YouTube IFrame Player, and Ambient Loop Deck
  const applyPlaybackStateToEngines = useCallback(
    (state: RoomPlaybackState, forceFadeTransition = false, allowHostSeek = false) => {
      if (!listenerUnlocked) return;

      const deckA = deckARef.current;
      const deckB = deckBRef.current;
      if (!deckA || !deckB) return;

      const targetVol = getEffectiveMusicVolume(state);
      const expectedPos = getExpectedPositionSec();
      const track = state.currentTrack;

      // 1. Ambient Sound Layer Synchronization
      const ambAudio = ambientAudioRef.current;
      if (ambAudio) {
        const ambVol = getEffectiveAmbientVolume(state);
        ambAudio.volume = ambVol;
        if (state.ambientTrack && state.ambientTrack.sourceType === 'mp3') {
          const ambUrl = getTrackStreamUrl(state.ambientTrack.id);
          if (activeAmbientIdRef.current !== state.ambientTrack.id) {
            activeAmbientIdRef.current = state.ambientTrack.id;
            ambAudio.src = ambUrl;
            ambAudio.loop = true;
          }
          if (state.ambientIsPlaying) {
            if (ambAudio.paused) {
              ambAudio.play().catch(() => {});
            }
          } else if (!ambAudio.paused) {
            ambAudio.pause();
          }
        } else {
          activeAmbientIdRef.current = null;
          ambAudio.pause();
        }
      }

      // 2. Main Track Playback (MP3 Dual-Deck with Crossfade vs YouTube IFrame API)
      if (!track) {
        deckA.pause();
        deckB.pause();
        ytPlayerRef.current?.pause();
        activeTrackIdRef.current = null;
        return;
      }

      const trackChanged = activeTrackIdRef.current !== track.id;

      if (track.sourceType === 'youtube' && track.youtubeId) {
        // Fade out any playing MP3 decks
        deckA.pause();
        deckB.pause();
        activeTrackIdRef.current = track.id;

        ytPlayerRef.current?.setVolume(targetVol);
        // Never force-seek the Host's already-playing YouTube video unless trackChanged or explicit seek
        const ytTargetSec = trackChanged || allowHostSeek || !isHostRef.current ? expectedPos : -1;
        ytPlayerRef.current?.loadVideo(track.youtubeId, ytTargetSec, state.isPlaying);
        return;
      }

      // Track is MP3: pause YouTube if active
      ytPlayerRef.current?.pause();

      const currentDeck = activeDeckRef.current === 'A' ? deckA : deckB;
      const nextDeck = activeDeckRef.current === 'A' ? deckB : deckA;

      if (trackChanged) {
        const hadPreviousTrack = activeTrackIdRef.current !== null;
        activeTrackIdRef.current = track.id;
        autoAdvanceLockRef.current = null;

        const fadeSeconds = forceFadeTransition
          ? Math.max(1.5, state.crossfadeSec)
          : state.crossfadeSec;

        if (hadPreviousTrack && fadeSeconds > 0 && !currentDeck.paused) {
          // Crossfade from currentDeck -> nextDeck
          activeDeckRef.current = activeDeckRef.current === 'A' ? 'B' : 'A';
          nextDeck.src = getTrackStreamUrl(track.id);
          nextDeck.currentTime = expectedPos;
          nextDeck.volume = 0;

          if (state.isPlaying) {
            nextDeck.play().catch(() => {});
          }

          if (fadeTimerRef.current) {
            window.clearInterval(fadeTimerRef.current);
          }

          setIsCrossfading(true);
          const steps = 25;
          const stepMs = (fadeSeconds * 1000) / steps;
          const startOutgoingVol = currentDeck.volume;
          let step = 0;

          fadeTimerRef.current = window.setInterval(() => {
            step++;
            const progress = Math.min(1, step / steps);
            currentDeck.volume = Math.max(0, startOutgoingVol * (1 - progress));
            nextDeck.volume = Math.min(1, getEffectiveMusicVolume(state) * progress);

            if (progress >= 1) {
              if (fadeTimerRef.current) window.clearInterval(fadeTimerRef.current);
              fadeTimerRef.current = null;
              currentDeck.pause();
              setIsCrossfading(false);
            }
          }, stepMs);
        } else {
          // Direct switch on currentDeck
          if (fadeTimerRef.current) {
            window.clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
            setIsCrossfading(false);
          }
          nextDeck.pause();
          currentDeck.src = getTrackStreamUrl(track.id);
          currentDeck.volume = targetVol;
          currentDeck.onloadedmetadata = () => {
            if (expectedPos > 0 && Math.abs(currentDeck.currentTime - expectedPos) > 1.5) {
              currentDeck.currentTime = expectedPos;
            }
          };
          if (state.isPlaying) {
            currentDeck.play().catch(() => {});
          } else {
            currentDeck.pause();
          }
        }
      } else {
        // Same MP3 track: update volume, play/pause, and only seek on explicit host seek or listener drift > 2.5s
        if (!fadeTimerRef.current) {
          currentDeck.volume = targetVol;
        }
        const drift = Math.abs(currentDeck.currentTime - expectedPos);
        const nowMs = Date.now();
        if (
          currentDeck.readyState >= 1 &&
          (allowHostSeek ||
            (!isHostRef.current &&
              drift > 2.5 &&
              nowMs - lastDriftCorrectionRef.current > 4000))
        ) {
          currentDeck.currentTime = expectedPos;
          lastDriftCorrectionRef.current = nowMs;
          setLastDriftFixedMs(nowMs);
        }
        if (state.isPlaying && currentDeck.paused) {
          currentDeck.play().catch(() => {});
        } else if (!state.isPlaying && !currentDeck.paused) {
          currentDeck.pause();
        }
      }
    },
    [
      getEffectiveAmbientVolume,
      getEffectiveMusicVolume,
      getExpectedPositionSec,
      listenerUnlocked,
    ]
  );

  // Unified handler to ingest RoomPlaybackState from either Socket.IO or HTTP REST
  const applyIncomingRoomState = useCallback(
    (incoming: RoomPlaybackState, allowHostSeek = false) => {
      lastPacketRef.current = {
        basePositionSec: incoming.positionSec,
        receivedPerfMs: performance.now(),
        isPlaying: incoming.isPlaying,
      };
      setRoomState((prev) => {
        const sceneChanged = prev?.activeSceneId !== incoming.activeSceneId;
        window.setTimeout(() => {
          applyPlaybackStateToEngines(incoming, sceneChanged, allowHostSeek);
        }, 0);
        return incoming;
      });
      setListenerCount(incoming.listenerCount || 1);
      if (!incoming.isPlaying || allowHostSeek) {
        setDisplayPositionSec(incoming.positionSec);
      }
      if (incoming.currentTrack?.durationSec) {
        setDisplayDurationSec(incoming.currentTrack.durationSec);
      }
    },
    [applyPlaybackStateToEngines]
  );

  // Send host command via Socket.IO when connected, or via HTTP REST fallback (Serverless / Vercel)
  const sendHostCommand = useCallback(
    (
      action:
        | 'play'
        | 'pause'
        | 'seek'
        | 'set_track'
        | 'set_playlist'
        | 'trigger_scene'
        | 'next'
        | 'prev'
        | 'set_volume'
        | 'set_shuffle'
        | 'set_repeat'
        | 'set_crossfade'
        | 'set_ambient'
        | 'sync_heartbeat',
      extra: Record<string, unknown> = {}
    ) => {
      const isExplicitSeek = action === 'seek';

      // Immediately apply seek locally on the Host so the progress bar and audio respond with zero lag
      if (isExplicitSeek && typeof extra.positionSec === 'number') {
        const targetSec = Math.max(0, extra.positionSec);
        setDisplayPositionSec(targetSec);
        lastPacketRef.current = {
          basePositionSec: targetSec,
          receivedPerfMs: performance.now(),
          isPlaying: roomStateRef.current?.isPlaying ?? false,
        };
        const currentTrack = roomStateRef.current?.currentTrack;
        if (currentTrack?.sourceType === 'mp3') {
          const activeDeck =
            activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
          if (activeDeck && activeDeck.readyState >= 1) {
            activeDeck.currentTime = targetSec;
          }
        } else if (currentTrack?.sourceType === 'youtube') {
          ytPlayerRef.current?.seekTo(targetSec);
        }
      }

      if (socketRef.current?.connected) {
        socketRef.current.emit('host:command', {
          code: roomCode,
          password: getStoredHostPassword(),
          hostToken: getStoredHostToken(),
          action,
          ...extra,
        });
        return;
      }

      api
        .sendRoomCommand(roomCode, { action, ...extra })
        .then((res) => {
          if (res.ok && res.state) {
            setConnStatus('connected');
            // Ignore delayed heartbeat echo on the Host to prevent audio micro-jumps
            if (action !== 'sync_heartbeat') {
              applyIncomingRoomState(res.state, isExplicitSeek);
            }
          }
        })
        .catch((err) => {
          console.error('Erro ao enviar comando para a sala:', err);
        });
    },
    [roomCode, applyIncomingRoomState]
  );

  // Connect Socket.IO to backend (Railway / local) + HTTP REST synchronization fallback
  useEffect(() => {
    let isDisposed = false;
    let initialAuthChecked = false;

    const syncViaHttp = async () => {
      const startedAt = Date.now();
      try {
        const res = await api.getRoom(roomCode);
        if (isDisposed || !res.state) return;

        const rttMs = Math.max(0, Date.now() - startedAt);
        oneWayLatencySecRef.current = rttMs / 2000;
        setOneWayLatencySec(rttMs / 2000);
        setConnStatus('connected');

        if (res.hostToken) {
          setStoredHostToken(res.hostToken);
        }

        const wasInitial = !initialAuthChecked;
        if (wasInitial) {
          initialAuthChecked = true;
          if (!res.isHost) {
            setIsHost(false);
            setViewMode('listener');
            if (!initialRoute.isListenerRoute) {
              setAuthModalOpen(true);
            }
          } else if (!initialRoute.isListenerRoute) {
            setIsHost(true);
          }
        }

        // If this client is the active Host and already has roomState loaded, only update listenerCount on background polls
        if (!wasInitial && isHostRef.current && roomStateRef.current) {
          setListenerCount(res.state.listenerCount || 1);
          return;
        }

        applyIncomingRoomState(res.state, false);
      } catch {
        if (!isDisposed && !socketRef.current?.connected) {
          setConnStatus('reconnecting');
        }
      }
    };

    // Perform immediate HTTP fetch so room state & auth load right away
    syncViaHttp();

    // Poll every 1.5s whenever Socket.IO is not actively connected (e.g. Vercel Serverless)
    const httpSyncInterval = window.setInterval(() => {
      if (!socketRef.current?.connected) {
        syncViaHttp();
      }
    }, 1500);

    // On pure Vercel serverless (no external WS URL), rely 100% on fast HTTP polling to avoid WS connection errors in console
    const isVercelDeployment =
      typeof window !== 'undefined' &&
      window.location.hostname.endsWith('.vercel.app') &&
      !API_BASE_URL;

    if (isVercelDeployment) {
      socketRef.current = null;
      return () => {
        isDisposed = true;
        window.clearInterval(httpSyncInterval);
      };
    }

    const socket = io(API_BASE_URL || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });
    socketRef.current = socket;

    const joinCurrentRoom = () => {
      socket.emit(
        'room:join',
        {
          code: roomCode,
          password: getStoredHostPassword(),
          hostToken: getStoredHostToken(),
        },
        (res: {
          ok: boolean;
          state?: RoomPlaybackState;
          isHost?: boolean;
          hostToken?: string;
        }) => {
          if (res?.ok && res.state) {
            if (res.hostToken) setStoredHostToken(res.hostToken);
            if (!res.isHost) {
              setIsHost(false);
              setViewMode('listener');
              if (!initialRoute.isListenerRoute) {
                setAuthModalOpen(true);
              }
            } else if (!initialRoute.isListenerRoute) {
              setIsHost(true);
            }
            applyIncomingRoomState(res.state, false);
          }
        }
      );
    };

    socket.on('connect', () => {
      setConnStatus('connected');
      joinCurrentRoom();
      socket.emit('clock:ping', { clientSentAt: Date.now() });
    });

    socket.on('clock:pong', (payload: { clientSentAt: number; serverNow: number }) => {
      const rttMs = Math.max(0, Date.now() - payload.clientSentAt);
      oneWayLatencySecRef.current = rttMs / 2000;
      setOneWayLatencySec(rttMs / 2000);
    });

    socket.on('room:listeners', (payload: { code: string; listenerCount: number }) => {
      if (payload.code === roomCode) {
        setListenerCount(payload.listenerCount);
      }
    });

    socket.on('room:state', (incoming: RoomPlaybackState) => {
      applyIncomingRoomState(incoming, false);
    });

    const pingInterval = window.setInterval(() => {
      if (socket.connected) {
        socket.emit('clock:ping', { clientSentAt: Date.now() });
      }
    }, 10000);

    return () => {
      isDisposed = true;
      window.clearInterval(httpSyncInterval);
      window.clearInterval(pingInterval);
      socket.disconnect();
    };
  }, [roomCode, applyIncomingRoomState]);

  // Re-apply volumes whenever localVolume, localMuted, or listenerUnlocked changes
  useEffect(() => {
    if (roomStateRef.current && listenerUnlocked) {
      applyPlaybackStateToEngines(roomStateRef.current, false, false);
    }
  }, [localVolume, localMuted, listenerUnlocked, applyPlaybackStateToEngines]);

  // Periodic UI progress ticker + Listener drift checker (~2.5s threshold with 4s cooldown) + Host crossfade auto-advance
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!roomState || !roomState.currentTrack) return;

      const activeDeck =
        activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;

      if (roomState.currentTrack.sourceType === 'mp3' && activeDeck) {
        const cur = activeDeck.currentTime || 0;
        const dur =
          Number.isFinite(activeDeck.duration) && activeDeck.duration > 0
            ? activeDeck.duration
            : roomState.currentTrack.durationSec || 0;

        if (roomState.isPlaying) {
          setDisplayPositionSec(cur);
        }
        if (dur > 0) {
          setDisplayDurationSec(dur);
        }

        // Listener drift check (> 2.5s with 4s cooldown)
        const nowMs = Date.now();
        if (
          !isHost &&
          listenerUnlocked &&
          roomState.isPlaying &&
          activeDeck.readyState >= 2 &&
          nowMs - lastDriftCorrectionRef.current > 4000
        ) {
          const expected = getExpectedPositionSec();
          if (dur === 0 || expected < dur - 0.5) {
            if (Math.abs(cur - expected) > 2.5) {
              activeDeck.currentTime = expected;
              lastDriftCorrectionRef.current = nowMs;
              setLastDriftFixedMs(nowMs);
            }
          }
        }

        // Host crossfade trigger shortly before track ends
        if (
          isHost &&
          roomState.isPlaying &&
          dur > 4 &&
          roomState.crossfadeSec > 0 &&
          dur - cur <= roomState.crossfadeSec &&
          autoAdvanceLockRef.current !== roomState.currentTrack.id
        ) {
          autoAdvanceLockRef.current = roomState.currentTrack.id;
          sendHostCommand('next', { positionSec: cur });
        }
      } else if (roomState.currentTrack.sourceType === 'youtube' && ytPlayerRef.current) {
        const cur = ytPlayerRef.current.getCurrentTime();
        const dur = ytPlayerRef.current.getDuration();
        if (roomState.isPlaying && cur > 0) {
          setDisplayPositionSec(cur);
        }
        if (dur > 0) {
          setDisplayDurationSec(dur);
        }

        const nowMs = Date.now();
        if (
          !isHost &&
          listenerUnlocked &&
          roomState.isPlaying &&
          dur > 0 &&
          nowMs - lastDriftCorrectionRef.current > 4000
        ) {
          const expected = getExpectedPositionSec();
          if (Math.abs(cur - expected) > 2.5) {
            ytPlayerRef.current.seekTo(expected);
            lastDriftCorrectionRef.current = nowMs;
            setLastDriftFixedMs(nowMs);
          }
        }
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [roomState, isHost, listenerUnlocked, getExpectedPositionSec, sendHostCommand]);

  // Host periodic sync heartbeat every 5s while playing
  useEffect(() => {
    if (!isHost || !roomState?.isPlaying) return;
    const hb = window.setInterval(() => {
      const activeDeck =
        activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
      if (roomState.currentTrack?.sourceType === 'mp3' && activeDeck && !activeDeck.paused) {
        sendHostCommand('sync_heartbeat', { positionSec: activeDeck.currentTime });
      } else if (roomState.currentTrack?.sourceType === 'youtube' && ytPlayerRef.current) {
        sendHostCommand('sync_heartbeat', {
          positionSec: ytPlayerRef.current.getCurrentTime(),
        });
      }
    }, 5000);
    return () => window.clearInterval(hb);
  }, [isHost, roomState?.isPlaying, roomState?.currentTrack, sendHostCommand]);

  // Keyboard shortcuts (1 to 9) to trigger scenes for the Host
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isHost) return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        const matchScene =
          scenes.find((s) => s.shortcutKey === num) || scenes[num - 1];
        if (matchScene) {
          e.preventDefault();
          setListenerUnlocked(true);
          sendHostCommand('trigger_scene', { sceneId: matchScene.id });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHost, scenes, sendHostCommand]);

  // Unlock browser autoplay ("Entrar e ouvir")
  const handleUnlockListenerAudio = () => {
    setListenerUnlocked(true);
    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    const amb = ambientAudioRef.current;
    if (deckA) deckA.play().then(() => deckA.pause()).catch(() => {});
    if (deckB) deckB.play().then(() => deckB.pause()).catch(() => {});
    if (amb) amb.play().then(() => amb.pause()).catch(() => {});
    if (roomState) {
      window.setTimeout(() => applyPlaybackStateToEngines(roomState, false), 50);
    }
  };

  // Copy shareable listener room URL
  const handleCopyShareLink = () => {
    const url = `${window.location.origin}/sala/${roomCode}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Create a brand new room with short code
  const handleCreateNewRoom = async () => {
    try {
      const { state, hostToken } = await api.createRoom();
      setStoredHostToken(hostToken);
      setRoomCode(state.code);
      setJoinCodeInput(state.code);
      setIsHost(true);
      window.history.pushState({}, '', `/`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao criar sala.');
    }
  };

  // Create new playlist from sidebar
  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    try {
      const { playlist } = await api.createPlaylist({ name: newPlaylistName.trim() });
      setNewPlaylistName('');
      setCreatingPlaylist(false);
      await refreshCatalog();
      setSelectedPlaylistId(playlist.id);
      setViewMode('playlist');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao criar playlist.');
    }
  };

  // Verify host password in modal
  const handleHostLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = await api.verifyHostAuth(passwordInput, roomCode);
      if (res.valid) {
        setStoredHostPassword(passwordInput);
        if (res.hostToken) setStoredHostToken(res.hostToken);
        setPasswordInput('');
        setIsHost(true);
        setListenerUnlocked(true);
        setConnStatus('connected');
        setAuthModalOpen(false);
        if (res.state) {
          applyIncomingRoomState(res.state);
        }
        if (viewMode === 'listener') setViewMode('scenes');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Senha inválida.');
    }
  };

  const activeScene = scenes.find((s) => s.id === roomState?.activeSceneId) || null;
  const activePlaylist =
    playlists.find((p) => p.id === (selectedPlaylistId || roomState?.activePlaylistId)) ||
    playlists[0] ||
    null;

  return (
    <div className="h-screen flex flex-col bg-[#0e0e0e] text-[#f0f4f5] select-none font-sans relative overflow-hidden">
      {/* Escannord Hard-Rabbit-4 Reactive Dotted Background */}
      <InteractiveBackground />
      {/* Hidden Dual-Deck HTML5 Audio Elements + Ambient Loop Element */}
      <audio
        ref={deckARef}
        preload="auto"
        onEnded={() => {
          if (isHost && activeDeckRef.current === 'A') {
            sendHostCommand('next', { positionSec: 0 });
          }
        }}
      />
      <audio
        ref={deckBRef}
        preload="auto"
        onEnded={() => {
          if (isHost && activeDeckRef.current === 'B') {
            sendHostCommand('next', { positionSec: 0 });
          }
        }}
      />
      <audio ref={ambientAudioRef} preload="auto" loop />

      {/* Top Navigation & Live Room Bar */}
      <header className="sticky top-0 z-30 border-b border-[#24242b] bg-[#0e0e0e]/95 backdrop-blur-md px-4 lg:px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Mobile Menu Toggle */}
          <div className="flex items-center gap-3">
            {isHost && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="taste-btn lg:hidden rounded-lg border border-[#2a2a33] bg-[#141417] p-2 text-[#f0f4f5] hover:bg-[#23232a]"
                title={sidebarOpen ? 'Fechar menu lateral' : 'Abrir menu de playlists'}
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            )}

            <div
              onClick={() => setViewMode(isHost ? 'scenes' : 'listener')}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="taste-btn group-hover:scale-105 transition flex items-center justify-center">
                <WalrusLogo size={36} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-sans text-base font-extrabold tracking-tight text-[#f0f4f5] leading-none">
                    AMBIÊNCIA
                  </h1>
                  {/* Micro color dots badge from reference image */}
                  <div className="flex items-center gap-1 bg-[#1a1a1f] px-1.5 py-0.5 rounded-full border border-[#2a2a33]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2563eb]"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#cc001e]"></span>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-[#cbd5e1] tracking-wide">
                  Design Edge Audio Engine
                </span>
              </div>
            </div>
          </div>

          {/* Center View Switcher Tabs */}
          <nav className="flex items-center gap-1 rounded-lg bg-[#141417] p-1 border border-[#2a2a33]">
            {isHost && (
              <>
                <button
                  onClick={() => setViewMode('scenes')}
                  className={`taste-btn flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition ${
                    viewMode === 'scenes'
                      ? 'bg-[#cc001e] text-white shadow-brand-glow-sm'
                      : 'text-[#f0f4f5] bg-[#1a1a1f] hover:bg-[#25252d]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Cenas</span>
                </button>

                <button
                  onClick={() => setViewMode('playlist')}
                  className={`taste-btn flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition ${
                    viewMode === 'playlist'
                      ? 'bg-[#cc001e] text-white shadow-brand-glow-sm'
                      : 'text-[#f0f4f5] bg-[#1a1a1f] hover:bg-[#25252d]'
                  }`}
                >
                  <ListMusic className="w-3.5 h-3.5" />
                  <span>Playlists</span>
                </button>

                <button
                  onClick={() => setViewMode('library')}
                  className={`taste-btn flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition ${
                    viewMode === 'library'
                      ? 'bg-[#cc001e] text-white shadow-brand-glow-sm'
                      : 'text-[#f0f4f5] bg-[#1a1a1f] hover:bg-[#25252d]'
                  }`}
                >
                  <Library className="w-3.5 h-3.5" />
                  <span>Biblioteca</span>
                </button>
              </>
            )}

            <button
              onClick={() => setViewMode('listener')}
              className={`taste-btn flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition ${
                viewMode === 'listener'
                  ? 'bg-[#f0f4f5] text-[#0e0e0e] shadow-sm'
                  : 'text-[#f0f4f5] bg-[#1a1a1f] hover:bg-[#25252d]'
              }`}
            >
              <Headphones className="w-3.5 h-3.5 text-[#cc001e]" />
              <span>Modo Ouvinte</span>
            </button>
          </nav>

          {/* Right Room Sync & Host Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Connection Status Pill */}
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                connStatus === 'connected'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : connStatus === 'reconnecting'
                  ? 'border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#f59e0b]'
                  : 'border-[#cc001e]/30 bg-[#cc001e]/10 text-[#cc001e]'
              }`}
            >
              {connStatus === 'connected' ? (
                <Wifi className="w-3 h-3" />
              ) : connStatus === 'reconnecting' ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              <span>
                {connStatus === 'connected'
                  ? 'Sincronizado'
                  : connStatus === 'reconnecting'
                  ? 'Reconectando...'
                  : 'Desconectado'}
              </span>
            </div>

            {/* Listener Count Pill */}
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-[#2a2a33] bg-[#141417] px-3 py-1 text-xs text-[#f0f4f5]"
              title="Ouvintes conectados nesta sala em tempo real"
            >
              <Users className="w-3.5 h-3.5 text-[#cc001e]" />
              <span className="font-mono font-bold">{listenerCount}</span>
              <span className="hidden sm:inline text-[#cbd5e1] text-[11px]">
                {listenerCount === 1 ? 'ouvinte' : 'ouvintes'}
              </span>
            </div>

            {/* Room Code & Share Link */}
            <div className="flex items-center rounded-lg border border-[#2a2a33] bg-[#141417] overflow-hidden">
              <span className="px-3 py-1 text-xs font-mono font-bold text-[#cc001e] tracking-wider">
                /sala/{roomCode}
              </span>
              <button
                onClick={handleCopyShareLink}
                className="taste-btn border-l border-[#2a2a33] px-3 py-1 text-xs text-[#f0f4f5] hover:bg-[#cc001e] hover:text-white transition flex items-center gap-1.5"
                title="Copiar link para ouvintes"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 text-[#cc001e]" />
                    <span className="hidden sm:inline">Compartilhar</span>
                  </>
                )}
              </button>
            </div>

            {isHost && (
              <button
                onClick={handleCreateNewRoom}
                className="taste-btn rounded-lg border border-[#2a2a33] bg-[#141417] hover:bg-[#23232a] px-3 py-1 text-xs text-[#cbd5e1] hover:text-[#f0f4f5]"
                title="Gerar nova sala com código curto"
              >
                + Nova Sala
              </button>
            )}

            {/* Host Mode Toggle */}
            <button
              onClick={() => {
                if (isHost) {
                  setIsHost(false);
                  setViewMode('listener');
                } else {
                  setAuthModalOpen(true);
                }
              }}
              className={`taste-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold border transition ${
                isHost
                  ? 'border-[#cc001e] bg-[#cc001e]/15 text-white shadow-brand-glow-sm'
                  : 'border-[#2a2a33] bg-[#141417] text-[#cbd5e1] hover:text-[#f0f4f5] hover:border-[#3d3d47]'
              }`}
              title={
                isHost
                  ? 'Modo Anfitrião ativo (clique para simular visão de Ouvinte)'
                  : 'Autenticar como Anfitrião (Mestre)'
              }
            >
              {isHost ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-[#cc001e]" />
                  <span className="hidden md:inline">Anfitrião Ativo</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-[#cbd5e1]" />
                  <span className="hidden md:inline">Painel do Mestre</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Middle Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative z-10">
        {/* Left Sidebar Overlay & Adaptive Docked Panel */}
        {isHost && (
          <>
            {/* Mobile / Tablet Backdrop */}
            {sidebarOpen && (
              <div
                onClick={() => setSidebarOpen(false)}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200"
                aria-hidden="true"
              />
            )}

            <aside
              className={`
                fixed inset-y-0 left-0 z-50 w-72 sm:w-80 bg-[#0e0e0e] border-r border-[#24242b] p-4 pb-28 lg:pb-32 overflow-y-auto space-y-6 shadow-2xl transition-transform duration-300 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                lg:translate-x-0 lg:static lg:block lg:shadow-none lg:z-auto lg:h-full
                lg:w-64 xl:w-72 2xl:w-80 shrink-0
              `}
            >
              {/* Mobile Drawer Header */}
              <div className="flex lg:hidden items-center justify-between pb-3 border-b border-[#24242b]">
                <div className="flex items-center gap-2.5">
                  <WalrusLogo size={28} />
                  <span className="font-sans text-xs font-extrabold text-[#f0f4f5]">Menu do Mestre</span>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="taste-btn p-1.5 rounded-lg bg-[#1a1a1f] text-[#f0f4f5] hover:bg-[#25252d]"
                  title="Fechar menu lateral"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            {/* Playlists Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#cbd5e1] flex items-center gap-1.5">
                  <ListMusic className="w-4 h-4 text-[#cc001e]" />
                  <span>Playlists ({playlists.length})</span>
                </h2>
                <button
                  onClick={() => setCreatingPlaylist(!creatingPlaylist)}
                  className="taste-btn rounded-md bg-[#cc001e]/15 border border-[#cc001e]/30 px-2.5 py-1 text-xs font-bold text-[#cc001e] hover:bg-[#cc001e] hover:text-white transition flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Nova
                </button>
              </div>

              {creatingPlaylist && (
                <form onSubmit={handleCreatePlaylist} className="mb-3 flex gap-1.5">
                  <input
                    type="text"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="Nome da playlist..."
                    className="flex-1 rounded-md border border-[#2a2a33] bg-[#141417] px-3 py-1.5 text-xs text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="taste-btn rounded-md bg-[#cc001e] px-3 py-1.5 text-xs font-bold text-white shadow-brand-glow-sm"
                  >
                    Criar
                  </button>
                </form>
              )}

              <div className="space-y-1.5">
                {playlists.map((pl) => {
                  const isPlayingPl = roomState?.activePlaylistId === pl.id;
                  const isSelected =
                    viewMode === 'playlist' && activePlaylist?.id === pl.id;

                  return (
                    <div
                      key={pl.id}
                      onClick={() => {
                        setSelectedPlaylistId(pl.id);
                        setViewMode('playlist');
                        setSidebarOpen(false);
                      }}
                      className={`taste-card group rounded-lg border px-3.5 py-2.5 cursor-pointer transition flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'border-[#cc001e] bg-[#cc001e]/15 text-white shadow-brand-glow-sm'
                          : isPlayingPl
                          ? 'border-[#cc001e]/50 bg-[#141417] text-[#f0f4f5]'
                          : 'border-[#24242b] bg-[#141417] hover:bg-[#1f1f26] text-[#f0f4f5]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isPlayingPl && (
                            <span className="w-2 h-2 rounded-full bg-[#cc001e] animate-pulse shrink-0" />
                          )}
                          <p className="text-xs font-bold truncate text-[#f0f4f5]">{pl.name}</p>
                        </div>
                        <p className="text-[10px] font-mono text-[#cbd5e1] mt-0.5">
                          {pl.tracks.length} {pl.tracks.length === 1 ? 'faixa' : 'faixas'}
                        </p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setListenerUnlocked(true);
                          sendHostCommand('set_playlist', { playlistId: pl.id });
                        }}
                        className="opacity-100 w-7 h-7 rounded-md bg-[#23232a] hover:bg-[#cc001e] hover:text-white flex items-center justify-center text-[#cbd5e1] transition shrink-0"
                        title="Tocar esta playlist na sala"
                      >
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ambient Sound Layer Mixer */}
            <div className="taste-card rounded-md border border-[#2a2a33] bg-[#141417] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#cc001e] flex items-center gap-1.5">
                  <CloudRain className="w-4 h-4 text-[#cc001e]" />
                  Camada Ambiente (Loop)
                </span>
                <button
                  onClick={() => {
                    setListenerUnlocked(true);
                    sendHostCommand('set_ambient', {
                      ambientIsPlaying: !roomState?.ambientIsPlaying,
                    });
                  }}
                  disabled={!roomState?.ambientTrack}
                  className={`taste-btn px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition ${
                    roomState?.ambientIsPlaying
                      ? 'bg-[#cc001e] text-white shadow-brand-glow-sm'
                      : 'bg-[#23232a] text-[#cbd5e1] hover:text-white disabled:opacity-40'
                  }`}
                >
                  {roomState?.ambientIsPlaying ? 'Ativo' : 'Pausa'}
                </button>
              </div>

              <select
                value={roomState?.ambientTrack?.id || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setListenerUnlocked(true);
                  sendHostCommand('set_ambient', {
                    ambientTrackId: val || null,
                    ambientIsPlaying: Boolean(val),
                  });
                }}
                className="w-full rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-3 py-2 text-xs text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none"
              >
                <option value="">-- Nenhum som ambiente --</option>
                {tracks
                  .filter((t) => t.sourceType === 'mp3')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.isAmbient ? '🌧️ ' : '🎵 '}
                      {t.title}
                    </option>
                  ))}
              </select>

              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[11px] text-[#cbd5e1]">
                  <span>Volume Ambiente</span>
                  <span className="font-mono text-[#f0f4f5]">
                    {Math.round((roomState?.ambientVolume ?? 0.35) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={roomState?.ambientVolume ?? 0.35}
                  onChange={(e) =>
                    sendHostCommand('set_ambient', {
                      ambientVolume: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-[#cc001e] cursor-pointer"
                />
              </div>
            </div>

            {/* Crossfade Configuration Card */}
            <div className="taste-card rounded-md border border-[#2a2a33] bg-[#141417] p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#cc001e] flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  Crossfade MP3
                </span>
                <span className="text-xs font-mono font-bold text-[#f0f4f5]">
                  {roomState?.crossfadeSec ?? 3}s
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={roomState?.crossfadeSec ?? 3}
                onChange={(e) =>
                  sendHostCommand('set_crossfade', {
                    crossfadeSec: parseInt(e.target.value, 10),
                  })
                }
                className="w-full accent-[#cc001e] cursor-pointer"
              />
              <p className="text-[10px] text-[#cbd5e1] leading-relaxed">
                Transição contínua com fade out e fade in entre faixas e cenas.
              </p>
            </div>
          </aside>
          </>
        )}

        {/* Central Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full pb-28 lg:pb-32">
          {loadingCatalog ? (
            <div className="flex flex-col items-center justify-center py-24 text-[#cbd5e1] gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-[#cc001e]" />
              <p className="text-sm font-semibold">Carregando estúdio Ambiência...</p>
            </div>
          ) : viewMode === 'scenes' && isHost ? (
            /* ==================== SCENE PAD VIEW ==================== */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-sans text-2xl font-extrabold tracking-tight text-[#f0f4f5] flex items-center gap-3">
                    <span>Painel de Cenas (Situações)</span>
                    {isCrossfading && (
                      <span className="text-xs font-mono rounded-full bg-[#cc001e]/20 border border-[#cc001e]/40 text-[#f0f4f5] px-3 py-0.5 animate-pulse">
                        Crossfade ativo...
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-[#cbd5e1] mt-1">
                    Dispare cenas instantaneamente no clique ou teclas <kbd className="px-2 py-0.5 rounded-lg bg-[#1a1a1f] border border-[#2a2a33] font-mono text-[#f0f4f5]">1</kbd> a <kbd className="px-2 py-0.5 rounded-lg bg-[#1a1a1f] border border-[#2a2a33] font-mono text-[#f0f4f5]">9</kbd>.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setEditingScene(null);
                    setSceneModalOpen(true);
                  }}
                  className="taste-btn inline-flex items-center gap-2 rounded-lg bg-[#cc001e] hover:bg-[#e00022] text-white font-bold px-5 py-2.5 text-xs shadow-brand-glow transition self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  Novo Botão de Cena
                </button>
              </div>

              {scenes.length === 0 ? (
                <div className="rounded-md border border-[#2a2a33] bg-[#141417]/50 p-12 text-center">
                  <Sparkles className="w-8 h-8 text-[#cc001e] mx-auto mb-2" />
                  <p className="text-sm text-[#f0f4f5] font-bold">
                    Nenhum botão de cena cadastrado
                  </p>
                  <p className="text-xs text-[#cbd5e1] mt-1">
                    Crie botões como 🌲 Floresta, ⚔️ Batalha ou 🏰 Taverna para engajar sua mesa.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {scenes.map((scene, index) => {
                    const isActive =
                      roomState?.activeSceneId === scene.id && roomState?.isPlaying;
                    const isSelectedScene = roomState?.activeSceneId === scene.id;
                    const linkedPlaylist = playlists.find((p) => p.id === scene.playlistId);
                    const linkedAmbient = tracks.find((t) => t.id === scene.ambientTrackId);
                    const shortcut = scene.shortcutKey ?? (index < 9 ? index + 1 : null);

                    return (
                      <div
                        key={scene.id}
                        onClick={() => {
                          setListenerUnlocked(true);
                          sendHostCommand('trigger_scene', { sceneId: scene.id });
                        }}
                        style={{
                          borderColor: isSelectedScene ? '#cc001e' : undefined,
                          boxShadow: isActive
                            ? `0 0 32px -4px rgba(204, 0, 30, 0.6)`
                            : undefined,
                        }}
                        className={`taste-card group relative rounded-md border-2 p-5 cursor-pointer transition-all duration-200 overflow-hidden ${
                          isActive
                            ? 'bg-[#1b1417] border-[#cc001e] scene-active-glow'
                            : isSelectedScene
                            ? 'bg-[#181518] border-[#cc001e]'
                            : 'border-[#24242b] bg-[#141417] hover:border-[#3d3d47] hover:bg-[#19191e]'
                        }`}
                      >
                        {/* Subtle red spotlight glow */}
                        <div
                          className="pointer-events-none absolute -right-6 -top-6 w-32 h-32 rounded-full blur-2xl opacity-20 group-hover:opacity-35 transition"
                          style={{ backgroundColor: scene.color || '#cc001e' }}
                        />

                        <div className="relative z-10 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3.5">
                            <div
                              className="w-14 h-14 rounded-lg flex items-center justify-center text-3xl shadow-inner border border-white/10 bg-[#0e0e0e]"
                            >
                              {scene.emoji}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-sans text-base font-extrabold text-[#f0f4f5]">
                                  {scene.name}
                                </h3>
                                {isActive && (
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-[#cc001e] text-white shadow-brand-glow-sm"
                                  >
                                    No Ar
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[#cbd5e1] mt-0.5 truncate max-w-[180px]">
                                {linkedPlaylist
                                  ? `🎵 ${linkedPlaylist.name}`
                                  : 'Sem playlist associada'}
                              </p>
                              {linkedAmbient && (
                                <p className="text-[11px] text-[#cc001e] mt-0.5 truncate max-w-[180px] font-medium">
                                  🌧️ + {linkedAmbient.title}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            {shortcut && (
                              <span
                                className="w-7 h-7 rounded-md border border-[#2a2a33] bg-[#0e0e0e] text-xs font-mono font-bold text-[#f0f4f5] flex items-center justify-center shadow-sm"
                                title={`Atalho: Tecla ${shortcut}`}
                              >
                                {shortcut}
                              </span>
                            )}

                            <div
                              className="flex items-center gap-1 opacity-100 transition"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => {
                                  setEditingScene(scene);
                                  setSceneModalOpen(true);
                                }}
                                className="taste-btn p-1.5 rounded-md bg-[#0e0e0e] text-[#cbd5e1] hover:text-[#f0f4f5] border border-[#2a2a33]"
                                title="Editar cena"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={async () => {
                                  if (
                                    window.confirm(`Deseja excluir a cena "${scene.name}"?`)
                                  ) {
                                    await api.deleteScene(scene.id);
                                    await refreshCatalog();
                                  }
                                }}
                                className="taste-btn p-1.5 rounded-md bg-[#0e0e0e] text-[#cc001e] hover:bg-[#cc001e]/20 border border-[#2a2a33]"
                                title="Excluir cena"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Current Queue Quick View */}
              {roomState && roomState.queue.length > 0 && (
                <div className="taste-card rounded-md border border-[#2a2a33] bg-[#141417] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#cbd5e1]">
                      Fila da Playlist Atual ({roomState.queue.length} faixas)
                    </h3>
                    {activePlaylist && (
                      <button
                        onClick={() => {
                          setSelectedPlaylistId(activePlaylist.id);
                          setViewMode('playlist');
                        }}
                        className="text-xs font-semibold text-[#cc001e] hover:underline"
                      >
                        Editar ou reordenar playlist →
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {roomState.queue.map((track, i) => {
                      const isCurrent = roomState.currentTrack?.id === track.id;
                      return (
                        <div
                          key={`${track.id}-${i}`}
                          onClick={() => {
                            setListenerUnlocked(true);
                            sendHostCommand('set_track', { trackId: track.id });
                          }}
                          className={`taste-card flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 cursor-pointer transition ${
                            isCurrent
                              ? 'border-[#cc001e] bg-[#cc001e]/15 text-[#f0f4f5] shadow-brand-glow-sm'
                              : 'border-[#24242b] bg-[#0e0e0e] hover:border-[#383842] text-[#cbd5e1]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-xs font-mono text-[#5a5a66] w-5">
                              {i + 1}.
                            </span>
                            <span className="text-xs font-semibold truncate text-[#f0f4f5]">
                              {track.title}
                            </span>
                          </div>
                          <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#1a1a1f] border border-[#2a2a33] text-[#cbd5e1] shrink-0">
                            {track.sourceType}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : viewMode === 'playlist' && isHost && activePlaylist ? (
            /* ==================== PLAYLIST EDITOR VIEW ==================== */
            <PlaylistEditorView
              playlist={activePlaylist}
              allTracks={tracks}
              currentTrackId={roomState?.currentTrack?.id || null}
              onPlayPlaylist={(pl, idx = 0) => {
                setListenerUnlocked(true);
                sendHostCommand('set_playlist', { playlistId: pl.id });
                if (idx > 0 && pl.tracks[idx]) {
                  setTimeout(() => {
                    sendHostCommand('set_track', { trackId: pl.tracks[idx].id });
                  }, 150);
                }
              }}
              onRefreshData={refreshCatalog}
              onSelectPlaylistId={setSelectedPlaylistId}
            />
          ) : viewMode === 'library' && isHost ? (
            /* ==================== CENTRAL LIBRARY VIEW ==================== */
            <LibraryView
              tracks={tracks}
              playlists={playlists}
              maxUploadMb={maxUploadMb}
              currentTrackId={roomState?.currentTrack?.id || null}
              onPlayTrack={(track) => {
                setListenerUnlocked(true);
                sendHostCommand('set_track', { trackId: track.id });
              }}
              onRefreshData={refreshCatalog}
            />
          ) : (
            /* ==================== LIVE LISTENER MODE (/sala/:code) ==================== */
            <div className="max-w-xl mx-auto py-6 space-y-6">
              {/* Room Switcher Card */}
              <div className="taste-card rounded-md border border-[#2a2a33] bg-[#141417] p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-card-elevated">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#cc001e] font-bold">
                    Sincronização em Tempo Real
                  </span>
                  <h2 className="font-sans text-xl font-extrabold text-[#f0f4f5]">
                    {roomState?.name || `Sala ${roomCode}`}
                  </h2>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (joinCodeInput.trim()) {
                      const nextCode = joinCodeInput.trim().toUpperCase();
                      setRoomCode(nextCode);
                      window.history.pushState({}, '', `/sala/${nextCode}`);
                    }
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="Código (ex: AB12CD)"
                    maxLength={10}
                    className="w-32 rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-3.5 py-1.5 text-xs font-mono uppercase text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="taste-btn rounded-lg bg-[#23232a] hover:bg-[#cc001e] hover:text-white px-3.5 py-1.5 text-xs font-bold text-[#f0f4f5]"
                  >
                    Trocar Sala
                  </button>
                </form>
              </div>

              {/* Three-Card Visual Hierarchy inspired by Reference Image */}
              {!listenerUnlocked ? (
                /* Card 1: Red #cc001e "Aa" unlock card */
                <div className="rounded-md border border-[#cc001e]/60 bg-[#cc001e] p-8 text-white space-y-6 shadow-brand-glow text-center">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-widest text-white/80">
                      Hex #cc001e
                    </span>
                    <span className="text-3xl font-black">Aa</span>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-sans text-2xl font-black tracking-tight">
                      Pronto para entrar na sessão?
                    </h3>
                    <p className="text-xs text-white/90 max-w-sm mx-auto leading-relaxed">
                      Clique no botão para desbloquear o áudio do navegador e escutar todas as cenas e músicas em perfeita sincronia com o anfitrião.
                    </p>
                  </div>
                  <button
                    onClick={handleUnlockListenerAudio}
                    className="taste-btn inline-flex items-center gap-3 rounded-lg bg-[#f0f4f5] hover:bg-white text-[#0e0e0e] font-extrabold px-8 py-3.5 text-sm shadow-xl transition transform hover:scale-105"
                  >
                    <Radio className="w-4 h-4 text-[#cc001e]" />
                    <span>Entrar e Ouvir</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Card 2: Dark #0e0e0e "Ff" current playback card */}
                  <div className="rounded-md border border-[#2a2a33] bg-[#0e0e0e] p-7 space-y-4 shadow-card-elevated">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono uppercase tracking-widest text-[#cc001e] font-bold">
                        Hex #0e0e0e
                      </span>
                      <span className="text-3xl font-black text-[#cc001e]">Ff</span>
                    </div>

                    {activeScene && (
                      <div
                        className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-bold border border-[#cc001e]/40 bg-[#cc001e]/15 text-[#f0f4f5]"
                      >
                        <span className="text-sm">{activeScene.emoji}</span>
                        <span>Cena Ativa: {activeScene.name}</span>
                      </div>
                    )}

                    <div>
                      <p className="text-[10px] uppercase font-mono tracking-widest text-[#cbd5e1]">
                        {roomState?.isPlaying ? '● Tocando no Momento' : '■ Em Pausa'}
                      </p>
                      <h3 className="font-sans text-xl font-extrabold text-[#f0f4f5] mt-1">
                        {roomState?.currentTrack?.title || 'Aguardando o anfitrião disparar uma cena...'}
                      </h3>
                      {roomState?.ambientIsPlaying && roomState?.ambientTrack && (
                        <p className="text-xs text-[#cc001e] mt-1.5 font-medium flex items-center gap-1.5">
                          <CloudRain className="w-3.5 h-3.5" />
                          <span>Camada Ambiente: {roomState.ambientTrack.title}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Card 3: Light #f0f4f5 "Xx" volume controls & telemetry */}
                  <div className="rounded-md border border-white/20 bg-[#f0f4f5] text-[#0e0e0e] p-7 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono uppercase tracking-widest text-[#0e0e0e]/70 font-bold">
                        Hex #f0f4f5
                      </span>
                      <span className="text-3xl font-black text-[#0e0e0e]">Xx</span>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-[#0e0e0e]">
                        <span>Seu Volume de Ouvinte</span>
                        <span className="font-mono">
                          {localMuted ? 'MUDO' : `${Math.round(localVolume * 100)}%`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setLocalMuted(!localMuted)}
                          className={`taste-btn p-2 rounded-md border transition ${
                            localMuted
                              ? 'border-[#cc001e] bg-[#cc001e] text-white'
                              : 'border-[#0e0e0e]/20 bg-white text-[#0e0e0e]'
                          }`}
                          title={localMuted ? 'Desmutar' : 'Silenciar'}
                        >
                          {localMuted ? (
                            <VolumeX className="w-4 h-4" />
                          ) : (
                            <Volume2 className="w-4 h-4" />
                          )}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.02}
                          value={localMuted ? 0 : localVolume}
                          onChange={(e) => {
                            setLocalMuted(false);
                            setLocalVolume(parseFloat(e.target.value));
                          }}
                          className="flex-1 accent-[#cc001e] cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-[#0e0e0e]/60 pt-2 border-t border-[#0e0e0e]/10">
                      <span>Latência: {Math.round(oneWayLatencySec * 1000)}ms</span>
                      <span>Sincronia Automática</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer Signature */}
              <div className="flex items-center justify-between text-[10px] font-mono text-[#5a5a66] px-2">
                <span>Design & I.A</span>
                <span>Design Edge Unlocked!</span>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Fixed Bottom Player Bar */}
      <footer className="fixed bottom-0 inset-x-0 z-40 border-t border-[#24242b] bg-[#0e0e0e]/95 backdrop-blur-lg px-4 lg:px-6 py-3 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Left: Current Track */}
          <div className="flex items-center gap-3 min-w-0 w-full md:w-1/3">
            <YouTubeEmbedPlayer
              ref={ytPlayerRef}
              active={roomState?.currentTrack?.sourceType === 'youtube'}
              onEnded={() => {
                if (isHost) sendHostCommand('next', { positionSec: 0 });
              }}
              onDurationChange={(d) => setDisplayDurationSec(d)}
              onTimeUpdate={(cur) => setDisplayPositionSec(cur)}
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {activeScene && (
                  <span
                    className="text-[11px] px-2.5 py-0.5 rounded-full font-bold shrink-0 bg-[#cc001e]/20 border border-[#cc001e]/30 text-white"
                  >
                    {activeScene.emoji} {activeScene.name}
                  </span>
                )}
                <p className="text-xs sm:text-sm font-bold text-[#f0f4f5] truncate">
                  {roomState?.currentTrack?.title || 'Nenhuma faixa selecionada'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[#cbd5e1] mt-0.5">
                <span>
                  {roomState?.currentTrack
                    ? roomState.currentTrack.sourceType === 'youtube'
                      ? 'YouTube IFrame Sincronizado'
                      : 'Audio Deck Range (MP3)'
                    : 'Selecione uma Cena para tocar'}
                </span>
                {roomState?.ambientIsPlaying && roomState?.ambientTrack && (
                  <span className="text-[#cc001e] truncate font-medium">
                    • 🌧️ {roomState.ambientTrack.title}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Center: Transport Controls & Seek Bar */}
          <div className="flex flex-col items-center w-full md:w-2/5 space-y-1.5">
            {isHost ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => sendHostCommand('set_shuffle')}
                  className={`taste-btn p-1.5 rounded-md transition ${
                    roomState?.shuffle
                      ? 'text-white bg-[#cc001e] shadow-brand-glow-sm'
                      : 'text-[#f0f4f5] bg-[#1a1a1f] hover:bg-[#25252d]'
                  }`}
                  title="Embaralhar"
                >
                  <Shuffle className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    setListenerUnlocked(true);
                    sendHostCommand('prev');
                  }}
                  className="taste-btn p-1.5 rounded-md text-[#f0f4f5] hover:text-white bg-[#1a1a1f] hover:bg-[#25252d] transition"
                  title="Anterior"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <AnimatedPlayButton
                  isPlaying={Boolean(roomState?.isPlaying)}
                  onToggle={() => {
                    setListenerUnlocked(true);
                    if (roomState?.isPlaying) {
                      sendHostCommand('pause', { positionSec: displayPositionSec });
                    } else {
                      sendHostCommand('play', { positionSec: displayPositionSec });
                    }
                  }}
                  title={roomState?.isPlaying ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
                />

                <button
                  onClick={() => {
                    setListenerUnlocked(true);
                    sendHostCommand('next');
                  }}
                  className="taste-btn p-1.5 rounded-md text-[#f0f4f5] hover:text-white bg-[#1a1a1f] hover:bg-[#25252d] transition"
                  title="Próxima faixa"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    const order: RepeatMode[] = ['playlist', 'track', 'none'];
                    const nextMode =
                      order[(order.indexOf(roomState?.repeatMode || 'playlist') + 1) % order.length];
                    sendHostCommand('set_repeat', { repeatMode: nextMode });
                  }}
                  className={`taste-btn p-1.5 rounded-md transition ${
                    roomState?.repeatMode && roomState.repeatMode !== 'none'
                      ? 'text-white bg-[#cc001e] shadow-brand-glow-sm'
                      : 'text-[#f0f4f5] bg-[#1a1a1f] hover:bg-[#25252d]'
                  }`}
                  title={`Repetir: ${
                    roomState?.repeatMode === 'track'
                      ? 'Faixa'
                      : roomState?.repeatMode === 'playlist'
                      ? 'Playlist'
                      : 'Desativado'
                  }`}
                >
                  {roomState?.repeatMode === 'track' ? (
                    <Repeat1 className="w-4 h-4" />
                  ) : (
                    <Repeat className="w-4 h-4" />
                  )}
                </button>
              </div>
            ) : (
              <div className="text-xs text-[#cc001e] font-bold flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>Sincronia ao vivo com o Anfitrião</span>
              </div>
            )}

            {/* Progress Bar */}
            <div className="w-full flex items-center gap-2.5 text-[11px] font-mono text-[#cbd5e1]">
              <span className="w-9 text-right text-[#f0f4f5]">{formatTime(displayPositionSec)}</span>
              <input
                type="range"
                min={0}
                max={Math.max(displayDurationSec, 1)}
                step={0.5}
                disabled={!isHost || !roomState?.currentTrack}
                value={Math.min(displayPositionSec, Math.max(displayDurationSec, 1))}
                onChange={(e) => {
                  const target = parseFloat(e.target.value);
                  setDisplayPositionSec(target);
                  sendHostCommand('seek', { positionSec: target });
                }}
                className="flex-1 accent-[#cc001e] cursor-pointer disabled:cursor-default h-1.5 rounded-lg"
              />
              <span className="w-9">{formatTime(displayDurationSec)}</span>
            </div>
          </div>

          {/* Right: Master / Local Volume Controls */}
          <div className="hidden md:flex items-center justify-end gap-3 w-1/4">
            <button
              onClick={() => setLocalMuted(!localMuted)}
              className="taste-btn p-2 rounded-md text-[#f0f4f5] hover:text-white bg-[#1a1a1f] hover:bg-[#25252d]"
              title={localMuted ? 'Desmutar' : 'Mudo'}
            >
              {localMuted ? (
                <VolumeX className="w-4 h-4 text-[#cc001e]" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <div className="w-28 flex flex-col">
              <span className="text-[10px] font-medium text-[#cbd5e1]">
                {isHost ? 'Volume da Sala' : 'Seu Volume'}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={
                  localMuted
                    ? 0
                    : isHost
                    ? roomState?.volume ?? 0.85
                    : localVolume
                }
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setLocalMuted(false);
                  if (isHost) {
                    sendHostCommand('set_volume', { volume: v });
                  } else {
                    setLocalVolume(v);
                  }
                }}
                className="w-full accent-[#cc001e] cursor-pointer"
              />
            </div>
          </div>
        </div>
      </footer>

      {/* Scene Create/Edit Modal */}
      <SceneModal
        open={sceneModalOpen}
        initialScene={editingScene}
        playlists={playlists}
        ambientTracks={tracks.filter((t) => t.sourceType === 'mp3')}
        onClose={() => setSceneModalOpen(false)}
        onSave={async (payload) => {
          if (editingScene) {
            await api.updateScene(editingScene.id, payload);
          } else {
            await api.createScene(payload);
          }
          await refreshCatalog();
        }}
      />

      {/* Host Authentication Modal */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-md border border-[#2a2a33] bg-[#141417] p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#24242b] pb-3">
              <h3 className="font-sans text-base font-extrabold text-[#f0f4f5] flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#cc001e]" />
                Autenticação do Anfitrião
              </h3>
              <button
                onClick={() => setAuthModalOpen(false)}
                className="taste-btn p-1.5 rounded-md text-[#cbd5e1] hover:text-[#f0f4f5] hover:bg-[#23232a]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              Informe a senha de mestre para liberar o painel de cenas, gerenciador de playlists e crossfade.
            </p>

            {authError && (
              <div className="rounded-lg border border-[#cc001e]/40 bg-[#cc001e]/10 px-4 py-2.5 text-xs text-[#f0f4f5]">
                {authError}
              </div>
            )}

            <form onSubmit={handleHostLogin} className="space-y-4">
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Senha de Anfitrião"
                className="w-full rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-4 py-2.5 text-sm text-[#f0f4f5] placeholder-[#4f5660] focus:border-[#cc001e] focus:outline-none"
                autoFocus
              />
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(false)}
                  className="taste-btn rounded-lg border border-[#2a2a33] bg-[#1a1a1f] px-4 py-2 text-xs font-semibold text-[#cbd5e1] hover:text-[#f0f4f5]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="taste-btn rounded-lg bg-[#cc001e] hover:bg-[#e00022] px-5 py-2 text-xs font-bold text-white shadow-brand-glow-sm"
                >
                  Desbloquear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
