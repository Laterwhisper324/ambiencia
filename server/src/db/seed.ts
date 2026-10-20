import { db, initSchema } from './database';
import { getStorageProvider } from '../storage/StorageProvider';
import { generateDemoAudioBuffer, type SynthPreset } from '../utils/demoAudioGenerator';
import type { RoomPlaybackState } from '../types';

export async function ensureSeedData(): Promise<void> {
  initSchema();

  const existingCount = db
    .prepare('SELECT COUNT(*) as total FROM playlists')
    .get() as { total: number };

  const storage = getStorageProvider();

  // Always ensure demo audio files exist on disk so pre-seeded tracks never 404
  const demoFiles: Array<{
    id: string;
    title: string;
    filename: string;
    preset: SynthPreset;
    durationSec: number;
    tags: string[];
    isAmbient: boolean;
  }> = [
    {
      id: 'track-forest-1',
      title: 'Sussurros da Floresta Antiga',
      filename: 'seed-floresta-antiga.mp3',
      preset: 'forest_melody',
      durationSec: 20,
      tags: ['floresta', 'exploração', 'calmo', 'rpg'],
      isAmbient: false,
    },
    {
      id: 'track-battle-1',
      title: 'Tambores da Emboscada Épica',
      filename: 'seed-batalha-tambores.mp3',
      preset: 'battle_drums',
      durationSec: 18,
      tags: ['batalha', 'combate', 'épico', 'boss'],
      isAmbient: false,
    },
    {
      id: 'track-tavern-1',
      title: 'Alaúde da Estalagem do Dragão Verde',
      filename: 'seed-taverna-alaude.mp3',
      preset: 'tavern_lute',
      durationSec: 20,
      tags: ['taverna', 'descanso', 'medieval', 'bardos'],
      isAmbient: false,
    },
    {
      id: 'track-suspense-1',
      title: 'Ecos da Masmorra Subterrânea',
      filename: 'seed-suspense-masmorra.mp3',
      preset: 'suspense_drone',
      durationSec: 20,
      tags: ['suspense', 'mistério', 'masmorra', 'terror'],
      isAmbient: false,
    },
    {
      id: 'track-amb-rain',
      title: 'Chuva Densa na Floresta (Camada Ambiente)',
      filename: 'seed-ambiente-chuva.mp3',
      preset: 'rain_loop',
      durationSec: 20,
      tags: ['ambiente', 'chuva', 'tempestade', 'loop'],
      isAmbient: true,
    },
    {
      id: 'track-amb-fire',
      title: 'Lareira Crepitante da Taverna (Camada Ambiente)',
      filename: 'seed-ambiente-lareira.mp3',
      preset: 'campfire_loop',
      durationSec: 20,
      tags: ['ambiente', 'fogueira', 'taverna', 'loop'],
      isAmbient: true,
    },
    {
      id: 'track-amb-ocean',
      title: 'Marés e Vento Costeiro (Camada Ambiente)',
      filename: 'seed-ambiente-mar.mp3',
      preset: 'ocean_loop',
      durationSec: 20,
      tags: ['ambiente', 'mar', 'oceano', 'loop'],
      isAmbient: true,
    },
  ];

  for (const item of demoFiles) {
    const exists = await storage.fileExists(item.filename);
    if (!exists) {
      const buf = generateDemoAudioBuffer(item.preset, item.durationSec);
      await storage.saveFile(buf, item.filename, 'audio/wav', item.filename);
    }
  }

  if (existingCount.total > 0) {
    return;
  }

  console.log('[Seed] Populando banco de dados SQLite com faixas, playlists e cenas de exemplo...');
  const now = new Date().toISOString();

  const insertTrack = db.prepare(`
    INSERT OR IGNORE INTO tracks (
      id, title, source_type, storage_key, original_filename, mime_type,
      size_bytes, youtube_id, youtube_url, thumbnail_url, duration_sec, tags, is_ambient, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of demoFiles) {
    const approxBytes = 44 + 22050 * item.durationSec * 2;
    insertTrack.run(
      item.id,
      item.title,
      'mp3',
      item.filename,
      item.filename,
      'audio/wav',
      approxBytes,
      null,
      null,
      null,
      item.durationSec,
      JSON.stringify(item.tags),
      item.isAmbient ? 1 : 0,
      now
    );
  }

  // Add curated YouTube tracks (reproduzidos exclusivamente pela YouTube IFrame Player API)
  insertTrack.run(
    'track-yt-1',
    'Lofi Fantasy Ambience — Estudo & Acampamento (YouTube)',
    'youtube',
    null,
    null,
    null,
    null,
    'jfKfPfyJRdk',
    'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    0,
    JSON.stringify(['youtube', 'acampamento', 'relaxante']),
    0,
    now
  );

  insertTrack.run(
    'track-yt-2',
    'Synthwave / Cyberpunk Night Encounter (YouTube)',
    'youtube',
    null,
    null,
    null,
    null,
    '4xDzrJKXOOY',
    'https://www.youtube.com/watch?v=4xDzrJKXOOY',
    'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
    0,
    JSON.stringify(['youtube', 'ação', 'noturno']),
    0,
    now
  );

  // Create 3 example Playlists (minimum required: 2)
  const insertPlaylist = db.prepare(`
    INSERT INTO playlists (id, name, description, created_at)
    VALUES (?, ?, ?, ?)
  `);

  insertPlaylist.run(
    'playlist-exploracao',
    'Exploração & Ermos',
    'Trilhas serenas e misteriosas para viagens por florestas, costas marítimas e ruínas antigas.',
    now
  );

  insertPlaylist.run(
    'playlist-combate',
    'Combate & Masmorras',
    'Percussão intensa e atmosferas tensas para iniciativa, chefes e exploração de masmorras.',
    now
  );

  insertPlaylist.run(
    'playlist-taverna',
    'Taverna & Descanso Curto',
    'Música acolhedora de alaúde e violão para interações sociais em cidades e estalagens.',
    now
  );

  const insertPlaylistTrack = db.prepare(`
    INSERT INTO playlist_tracks (playlist_id, track_id, position)
    VALUES (?, ?, ?)
  `);

  // Tracks for Playlist 1: Exploração & Ermos
  insertPlaylistTrack.run('playlist-exploracao', 'track-forest-1', 0);
  insertPlaylistTrack.run('playlist-exploracao', 'track-suspense-1', 1);
  insertPlaylistTrack.run('playlist-exploracao', 'track-yt-1', 2);

  // Tracks for Playlist 2: Combate & Masmorras
  insertPlaylistTrack.run('playlist-combate', 'track-battle-1', 0);
  insertPlaylistTrack.run('playlist-combate', 'track-suspense-1', 1);
  insertPlaylistTrack.run('playlist-combate', 'track-yt-2', 2);

  // Tracks for Playlist 3: Taverna & Descanso Curto
  insertPlaylistTrack.run('playlist-taverna', 'track-tavern-1', 0);
  insertPlaylistTrack.run('playlist-taverna', 'track-forest-1', 1);
  insertPlaylistTrack.run('playlist-taverna', 'track-yt-1', 2);

  // Create 6 Scene Buttons (minimum required: 3, covering all examples from prompt)
  const insertScene = db.prepare(`
    INSERT INTO scene_buttons (
      id, name, emoji, color, playlist_id, ambient_track_id, ambient_volume, shortcut_key, position, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const scenes = [
    {
      id: 'scene-floresta',
      name: 'Floresta',
      emoji: '🌲',
      color: '#10b981',
      playlistId: 'playlist-exploracao',
      ambientTrackId: 'track-amb-rain',
      ambientVolume: 0.25,
      shortcutKey: 1,
      position: 0,
    },
    {
      id: 'scene-batalha',
      name: 'Batalha',
      emoji: '⚔️',
      color: '#ef4444',
      playlistId: 'playlist-combate',
      ambientTrackId: null,
      ambientVolume: 0.3,
      shortcutKey: 2,
      position: 1,
    },
    {
      id: 'scene-taverna',
      name: 'Taverna',
      emoji: '🏰',
      color: '#f59e0b',
      playlistId: 'playlist-taverna',
      ambientTrackId: 'track-amb-fire',
      ambientVolume: 0.35,
      shortcutKey: 3,
      position: 2,
    },
    {
      id: 'scene-mar',
      name: 'Mar',
      emoji: '🌊',
      color: '#0ea5e9',
      playlistId: 'playlist-exploracao',
      ambientTrackId: 'track-amb-ocean',
      ambientVolume: 0.4,
      shortcutKey: 4,
      position: 3,
    },
    {
      id: 'scene-suspense',
      name: 'Suspense',
      emoji: '🕯️',
      color: '#8b5cf6',
      playlistId: 'playlist-combate',
      ambientTrackId: null,
      ambientVolume: 0.3,
      shortcutKey: 5,
      position: 4,
    },
    {
      id: 'scene-chuva',
      name: 'Chuva',
      emoji: '🌧️',
      color: '#64748b',
      playlistId: 'playlist-exploracao',
      ambientTrackId: 'track-amb-rain',
      ambientVolume: 0.55,
      shortcutKey: 6,
      position: 5,
    },
  ];

  for (const sc of scenes) {
    insertScene.run(
      sc.id,
      sc.name,
      sc.emoji,
      sc.color,
      sc.playlistId,
      sc.ambientTrackId,
      sc.ambientVolume,
      sc.shortcutKey,
      sc.position,
      now
    );
  }

  // Create default demonstration room AB12CD
  const defaultState: RoomPlaybackState = {
    code: 'AB12CD',
    name: 'Mesa Principal — Crônicas de Ambiência',
    activeSceneId: 'scene-floresta',
    activePlaylistId: 'playlist-exploracao',
    currentTrack: null,
    queue: [],
    currentIndex: 0,
    isPlaying: false,
    positionSec: 0,
    updatedAt: Date.now(),
    serverNow: Date.now(),
    volume: 0.85,
    shuffle: false,
    repeatMode: 'playlist',
    crossfadeSec: 3,
    ambientTrack: null,
    ambientIsPlaying: false,
    ambientVolume: 0.35,
    listenerCount: 0,
  };

  db.prepare(`
    INSERT OR IGNORE INTO rooms (code, name, host_token, state_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('AB12CD', defaultState.name, 'default-host-token-ab12cd', JSON.stringify(defaultState), now);

  console.log('[Seed] Dados iniciais criados com sucesso (Sala padrão: AB12CD).');
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  ensureSeedData()
    .then(() => {
      console.log('Seed finalizado.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Erro no seed:', err);
      process.exit(1);
    });
}
