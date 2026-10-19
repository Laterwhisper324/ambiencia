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
          : 'Erro ao importar link/playlist do YouTube Music.'
      );
    } finally {
      setImportingYt(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Playlist Header Card */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-[#141A29] to-[#0E131D] p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {editingHeader ? (
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-base font-bold text-white"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição da playlist..."
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300"
              />
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleSaveHeader}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
                >
                  <Check className="w-3.5 h-3.5" /> Salvar
                </button>
                <button
                  onClick={() => setEditingHeader(false)}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300"
                >
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h2 className="font-display text-xl font-bold text-slate-100">
                  {playlist.name}
                </h2>
                <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-mono text-amber-300">
                  {playlist.tracks.length} faixas
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {playlist.description || 'Arraste e solte as faixas abaixo para reordenar a sequência da playlist.'}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onPlayPlaylist(playlist, 0)}
              disabled={playlist.tracks.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-4 py-2 text-xs transition disabled:opacity-40"
            >
              <Play className="w-4 h-4 fill-current" />
              Tocar Playlist
            </button>

            <button
              onClick={() => {
                setName(playlist.name);
                setDescription(playlist.description);
                setEditingHeader(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 px-3 py-2 text-xs text-slate-200"
              title="Renomear playlist"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Renomear
            </button>

            <button
              onClick={handleDuplicate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 px-3 py-2 text-xs text-slate-200"
              title="Duplicar playlist"
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicar
            </button>

            <button
              onClick={handleDeletePlaylist}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-2 text-xs text-red-300"
              title="Excluir playlist"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Add track from library or import YouTube Music link/playlist */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2.5">
          {importError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {importError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <select
              value={selectedAddTrackId}
              onChange={(e) => setSelectedAddTrackId(e.target.value)}
              className="flex-1 rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="">+ Escolher faixa da biblioteca para adicionar nesta playlist...</option>
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
              className="rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-semibold px-4 py-2 text-xs transition inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              Adicionar da Biblioteca
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
              placeholder="Ou cole link de faixa / playlist do YouTube ou YouTube Music (music.youtube.com/playlist?list=...)"
              className="flex-1 rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2 text-xs text-slate-200 focus:border-red-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!ytImportUrl.trim() || importingYt}
              className="rounded-xl bg-red-500/90 hover:bg-red-500 text-white font-semibold px-4 py-2 text-xs transition inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Youtube className="w-4 h-4" />
              {importingYt ? 'Importando...' : 'Importar Link / Playlist YT'}
            </button>
          </form>
        </div>
      </div>

      {/* Draggable Track Queue */}
      {playlist.tracks.length === 0 ? (
        <div className="rounded-2xl border border-slate-800/80 bg-[#121722]/40 p-10 text-center">
          <Music className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-300 font-medium">Playlist vazia</p>
          <p className="text-xs text-slate-500 mt-1">
            Use o seletor acima ou a Biblioteca Central para adicionar músicas MP3 ou links do YouTube.
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
                className={`rounded-xl border p-3 transition flex items-center justify-between gap-3 cursor-grab active:cursor-grabbing ${
                  isDragOver
                    ? 'border-amber-400 bg-amber-500/15 scale-[1.01]'
                    : isPlayingThis
                    ? 'border-amber-500/60 bg-amber-500/10'
                    : 'border-slate-800/80 bg-[#121722]/85 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <GripVertical className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="w-6 text-xs font-mono text-slate-500 text-center shrink-0">
                    {idx + 1}
                  </span>
                  <button
                    onClick={() => onPlayPlaylist(playlist, idx)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition ${
                      isPlayingThis
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-200 hover:bg-amber-500 hover:text-slate-950'
                    }`}
                    title="Tocar a partir desta faixa"
                  >
                    <Play className="w-4 h-4 fill-current" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-100 truncate">
                        {track.title}
                      </span>
                      {track.sourceType === 'youtube' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-300">
                          <Youtube className="w-3 h-3" /> YT
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                          MP3
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      {track.tags.map((t) => `#${t}`).join('  ')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleReorder(idx, idx - 1)}
                    disabled={idx === 0}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-25"
                    title="Mover para cima"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleReorder(idx, idx + 1)}
                    disabled={idx === playlist.tracks.length - 1}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-25"
                    title="Mover para baixo"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRemoveAtIndex(idx)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-red-500/15 hover:text-red-400"
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
