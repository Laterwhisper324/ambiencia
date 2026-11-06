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
        `O arquivo "${file.name}" (${sizeMb} MB) excede o limite máximo de ${maxUploadMb} MB.`
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
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao fazer upload do arquivo.');
    } finally {
      setUploading(false);
    }
  };

  const handleAddYouTube = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytUrl.trim()) return;

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

      await onRefreshData();

      if (res.isPlaylistImport && res.tracks) {
        setSuccessMsg(
          `Playlist "${res.playlist?.name}" importada com sucesso com ${res.tracks.length} faixas!`
        );
      } else if (res.track) {
        setSuccessMsg(`Faixa do YouTube "${res.track.title}" adicionada!`);
      } else {
        setSuccessMsg('Mídia importada com sucesso!');
      }

      setYtUrl('');
      setYtCustomTitle('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao importar do YouTube.');
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
        .map((s) => s.trim())
        .filter(Boolean);
      await api.updateTrack(trackId, {
        title: editTitle.trim(),
        tags,
        isAmbient: editAmbient,
      });
      await onRefreshData();
      setEditingId(null);
      setSuccessMsg('Faixa atualizada com sucesso!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao atualizar faixa.');
    }
  };

  const handleDeleteTrack = async (track: Track) => {
    if (!window.confirm(`Deseja realmente remover a faixa "${track.title}" da biblioteca?`)) {
      return;
    }
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
      setAddingToPlaylistTrackId(null);
      await api.addTrackToPlaylist(playlistId, trackId);
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
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#cc001e]/40 bg-[#cc001e]/10 px-5 py-3.5 text-xs text-[#f0f4f5] animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#cc001e] shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="taste-btn text-[#cbd5e1] hover:text-[#f0f4f5]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-5 py-3.5 text-xs text-emerald-200 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="taste-btn text-emerald-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dual Ingestion Cards: MP3 Drag-and-Drop & YouTube Embed Link */}
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
          className={`taste-card rounded-md border-2 border-dashed p-6 transition flex flex-col justify-between ${
            isDragging
              ? 'border-[#cc001e] bg-[#cc001e]/10 shadow-brand-glow-sm'
              : 'border-[#2a2a33] bg-[#141417] hover:border-[#3d3d47]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5 text-[#cc001e] font-bold text-sm">
                <Upload className="w-4 h-4" />
                <span>Upload de Áudio (MP3 / M4A)</span>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#0e0e0e] border border-[#2a2a33] text-[#cbd5e1]">
                Máx. {maxUploadMb} MB
              </span>
            </div>
            <p className="text-xs text-[#cbd5e1] mb-5 leading-relaxed">
              Arraste e solte seus arquivos de áudio aqui. Executado com streaming HTTP direto e suporte a crossfade duplo.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                placeholder="Tags (ex.: combate, taverna)"
                className="flex-1 min-w-[140px] rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-3.5 py-2 text-xs text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none transition"
              />
              <label className="flex items-center gap-2 text-xs text-[#cbd5e1] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={uploadAsAmbient}
                  onChange={(e) => setUploadAsAmbient(e.target.checked)}
                  className="rounded accent-[#cc001e]"
                />
                <span>Camada Ambiente (Loop)</span>
              </label>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.m4a,.wav,.aac,.ogg,audio/*"
              onChange={(e) => handleFilesUpload(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="taste-btn w-full rounded-lg bg-[#f0f4f5] hover:bg-white text-[#0e0e0e] font-bold py-2.5 text-xs transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
            >
              <Upload className="w-4 h-4 text-[#0e0e0e]" />
              {uploading ? 'Enviando e validando...' : 'Selecionar Arquivo do Computador'}
            </button>
          </div>
        </div>

        {/* YouTube Ingestion Card */}
        <form
          onSubmit={handleAddYouTube}
          className="taste-card rounded-md border border-[#2a2a33] bg-[#141417] p-6 flex flex-col justify-between space-y-4"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5 text-[#cc001e] font-bold text-sm">
                <Youtube className="w-4 h-4" />
                <span>YouTube & YouTube Music</span>
              </div>
              <span className="text-[10px] font-mono rounded-full bg-[#cc001e]/15 text-[#cc001e] px-2.5 py-0.5 border border-[#cc001e]/30">
                IFrame Sincronizado
              </span>
            </div>
            <p className="text-xs text-[#cbd5e1] mb-4 leading-relaxed">
              Cole o link de uma música ou playlist do YouTube/YT Music. O importador mapeia faixas e títulos automaticamente.
            </p>

            <div className="space-y-2.5">
              <input
                type="text"
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                placeholder="https://music.youtube.com/playlist?list=... ou https://youtu.be/..."
                className="w-full rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-3.5 py-2 text-xs text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none transition"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={ytCustomTitle}
                  onChange={(e) => setYtCustomTitle(e.target.value)}
                  placeholder="Nome customizado (opcional)"
                  className="rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-3 py-2 text-xs text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none transition"
                />
                <input
                  type="text"
                  value={ytTags}
                  onChange={(e) => setYtTags(e.target.value)}
                  placeholder="Tags (ex.: taverna, calmo)"
                  className="rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-3 py-2 text-xs text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none transition"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={addingYt}
            className="taste-btn w-full rounded-lg bg-[#cc001e] hover:bg-[#e00022] text-white font-bold py-2.5 text-xs transition flex items-center justify-center gap-2 shadow-brand-glow-sm disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {addingYt ? 'Importando do YouTube...' : 'Adicionar Faixa ou Playlist'}
          </button>
        </form>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#141417] border border-[#2a2a33] rounded-md p-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#cbd5e1] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por título ou tag..."
            className="w-full rounded-lg border border-[#2a2a33] bg-[#0e0e0e] pl-9 pr-4 py-2 text-xs text-[#f0f4f5] placeholder-[#4f5660] focus:border-[#cc001e] focus:outline-none transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'Todas' },
              { id: 'mp3', label: 'MP3 / M4A' },
              { id: 'youtube', label: 'YouTube' },
              { id: 'ambient', label: '🌧️ Ambiente' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`taste-btn px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                filterType === tab.id
                  ? 'bg-[#cc001e] text-white shadow-brand-glow-sm'
                  : 'bg-[#1a1a1f] text-[#cbd5e1] hover:text-[#f0f4f5] hover:bg-[#23232a]'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {allTags.length > 0 && (
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="rounded-md border border-[#2a2a33] bg-[#1a1a1f] px-3 py-1.5 text-xs text-[#cbd5e1] focus:border-[#cc001e] focus:outline-none"
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
        <div className="rounded-md border border-[#2a2a33] bg-[#141417] p-12 text-center">
          <Music className="w-8 h-8 text-[#4f5660] mx-auto mb-2" />
          <p className="text-sm text-[#f0f4f5] font-semibold">Nenhuma faixa encontrada</p>
          <p className="text-xs text-[#cbd5e1] mt-1">
            Envie um arquivo MP3 ou importe uma trilha do YouTube nos painéis acima.
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
                className={`taste-card rounded-lg border p-3 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isCurrent
                    ? 'border-[#cc001e] bg-[#cc001e]/10 shadow-brand-glow-sm'
                    : 'border-[#24242b] bg-[#141417] hover:border-[#383842]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    onClick={() => onPlayTrack(track)}
                    className={`taste-btn w-9 h-9 rounded-md flex items-center justify-center shrink-0 transition ${
                      isCurrent
                        ? 'bg-[#cc001e] text-white shadow-brand-glow-sm'
                        : 'bg-[#23232a] text-[#f0f4f5] hover:bg-[#cc001e] hover:text-white'
                    }`}
                    title="Tocar faixa agora"
                  >
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </button>

                  {track.thumbnailUrl ? (
                    <img
                      src={track.thumbnailUrl}
                      alt={track.title}
                      className="w-12 h-9 object-cover rounded-lg border border-[#2a2a33] shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-9 rounded-lg bg-[#0e0e0e] border border-[#2a2a33] flex items-center justify-center shrink-0">
                      {track.isAmbient ? (
                        <CloudRain className="w-4 h-4 text-[#cbd5e1]" />
                      ) : (
                        <Music className="w-4 h-4 text-[#cc001e]" />
                      )}
                    </div>
                  )}

                  {isEditing ? (
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="rounded-md border border-[#2a2a33] bg-[#0e0e0e] px-3 py-1.5 text-xs text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none"
                        placeholder="Título da faixa"
                      />
                      <input
                        type="text"
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        className="rounded-md border border-[#2a2a33] bg-[#0e0e0e] px-3 py-1.5 text-xs text-[#cbd5e1] focus:border-[#cc001e] focus:outline-none"
                        placeholder="Tags (separadas por vírgula)"
                      />
                      <label className="flex items-center gap-2 text-xs text-[#cbd5e1] sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={editAmbient}
                          onChange={(e) => setEditAmbient(e.target.checked)}
                          className="rounded accent-[#cc001e]"
                        />
                        Disponível como Som Ambiente (Loop)
                      </label>
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs sm:text-sm text-[#f0f4f5] truncate">
                          {track.title}
                        </span>
                        <span
                          className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                            track.sourceType === 'youtube'
                              ? 'border-[#cc001e]/40 bg-[#cc001e]/15 text-[#cc001e]'
                              : 'border-[#2a2a33] bg-[#0e0e0e] text-[#cbd5e1]'
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
                          <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300">
                            Loop
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {track.tags.map((tg) => (
                          <span
                            key={tg}
                            className="inline-flex items-center gap-0.5 text-[10px] text-[#cbd5e1] bg-[#0e0e0e] px-2 py-0.5 rounded-md border border-[#222228]"
                          >
                            <Tag className="w-2.5 h-2.5 text-[#5a5a66]" />
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
                        className="taste-btn rounded-md bg-emerald-500/20 border border-emerald-500/40 p-1.5 text-emerald-300 hover:bg-emerald-500/30"
                        title="Salvar"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="taste-btn rounded-md bg-[#23232a] p-1.5 text-[#cbd5e1] hover:text-[#f0f4f5]"
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
                          className="taste-btn rounded-md border border-[#2a2a33] bg-[#1a1a1f] px-2.5 py-1.5 text-xs text-[#cbd5e1] hover:border-[#cc001e] hover:text-[#f0f4f5] flex items-center gap-1"
                          title="Adicionar a uma playlist"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Playlist</span>
                        </button>

                        {addingToPlaylistTrackId === track.id && (
                          <div className="absolute right-0 mt-1 w-52 rounded-lg border border-[#2a2a33] bg-[#141417] shadow-2xl py-1.5 z-30 animate-in fade-in">
                            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#cbd5e1] border-b border-[#24242b]">
                              Adicionar em:
                            </div>
                            {playlists.map((pl) => (
                              <button
                                key={pl.id}
                                onClick={() => handleQuickAddToPlaylist(pl.id, track.id)}
                                className="taste-btn w-full text-left px-3 py-1.5 text-xs text-[#f0f4f5] hover:bg-[#cc001e]/20 hover:text-white truncate"
                              >
                                {pl.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => startEditing(track)}
                        className="taste-btn rounded-md p-1.5 text-[#cbd5e1] hover:bg-[#23232a] hover:text-[#f0f4f5]"
                        title="Renomear ou editar tags"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTrack(track)}
                        className="taste-btn rounded-md p-1.5 text-[#cbd5e1] hover:bg-[#cc001e]/20 hover:text-[#cc001e]"
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
