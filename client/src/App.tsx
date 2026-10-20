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
          const ambUrl = `/api/tracks/${state.ambientTrack.id}/stream`;
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
          nextDeck.src = `/api/tracks/${track.id}/stream`;
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
          currentDeck.src = `/api/tracks/${track.id}/stream`;
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

  // Connect Socket.IO (when available) + HTTP REST synchronization fallback (for Vercel Serverless)
  useEffect(() => {
    let isDisposed = false;
    let initialAuthChecked = false;
    const isServerlessHost =
      typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app');

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

    // Poll every 2.5s whenever Socket.IO is not actively connected
    const httpSyncInterval = window.setInterval(() => {
      if (!socketRef.current?.connected) {
        syncViaHttp();
      }
    }, 2500);

    if (isServerlessHost) {
      socketRef.current = null;
      return () => {
        isDisposed = true;
        window.clearInterval(httpSyncInterval);
      };
    }

    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
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
    <div className="min-h-screen flex flex-col bg-[#0B0E14] text-slate-100 select-none">
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
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#0E131C]/95 backdrop-blur-md px-4 lg:px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Mobile Menu Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-300 hover:text-white"
              title="Abrir menu de playlists"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div
              onClick={() => setViewMode(isHost ? 'scenes' : 'listener')}
              className="flex items-center gap-2.5 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-bold text-lg">
                🕯️
              </div>
              <div>
                <h1 className="font-display text-lg font-bold tracking-wide text-slate-100 leading-none">
                  AMBIÊNCIA
                </h1>
                <span className="text-[11px] text-slate-400">
                  Trilhas Sonoras & Cenas Ao Vivo
                </span>
              </div>
            </div>
          </div>

          {/* Center View Switcher Tabs */}
          <nav className="flex items-center gap-1 rounded-xl bg-slate-900/90 p-1 border border-slate-800">
            {isHost && (
              <>
                <button
                  onClick={() => setViewMode('scenes')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    viewMode === 'scenes'
                      ? 'bg-amber-500 text-slate-950 font-semibold shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Cenas</span>
                </button>

                <button
                  onClick={() => setViewMode('playlist')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    viewMode === 'playlist'
                      ? 'bg-amber-500 text-slate-950 font-semibold shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <ListMusic className="w-3.5 h-3.5" />
                  <span>Playlists</span>
                </button>

                <button
                  onClick={() => setViewMode('library')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    viewMode === 'library'
                      ? 'bg-amber-500 text-slate-950 font-semibold shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Library className="w-3.5 h-3.5" />
                  <span>Biblioteca</span>
                </button>
              </>
            )}

            <button
              onClick={() => setViewMode('listener')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                viewMode === 'listener'
                  ? 'bg-teal-400 text-slate-950 font-semibold shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>Modo Ouvinte</span>
            </button>
          </nav>

          {/* Right Room Sync & Host Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Connection Status Pill */}
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border ${
                connStatus === 'connected'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : connStatus === 'reconnecting'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
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
                  ? 'Conectado'
                  : connStatus === 'reconnecting'
                  ? 'Reconectando...'
                  : 'Desconectado'}
              </span>
            </div>

            {/* Listener Count Pill */}
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900 px-2.5 py-1 text-xs text-slate-200"
              title="Pessoas conectadas nesta sala em tempo real"
            >
              <Users className="w-3.5 h-3.5 text-teal-400" />
              <span className="font-mono font-semibold">{listenerCount}</span>
              <span className="hidden sm:inline text-slate-400 text-[11px]">
                {listenerCount === 1 ? 'ouvinte' : 'ouvintes'}
              </span>
            </div>

            {/* Room Code & Share Link */}
            <div className="flex items-center rounded-xl border border-slate-700/80 bg-slate-900/90 overflow-hidden">
              <span className="px-2.5 py-1 text-xs font-mono font-bold text-amber-400 tracking-wider">
                /sala/{roomCode}
              </span>
              <button
                onClick={handleCopyShareLink}
                className="border-l border-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-amber-500 hover:text-slate-950 transition flex items-center gap-1"
                title="Copiar link para ouvintes"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Compartilhar</span>
                  </>
                )}
              </button>
            </div>

            {isHost && (
              <button
                onClick={handleCreateNewRoom}
                className="rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-1 text-xs text-slate-300"
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
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium border transition ${
                isHost
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
              }`}
              title={
                isHost
                  ? 'Modo Anfitrião ativo (clique para simular visão de Ouvinte)'
                  : 'Autenticar como Anfitrião (Mestre)'
              }
            >
              {isHost ? (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Anfitrião</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Sou o Anfitrião</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Middle Layout: Left Sidebar (Playlists & Ambient Mixer) + Central Workspace */}
      <div className="flex-1 flex overflow-hidden pb-28">
        {/* Left Sidebar (Hidden in pure listener view unless host) */}
        {isHost && (
          <aside
            className={`${
              sidebarOpen ? 'fixed inset-y-0 left-0 z-40 w-72 pt-16' : 'hidden'
            } lg: static lg:block lg:w-72 shrink-0 border-r border-slate-800/80 bg-[#0E131C] p-4 overflow-y-auto space-y-6`}
          >
            {/* Playlists Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ListMusic className="w-4 h-4 text-amber-400" />
                  <span>Playlists ({playlists.length})</span>
                </h2>
                <button
                  onClick={() => setCreatingPlaylist(!creatingPlaylist)}
                  className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition flex items-center gap-1"
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
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950"
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
                      className={`group rounded-xl border px-3 py-2.5 cursor-pointer transition flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'border-amber-500/60 bg-amber-500/15 text-white'
                          : isPlayingPl
                          ? 'border-amber-500/30 bg-slate-900/90 text-amber-200'
                          : 'border-transparent bg-slate-900/50 hover:bg-slate-800/80 text-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isPlayingPl && (
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                          )}
                          <p className="text-xs font-semibold truncate">{pl.name}</p>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {pl.tracks.length} {pl.tracks.length === 1 ? 'faixa' : 'faixas'}
                        </p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setListenerUnlocked(true);
                          sendHostCommand('set_playlist', { playlistId: pl.id });
                        }}
                        className="opacity-80 group-hover:opacity-100 w-7 h-7 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 flex items-center justify-center text-slate-300 transition shrink-0"
                        title="Tocar esta playlist na sala"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ambient Sound Layer Mixer */}
            <div className="rounded-2xl border border-slate-800 bg-[#121824] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                  <CloudRain className="w-4 h-4" />
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
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition ${
                    roomState?.ambientIsPlaying
                      ? 'bg-teal-400 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:text-white disabled:opacity-40'
                  }`}
                >
                  {roomState?.ambientIsPlaying ? 'Ativo' : 'Pausado'}
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
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-200 focus:border-teal-400 focus:outline-none"
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

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Volume do Ambiente</span>
                  <span className="font-mono text-teal-300">
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
                  className="w-full accent-teal-400 cursor-pointer"
                />
              </div>
            </div>

            {/* Crossfade Configuration Card */}
            <div className="rounded-2xl border border-slate-800 bg-[#121824] p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  Crossfade MP3
                </span>
                <span className="text-xs font-mono font-bold text-slate-200">
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
                className="w-full accent-amber-400 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                Transição suave (fade out / fade in) entre faixas MP3 e trocas de cena.
              </p>
            </div>
          </aside>
        )}

        {/* Central Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full">
          {loadingCatalog ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
              <RefreshCw className="w-7 h-7 animate-spin text-amber-400" />
              <p className="text-sm">Carregando estúdio Ambiência...</p>
            </div>
          ) : viewMode === 'scenes' && isHost ? (
            /* ==================== SCENE PAD VIEW ==================== */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-slate-100 flex items-center gap-2.5">
                    <span>Painel de Cenas (Situações)</span>
                    {isCrossfading && (
                      <span className="text-xs font-sans font-normal rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 px-3 py-0.5 animate-pulse">
                        Crossfade em andamento...
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Clique em um botão ou pressione as teclas <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-slate-200">1</kbd> a <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-slate-200">9</kbd> para trocar a trilha com fade suave.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setEditingScene(null);
                    setSceneModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-4 py-2.5 text-xs shadow-lg shadow-amber-500/15 transition self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  Novo Botão de Cena
                </button>
              </div>

              {scenes.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-[#121722]/50 p-12 text-center">
                  <Sparkles className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-200 font-semibold">
                    Nenhum botão de cena criado
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Crie botões como 🌲 Floresta, ⚔️ Batalha ou 🏰 Taverna para disparar suas playlists.
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
                          borderColor: isSelectedScene ? scene.color : undefined,
                          boxShadow: isActive
                            ? `0 0 28px -4px ${scene.color}55`
                            : undefined,
                        }}
                        className={`group relative rounded-2xl border-2 p-5 cursor-pointer transition-all duration-300 overflow-hidden ${
                          isSelectedScene
                            ? 'bg-[#171E2E]'
                            : 'border-slate-800/90 bg-[#121722]/90 hover:border-slate-700 hover:bg-[#151B28]'
                        }`}
                      >
                        {/* Colored radial spotlight */}
                        <div
                          className="pointer-events-none absolute -right-8 -top-8 w-32 h-32 rounded-full blur-2xl opacity-25 transition group-hover:opacity-45"
                          style={{ backgroundColor: scene.color }}
                        />

                        <div className="relative z-10 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3.5">
                            <div
                              className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-inner border border-white/10 ${
                                isActive ? 'scene-active-glow' : ''
                              }`}
                              style={{ backgroundColor: `${scene.color}28` }}
                            >
                              {scene.emoji}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-display text-lg font-bold text-white">
                                  {scene.name}
                                </h3>
                                {isActive && (
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-slate-950"
                                    style={{ backgroundColor: scene.color }}
                                  >
                                    No Ar
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[180px]">
                                {linkedPlaylist
                                  ? `🎵 ${linkedPlaylist.name}`
                                  : 'Sem playlist associada'}
                              </p>
                              {linkedAmbient && (
                                <p className="text-[11px] text-teal-400 mt-0.5 truncate max-w-[180px]">
                                  🌧️ + {linkedAmbient.title}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            {shortcut && (
                              <span
                                className="w-6 h-6 rounded-lg border border-slate-700 bg-slate-900/90 text-[11px] font-mono font-bold text-slate-300 flex items-center justify-center"
                                title={`Atalho de teclado: Tecla ${shortcut}`}
                              >
                                {shortcut}
                              </span>
                            )}

                            <div
                              className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => {
                                  setEditingScene(scene);
                                  setSceneModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700"
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
                                className="p-1.5 rounded-lg bg-slate-900/90 text-red-300 hover:bg-red-500/20 border border-slate-700"
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
                <div className="rounded-2xl border border-slate-800/90 bg-[#121722]/75 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Fila da Cena / Playlist Atual ({roomState.queue.length} faixas)
                    </h3>
                    {activePlaylist && (
                      <button
                        onClick={() => {
                          setSelectedPlaylistId(activePlaylist.id);
                          setViewMode('playlist');
                        }}
                        className="text-xs text-amber-400 hover:underline"
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
                          className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 cursor-pointer transition ${
                            isCurrent
                              ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                              : 'border-slate-800/80 bg-slate-900/60 hover:bg-slate-800/80 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-xs font-mono text-slate-500 w-5">
                              {i + 1}.
                            </span>
                            <span className="text-xs font-medium truncate">
                              {track.title}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
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
              <div className="rounded-2xl border border-slate-800 bg-[#121722] p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-teal-400">
                    Sincronização em Tempo Real
                  </span>
                  <h2 className="font-display text-xl font-bold text-white">
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
                    className="w-32 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-mono uppercase text-amber-300 focus:border-teal-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200"
                  >
                    Trocar Sala
                  </button>
                </form>
              </div>

              {/* "Entrar e Ouvir" Autoplay Unlock Card */}
              {!listenerUnlocked ? (
                <div className="rounded-3xl border-2 border-teal-500/50 bg-gradient-to-b from-teal-500/15 to-[#121722] p-10 text-center space-y-5 shadow-2xl">
                  <div className="w-20 h-20 rounded-3xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center mx-auto text-teal-300">
                    <Headphones className="w-10 h-10" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-display text-2xl font-bold text-white">
                      Pronto para sintonizar a sessão?
                    </h3>
                    <p className="text-sm text-slate-300 max-w-md mx-auto">
                      Clique no botão abaixo para liberar a reprodução de áudio no navegador e ouvir em perfeita sincronia com o anfitrião.
                    </p>
                  </div>
                  <button
                    onClick={handleUnlockListenerAudio}
                    className="inline-flex items-center gap-2.5 rounded-2xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold px-8 py-4 text-base shadow-xl shadow-teal-500/25 transition transform hover:scale-105"
                  >
                    <Radio className="w-5 h-5" />
                    Entrar e ouvir
                  </button>
                </div>
              ) : (
                /* Synchronized Listener Stage */
                <div className="rounded-3xl border border-slate-800 bg-gradient-to-b from-[#161D2B] to-[#101520] p-8 text-center space-y-6 shadow-2xl">
                  {activeScene && (
                    <div
                      className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold border"
                      style={{
                        borderColor: `${activeScene.color}66`,
                        backgroundColor: `${activeScene.color}22`,
                        color: '#f8fafc',
                      }}
                    >
                      <span className="text-base">{activeScene.emoji}</span>
                      <span>Cena Atual: {activeScene.name}</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-widest text-slate-400">
                      {roomState?.isPlaying ? 'Tocando Agora em Sincronia' : 'Sessão em Pausa'}
                    </p>
                    <h3 className="font-display text-2xl font-bold text-slate-100">
                      {roomState?.currentTrack?.title || 'Aguardando o anfitrião iniciar uma cena...'}
                    </h3>
                    {roomState?.ambientIsPlaying && roomState?.ambientTrack && (
                      <p className="text-xs text-teal-400 flex items-center justify-center gap-1.5">
                        <CloudRain className="w-3.5 h-3.5" />
                        <span>Camada Ambiente ativa: {roomState.ambientTrack.title}</span>
                      </p>
                    )}
                  </div>

                  {/* Listener-Only Local Volume & Mute Control */}
                  <div className="max-w-xs mx-auto rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span className="font-medium">Seu Volume Local</span>
                      <span className="font-mono text-teal-300">
                        {localMuted ? 'MUDO' : `${Math.round(localVolume * 100)}%`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setLocalMuted(!localMuted)}
                        className={`p-2 rounded-xl border transition ${
                          localMuted
                            ? 'border-red-500/40 bg-red-500/20 text-red-300'
                            : 'border-slate-700 bg-slate-800 text-slate-200 hover:text-white'
                        }`}
                        title={localMuted ? 'Ativar som' : 'Silenciar apenas para você'}
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
                        className="flex-1 accent-teal-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Sync Telemetry Footer */}
                  <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                    <span>
                      Latência estimada:{' '}
                      <strong className="font-mono text-slate-200">
                        {Math.round(oneWayLatencySec * 1000)} ms
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Tolerância de desvio: <strong className="font-mono text-slate-200">~1.0s</strong>
                    </span>
                    {lastDriftFixedMs && (
                      <>
                        <span>•</span>
                        <span className="text-teal-400">Sincronia ajustada automaticamente</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Fixed Bottom Player Bar */}
      <footer className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-800/90 bg-[#0D111A]/95 backdrop-blur-lg px-4 lg:px-6 py-3 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Left: Current Track + Official YouTube Embed Dock */}
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
                    className="text-xs px-2 py-0.5 rounded-md font-semibold shrink-0"
                    style={{
                      backgroundColor: `${activeScene.color}30`,
                      color: '#f8fafc',
                    }}
                  >
                    {activeScene.emoji} {activeScene.name}
                  </span>
                )}
                <p className="text-sm font-semibold text-slate-100 truncate">
                  {roomState?.currentTrack?.title || 'Nenhuma faixa selecionada'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                <span>
                  {roomState?.currentTrack
                    ? roomState.currentTrack.sourceType === 'youtube'
                      ? 'YouTube IFrame Player Oficial'
                      : 'Streaming HTTP Range (MP3)'
                    : 'Clique em uma Cena (1-9) para iniciar'}
                </span>
                {roomState?.ambientIsPlaying && roomState?.ambientTrack && (
                  <span className="text-teal-400 truncate">
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
                  className={`p-1.5 rounded-lg transition ${
                    roomState?.shuffle
                      ? 'text-amber-400 bg-amber-500/15'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Embaralhar (Shuffle)"
                >
                  <Shuffle className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    setListenerUnlocked(true);
                    sendHostCommand('prev');
                  }}
                  className="p-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 transition"
                  title="Anterior"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    setListenerUnlocked(true);
                    if (roomState?.isPlaying) {
                      sendHostCommand('pause', { positionSec: displayPositionSec });
                    } else {
                      sendHostCommand('play', { positionSec: displayPositionSec });
                    }
                  }}
                  className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/25 transition"
                  title={roomState?.isPlaying ? 'Pausar' : 'Reproduzir'}
                >
                  {roomState?.isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  onClick={() => {
                    setListenerUnlocked(true);
                    sendHostCommand('next');
                  }}
                  className="p-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 transition"
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
                  className={`p-1.5 rounded-lg transition ${
                    roomState?.repeatMode && roomState.repeatMode !== 'none'
                      ? 'text-amber-400 bg-amber-500/15'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={`Repetir: ${
                    roomState?.repeatMode === 'track'
                      ? 'Faixa atual'
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
              <div className="text-xs text-teal-300 font-medium flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>Reprodução controlada em tempo real pelo Anfitrião</span>
              </div>
            )}

            {/* Progress Bar */}
            <div className="w-full flex items-center gap-2.5 text-[11px] font-mono text-slate-400">
              <span className="w-9 text-right">{formatTime(displayPositionSec)}</span>
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
                className="flex-1 accent-amber-400 cursor-pointer disabled:cursor-default h-1.5 rounded-lg"
              />
              <span className="w-9">{formatTime(displayDurationSec)}</span>
            </div>
          </div>

          {/* Right: Master / Local Volume Controls */}
          <div className="hidden md:flex items-center justify-end gap-3 w-1/4">
            <button
              onClick={() => setLocalMuted(!localMuted)}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
              title={localMuted ? 'Ativar som' : 'Mudo'}
            >
              {localMuted ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <div className="w-28 flex flex-col">
              <span className="text-[10px] text-slate-400">
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
                className="w-full accent-amber-400 cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#131822] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                Acesso do Anfitrião
              </h3>
              <button
                onClick={() => setAuthModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Digite a senha do anfitrião para desbloquear os controles de reprodução e edição.
            </p>

            {authError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {authError}
              </div>
            )}

            <form onSubmit={handleHostLogin} className="space-y-3">
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Senha do anfitrião"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2 text-xs font-semibold text-slate-950"
                >
                  Desbloquear Controles
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
