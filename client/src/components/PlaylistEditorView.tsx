import React, { useState } from 'react';
import {
  Play,
  GripVertical,
  Trash2,
  Plus,
  Copy,
  Edit3,
  Check,
  X,
  Music,
  Youtube,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { Playlist, Track } from '../types';
import { api } from '../services/api';

interface Props {
  playlist: Playlist;
  allTracks: Track[];
  currentTrackId: string | null;
  onPlayPlaylist: (playlist: Playlist, startIndex?: number) => void;
  onRefreshData: () => Promise<void>;
  onSelectPlaylistId: (id: string | null) => void;
}

export const PlaylistEditorView: React.FC<Props> = ({
  playlist,
  allTracks,
  currentTrackId,
  onPlayPlaylist,
  onRefreshData,
  onSelectPlaylistId,
}) => {
  const [editingHeader, setEditingHeader] = useState(false);
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [selectedAddTrackId, setSelectedAddTrackId] = useState<string>('');
  const [ytImportUrl, setYtImportUrl] = useState<string>('');
  const [importingYt, setImportingYt] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handleSaveHeader = async () => {
    if (!name.trim()) return;
    await api.updatePlaylist(playlist.id, {
      name: name.trim(),
      description: description.trim(),
    });
    setEditingHeader(false);
    await onRefreshData();
  };

  const handleDuplicate = async () => {
    const { playlist: copy } = await api.duplicatePlaylist(playlist.id);
    await onRefreshData();
    onSelectPlaylistId(copy.id);
  };

  const handleDeletePlaylist = async () => {
    if (!window.confirm(`Deseja excluir a playlist "${playlist.name}"?`)) return;
    await api.deletePlaylist(playlist.id);
    await onRefreshData();
    onSelectPlaylistId(null);
  };

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= playlist.tracks.length) return;
    const updated = [...playlist.tracks];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    await api.reorderPlaylistTracks(
      playlist.id,
      updated.map((t) => t.id)
    );
    await onRefreshData();
  };

  const handleRemoveAtIndex = async (idx: number) => {
    const updated = playlist.tracks.filter((_, i) => i !== idx);
    await api.reorderPlaylistTracks(
      playlist.id,
      updated.map((t) => t.id)
    );
    await onRefreshData();
  };

  const handleAddTrack = async () => {
    if (!selectedAddTrackId) return;
    await api.addTrackToPlaylist(playlist.id, selectedAddTrackId);
    setSelectedAddTrackId('');
    await onRefreshData();
  };

  const handleImportYouTubeUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytImportUrl.trim()) return;
    setImportingYt(true);
    setImportError(null);
    try {
      const res = await api.addYouTubeTrack({
        url: ytImportUrl.trim(),
        targetPlaylistId: playlist.id,
      });
      if (!res.isPlaylistImport && res.track) {
        await api.addTrackToPlaylist(playlist.id, res.track.id);
      }
      setYtImportUrl('');
      await onRefreshData();
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : 'Erro ao importar playlist ou link do YouTube.'
      );
    } finally {
      setImportingYt(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Playlist Header Card */}
      <div className="taste-card rounded-md border border-[#2a2a33] bg-[#141417] p-6 shadow-card-elevated">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {editingHeader ? (
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-4 py-2 text-base font-bold text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição da playlist..."
                className="w-full rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-4 py-2 text-xs text-[#cbd5e1] focus:border-[#cc001e] focus:outline-none"
              />
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleSaveHeader}
                  className="taste-btn inline-flex items-center gap-1.5 rounded-md bg-[#cc001e] px-4 py-1.5 text-xs font-bold text-white shadow-brand-glow-sm"
                >
                  <Check className="w-3.5 h-3.5" /> Salvar
                </button>
                <button
                  onClick={() => setEditingHeader(false)}
                  className="taste-btn inline-flex items-center gap-1.5 rounded-md bg-[#23232a] px-3.5 py-1.5 text-xs text-[#cbd5e1] hover:text-[#f0f4f5]"
                >
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="font-sans text-xl font-extrabold tracking-tight text-[#f0f4f5]">
                  {playlist.name}
                </h2>
                <span className="rounded-full bg-[#cc001e]/15 border border-[#cc001e]/30 px-3 py-0.5 text-xs font-mono font-bold text-[#cc001e]">
                  {playlist.tracks.length} faixas
                </span>
              </div>
              <p className="text-xs text-[#cbd5e1]">
                {playlist.description || 'Arraste as faixas para reordenar a sequência de reprodução.'}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onPlayPlaylist(playlist, 0)}
              disabled={playlist.tracks.length === 0}
              className="taste-btn inline-flex items-center gap-2 rounded-lg bg-[#cc001e] hover:bg-[#e00022] text-white font-bold px-5 py-2.5 text-xs transition disabled:opacity-40 shadow-brand-glow-sm"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              Tocar Playlist
            </button>

            <button
              onClick={() => {
                setName(playlist.name);
                setDescription(playlist.description);
                setEditingHeader(true);
              }}
              className="taste-btn inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a33] bg-[#0e0e0e] hover:bg-[#23232a] px-3.5 py-2.5 text-xs text-[#f0f4f5]"
              title="Renomear playlist"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Renomear
            </button>

            <button
              onClick={handleDuplicate}
              className="taste-btn inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a33] bg-[#0e0e0e] hover:bg-[#23232a] px-3.5 py-2.5 text-xs text-[#f0f4f5]"
              title="Duplicar playlist"
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicar
            </button>

            <button
              onClick={handleDeletePlaylist}
              className="taste-btn inline-flex items-center gap-1.5 rounded-lg border border-[#cc001e]/30 bg-[#cc001e]/10 hover:bg-[#cc001e]/20 px-3.5 py-2.5 text-xs text-[#cc001e]"
              title="Excluir playlist"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Add track from library or import YouTube link */}
        <div className="mt-5 pt-5 border-t border-[#24242b] space-y-3">
          {importError && (
            <div className="rounded-lg border border-[#cc001e]/40 bg-[#cc001e]/10 px-4 py-2.5 text-xs text-[#f0f4f5]">
              {importError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <select
              value={selectedAddTrackId}
              onChange={(e) => setSelectedAddTrackId(e.target.value)}
              className="flex-1 rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-4 py-2.5 text-xs text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none"
            >
              <option value="">+ Selecionar faixa da biblioteca para incluir...</option>
              {allTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.sourceType.toUpperCase()}] {t.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddTrack}
              disabled={!selectedAddTrackId}
              className="taste-btn rounded-lg bg-[#23232a] hover:bg-[#cc001e] hover:text-white text-[#f0f4f5] font-semibold px-4 py-2.5 text-xs transition inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              Adicionar
            </button>
          </div>

          <form
            onSubmit={handleImportYouTubeUrl}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
          >
            <input
              type="text"
              value={ytImportUrl}
              onChange={(e) => setYtImportUrl(e.target.value)}
              placeholder="Cole link de vídeo ou playlist do YouTube (music.youtube.com/playlist?list=...)"
              className="flex-1 rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-4 py-2.5 text-xs text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!ytImportUrl.trim() || importingYt}
              className="taste-btn rounded-lg bg-[#cc001e] hover:bg-[#e00022] text-white font-bold px-5 py-2.5 text-xs transition inline-flex items-center justify-center gap-2 disabled:opacity-40 shadow-brand-glow-sm"
            >
              <Youtube className="w-4 h-4" />
              {importingYt ? 'Importando...' : 'Importar do YouTube'}
            </button>
          </form>
        </div>
      </div>

      {/* Draggable Track Queue */}
      {playlist.tracks.length === 0 ? (
        <div className="rounded-md border border-[#2a2a33] bg-[#141417] p-12 text-center">
          <Music className="w-8 h-8 text-[#4f5660] mx-auto mb-2" />
          <p className="text-sm text-[#f0f4f5] font-semibold">Playlist vazia</p>
          <p className="text-xs text-[#cbd5e1] mt-1">
            Adicione faixas da biblioteca ou cole links do YouTube para compor a playlist.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {playlist.tracks.map((track, idx) => {
            const isPlayingThis = currentTrackId === track.id;
            const isDragOver = dragOverIndex === idx;

            return (
              <div
                key={`${track.id}-${idx}`}
                draggable
                onDragStart={() => setDraggedIndex(idx)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverIndex(idx);
                }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverIndex(null);
                  if (draggedIndex !== null) {
                    handleReorder(draggedIndex, idx);
                    setDraggedIndex(null);
                  }
                }}
                className={`taste-card rounded-lg border p-3.5 transition flex items-center justify-between gap-3 cursor-grab active:cursor-grabbing ${
                  isDragOver
                    ? 'border-[#cc001e] bg-[#cc001e]/20 scale-[1.01]'
                    : isPlayingThis
                    ? 'border-[#cc001e] bg-[#cc001e]/10 shadow-brand-glow-sm'
                    : 'border-[#24242b] bg-[#141417] hover:border-[#383842]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <GripVertical className="w-4 h-4 text-[#5a5a66] shrink-0" />
                  <span className="w-6 text-xs font-mono text-[#cbd5e1] text-center shrink-0">
                    {idx + 1}
                  </span>
                  <button
                    onClick={() => onPlayPlaylist(playlist, idx)}
                    className={`taste-btn w-9 h-9 rounded-md flex items-center justify-center shrink-0 transition ${
                      isPlayingThis
                        ? 'bg-[#cc001e] text-white shadow-brand-glow-sm'
                        : 'bg-[#23232a] text-[#f0f4f5] hover:bg-[#cc001e] hover:text-white'
                    }`}
                    title="Tocar a partir desta faixa"
                  >
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-semibold text-[#f0f4f5] truncate">
                        {track.title}
                      </span>
                      {track.sourceType === 'youtube' ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase px-2 py-0.5 rounded-full border border-[#cc001e]/30 bg-[#cc001e]/10 text-[#cc001e]">
                          <Youtube className="w-3 h-3" /> YT
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded-full border border-[#2a2a33] bg-[#0e0e0e] text-[#cbd5e1]">
                          MP3
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#cbd5e1] truncate mt-0.5">
                      {track.tags.map((t) => `#${t}`).join('  ')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleReorder(idx, idx - 1)}
                    disabled={idx === 0}
                    className="taste-btn p-1.5 rounded-md text-[#cbd5e1] hover:bg-[#23232a] hover:text-[#f0f4f5] disabled:opacity-25"
                    title="Mover para cima"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleReorder(idx, idx + 1)}
                    disabled={idx === playlist.tracks.length - 1}
                    className="taste-btn p-1.5 rounded-md text-[#cbd5e1] hover:bg-[#23232a] hover:text-[#f0f4f5] disabled:opacity-25"
                    title="Mover para baixo"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRemoveAtIndex(idx)}
                    className="taste-btn p-1.5 rounded-md text-[#cbd5e1] hover:bg-[#cc001e]/20 hover:text-[#cc001e]"
                    title="Remover faixa da playlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
