import React, { useState, useRef } from 'react';
import {
  Upload,
  Youtube,
  Search,
  Play,
  Edit3,
  Trash2,
  Plus,
  Check,
  X,
  Tag,
  CloudRain,
  Music,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type { Playlist, Track } from '../types';
import { api } from '../services/api';

interface Props {
  tracks: Track[];
  playlists: Playlist[];
  maxUploadMb: number;
  currentTrackId: string | null;
  onPlayTrack: (track: Track) => void;
  onRefreshData: () => Promise<void>;
}

function getAudioDurationFromFile(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => {
      URL.revokeObjectURL(url);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const d = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0;
      cleanup();
      resolve(d);
    };
    audio.onerror = () => {
      cleanup();
      resolve(0);
    };
    audio.src = url;
  });
}

export const LibraryView: React.FC<Props> = ({
  tracks,
  playlists,
  maxUploadMb,
  currentTrackId,
  onPlayTrack,
  onRefreshData,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'mp3' | 'youtube' | 'ambient'>('all');
  const [selectedTag, setSelectedTag] = useState<string>('');

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadAsAmbient, setUploadAsAmbient] = useState(false);
  const [uploadTags, setUploadTags] = useState('rpg, trilha');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // YouTube state
  const [ytUrl, setYtUrl] = useState('');
  const [ytCustomTitle, setYtCustomTitle] = useState('');
  const [ytTags, setYtTags] = useState('youtube, rpg');
  const [addingYt, setAddingYt] = useState(false);

  // Feedback banners
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Inline track editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editAmbient, setEditAmbient] = useState(false);

  // Add to playlist dropdown
  const [addingToPlaylistTrackId, setAddingToPlaylistTrackId] = useState<string | null>(null);

  const allTags = Array.from(
    new Set(tracks.flatMap((t) => t.tags))
  ).sort();

  const filteredTracks = tracks.filter((t) => {
    if (filterType === 'mp3' && t.sourceType !== 'mp3') return false;
    if (filterType === 'youtube' && t.sourceType !== 'youtube') return false;
    if (filterType === 'ambient' && !t.isAmbient) return false;
    if (selectedTag && !t.tags.includes(selectedTag)) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchTag = t.tags.some((tg) => tg.toLowerCase().includes(q));
      return matchTitle || matchTag;
    }
    return true;
  });

  const handleFilesUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const file = fileList[0];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedExts = ['mp3', 'm4a', 'wav', 'aac', 'ogg'];
    if (!allowedExts.includes(ext)) {
      setErrorMsg(
        `Arquivo "${file.name}" recusado: apenas arquivos de áudio .mp3, .m4a (ou .wav/.aac/.ogg) são aceitos.`
      );
      return;
    }

    const maxBytes = maxUploadMb * 1024 * 1024;
    if (file.size > maxBytes) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setErrorMsg(
        `O arquivo "${file.name}" (${sizeMb} MB) excede o limite máximo configurado de ${maxUploadMb} MB.`
      );
      return;
    }

    setUploading(true);
    try {
      const durationSec = await getAudioDurationFromFile(file);
      const tags = uploadTags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const { track } = await api.uploadMp3(file, {
        tags,
        isAmbient: uploadAsAmbient,
        durationSec,
      });
      await onRefreshData();
      setSuccessMsg(`Faixa "${track.title}" enviada com sucesso!`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao enviar arquivo de áudio.');
    } finally {
      setUploading(false);
    }
  };

  const handleAddYouTube = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytUrl.trim()) {
      setErrorMsg('Cole um link válido de vídeo ou playlist do YouTube / YouTube Music.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setAddingYt(true);
    try {
      const tags = ytTags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.addYouTubeTrack({
        url: ytUrl.trim(),
        title: ytCustomTitle.trim() || undefined,
        tags,
      });
      setYtUrl('');
      setYtCustomTitle('');
      await onRefreshData();
      if (res.isPlaylistImport && res.playlist) {
        setSuccessMsg(
          `Playlist "${res.playlist.name}" importada com ${res.tracks?.length || 1} faixas (criada nas suas Playlists e na Biblioteca)!`
        );
      } else {
        setSuccessMsg(`Faixa "${res.track.title}" adicionada à biblioteca!`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao adicionar link do YouTube / YouTube Music.');
    } finally {
      setAddingYt(false);
    }
  };

  const startEditing = (track: Track) => {
    setEditingId(track.id);
    setEditTitle(track.title);
    setEditTags(track.tags.join(', '));
    setEditAmbient(track.isAmbient);
  };

  const saveEdit = async (trackId: string) => {
    try {
      const tags = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await api.updateTrack(trackId, {
        title: editTitle.trim(),
        tags,
        isAmbient: editAmbient,
      });
      setEditingId(null);
      await onRefreshData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao atualizar faixa.');
    }
  };

  const handleDeleteTrack = async (track: Track) => {
    if (!window.confirm(`Deseja realmente excluir "${track.title}" da biblioteca?`)) return;
    try {
      await api.deleteTrack(track.id);
      await onRefreshData();
      setSuccessMsg(`Faixa "${track.title}" removida.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao excluir faixa.');
    }
  };

  const handleQuickAddToPlaylist = async (playlistId: string, trackId: string) => {
    try {
      await api.addTrackToPlaylist(playlistId, trackId);
      setAddingToPlaylistTrackId(null);
      await onRefreshData();
      setSuccessMsg('Faixa adicionada à playlist!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao adicionar faixa na playlist.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Feedback Alerts */}
      {errorMsg && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dual Ingestion Cards: MP3 Drag-and-Drop & YouTube Official Embed Link */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* MP3 Upload Card */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFilesUpload(e.dataTransfer.files);
          }}
          className={`rounded-2xl border-2 border-dashed p-5 transition flex flex-col justify-between ${
            isDragging
              ? 'border-amber-400 bg-amber-500/10'
              : 'border-slate-800 bg-[#121722]/90 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                <Upload className="w-4 h-4" />
                <span>Upload de Arquivo MP3 / M4A</span>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Máx. {maxUploadMb} MB
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Arraste e solte um arquivo <code className="text-slate-200">.mp3</code> ou <code className="text-slate-200">.m4a</code> aqui ou use o seletor. Servido via HTTP Streaming com suporte a Range requests e crossfade.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                placeholder="Tags (ex.: batalha, boss)"
                className="flex-1 min-w-[140px] rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
              />
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={uploadAsAmbient}
                  onChange={(e) => setUploadAsAmbient(e.target.checked)}
                  className="rounded accent-teal-400"
                />
                <span>Camada Ambiente (Loop)</span>
              </label>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.m4a,.wav,.aac,.ogg,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/m4a,audio/aac,audio/wav,audio/ogg"
              onChange={(e) => handleFilesUpload(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl bg-amber-500/90 hover:bg-amber-400 text-slate-950 font-semibold py-2.5 text-xs transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Enviando e validando áudio...' : 'Selecionar ou Soltar Arquivo MP3 / M4A'}
            </button>
          </div>
        </div>

        {/* YouTube Direct Link / Playlist Card */}
        <form
          onSubmit={handleAddYouTube}
          className="rounded-2xl border border-slate-800 bg-[#121722]/90 p-5 flex flex-col justify-between space-y-3"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
                <Youtube className="w-4 h-4" />
                <span>YouTube & YouTube Music (Faixa ou Playlist)</span>
              </div>
              <span className="text-[11px] rounded-full bg-red-500/15 text-red-300 px-2.5 py-0.5 border border-red-500/30">
                YouTube IFrame API Oficial
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Cole o link de um vídeo ou de uma <strong>playlist do YouTube Music / YouTube</strong> (<code className="text-slate-300">music.youtube.com/playlist?list=...</code>). Se for playlist, todas as faixas e a playlist serão importadas automaticamente!
            </p>

            <div className="space-y-2.5">
              <input
                type="text"
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                placeholder="https://music.youtube.com/playlist?list=... ou https://youtu.be/..."
                className="w-full rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2 text-xs text-slate-100 focus:border-red-500 focus:outline-none"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={ytCustomTitle}
                  onChange={(e) => setYtCustomTitle(e.target.value)}
                  placeholder="Nome da faixa/playlist (auto se vazio)"
                  className="rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 focus:border-red-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={ytTags}
                  onChange={(e) => setYtTags(e.target.value)}
                  placeholder="Tags (ex.: youtube, taverna)"
                  className="rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={addingYt}
            className="w-full rounded-xl bg-red-500/90 hover:bg-red-500 text-white font-semibold py-2.5 text-xs transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {addingYt ? 'Importando do YouTube / YouTube Music...' : 'Adicionar Faixa ou Playlist'}
          </button>
        </form>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#121722]/80 border border-slate-800/80 rounded-2xl p-3.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar faixa por título ou tag..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/90 pl-9 pr-4 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'Todas' },
              { id: 'mp3', label: 'MP3 / M4A Local' },
              { id: 'youtube', label: 'YouTube' },
              { id: 'ambient', label: '🌧️ Ambiente' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                filterType === tab.id
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {allTags.length > 0 && (
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300"
            >
              <option value="">Todas as tags</option>
              {allTags.map((tg) => (
                <option key={tg} value={tg}>
                  #{tg}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Track List */}
      {filteredTracks.length === 0 ? (
        <div className="rounded-2xl border border-slate-800/80 bg-[#121722]/40 p-10 text-center">
          <Music className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-300 font-medium">Nenhuma faixa encontrada</p>
          <p className="text-xs text-slate-500 mt-1">
            Envie um arquivo MP3 ou adicione um link do YouTube acima.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTracks.map((track) => {
            const isCurrent = currentTrackId === track.id;
            const isEditing = editingId === track.id;

            return (
              <div
                key={track.id}
                className={`rounded-xl border p-3 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isCurrent
                    ? 'border-amber-500/60 bg-amber-500/10'
                    : 'border-slate-800/80 bg-[#121722]/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    onClick={() => onPlayTrack(track)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition ${
                      isCurrent
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-200 hover:bg-amber-500 hover:text-slate-950'
                    }`}
                    title="Tocar faixa agora"
                  >
                    <Play className="w-4 h-4 fill-current" />
                  </button>

                  {track.thumbnailUrl ? (
                    <img
                      src={track.thumbnailUrl}
                      alt={track.title}
                      className="w-12 h-9 object-cover rounded-lg border border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-9 rounded-lg bg-slate-800/90 border border-slate-700 flex items-center justify-center shrink-0">
                      {track.isAmbient ? (
                        <CloudRain className="w-4 h-4 text-teal-400" />
                      ) : (
                        <Music className="w-4 h-4 text-amber-400" />
                      )}
                    </div>
                  )}

                  {isEditing ? (
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white"
                        placeholder="Título da faixa"
                      />
                      <input
                        type="text"
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300"
                        placeholder="Tags separadas por vírgula"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-teal-300 sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={editAmbient}
                          onChange={(e) => setEditAmbient(e.target.checked)}
                        />
                        Disponível como Camada de Som Ambiente (Loop)
                      </label>
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-slate-100 truncate">
                          {track.title}
                        </span>
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                            track.sourceType === 'youtube'
                              ? 'border-red-500/30 bg-red-500/10 text-red-300'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          }`}
                        >
                          {track.sourceType === 'youtube'
                            ? 'YouTube'
                            : track.originalFilename?.toLowerCase().endsWith('.m4a') ||
                              track.tags.includes('m4a')
                            ? 'M4A'
                            : 'MP3'}
                        </span>
                        {track.isAmbient && (
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-300">
                            Ambiente Loop
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {track.tags.map((tg) => (
                          <span
                            key={tg}
                            className="inline-flex items-center gap-0.5 text-[11px] text-slate-400 bg-slate-900/90 px-2 py-0.5 rounded-md border border-slate-800"
                          >
                            <Tag className="w-2.5 h-2.5 text-slate-500" />
                            {tg}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => saveEdit(track.id)}
                        className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 p-1.5 text-emerald-300 hover:bg-emerald-500/30"
                        title="Salvar"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:text-white"
                        title="Cancelar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Add to Playlist menu */}
                      <div className="relative">
                        <button
                          onClick={() =>
                            setAddingToPlaylistTrackId(
                              addingToPlaylistTrackId === track.id ? null : track.id
                            )
                          }
                          className="rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:border-amber-500/50 hover:text-amber-300 flex items-center gap-1"
                          title="Adicionar a uma playlist"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Playlist</span>
                        </button>

                        {addingToPlaylistTrackId === track.id && (
                          <div className="absolute right-0 mt-1 w-52 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl py-1.5 z-30">
                            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                              Adicionar em:
                            </div>
                            {playlists.map((pl) => (
                              <button
                                key={pl.id}
                                onClick={() => handleQuickAddToPlaylist(pl.id, track.id)}
                                className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 truncate"
                              >
                                {pl.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => startEditing(track)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        title="Renomear ou editar tags"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTrack(track)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-400"
                        title="Excluir faixa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
