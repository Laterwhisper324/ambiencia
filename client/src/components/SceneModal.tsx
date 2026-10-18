import React, { useState, useEffect } from 'react';
import { X, Sparkles, Volume2 } from 'lucide-react';
import type { Playlist, SceneButton, Track } from '../types';

interface Props {
  open: boolean;
  initialScene: SceneButton | null;
  playlists: Playlist[];
  ambientTracks: Track[];
  onClose: () => void;
  onSave: (payload: {
    name: string;
    emoji: string;
    color: string;
    playlistId: string | null;
    ambientTrackId: string | null;
    ambientVolume: number;
    shortcutKey: number | null;
  }) => Promise<void>;
}

const EMOJI_PRESETS = [
  '🌲', '⚔️', '🏰', '🌊', '🕯️', '🌧️', '🐉', '🔥',
  '💀', '👑', '🍺', '🌙', '⚡', '🏔️', '🕳️', '🔮',
];

const COLOR_PRESETS = [
  { label: 'Esmeralda', value: '#10b981' },
  { label: 'Carmesim', value: '#ef4444' },
  { label: 'Âmbar', value: '#f59e0b' },
  { label: 'Oceano', value: '#0ea5e9' },
  { label: 'Ametista', value: '#8b5cf6' },
  { label: 'Tempestade', value: '#64748b' },
  { label: 'Rosa Arcano', value: '#ec4899' },
  { label: 'Cobre', value: '#ea580c' },
];

export const SceneModal: React.FC<Props> = ({
  open,
  initialScene,
  playlists,
  ambientTracks,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🌲');
  const [color, setColor] = useState('#10b981');
  const [playlistId, setPlaylistId] = useState<string>('');
  const [ambientTrackId, setAmbientTrackId] = useState<string>('');
  const [ambientVolume, setAmbientVolume] = useState<number>(0.35);
  const [shortcutKey, setShortcutKey] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialScene) {
      setName(initialScene.name);
      setEmoji(initialScene.emoji);
      setColor(initialScene.color);
      setPlaylistId(initialScene.playlistId || '');
      setAmbientTrackId(initialScene.ambientTrackId || '');
      setAmbientVolume(initialScene.ambientVolume ?? 0.35);
      setShortcutKey(initialScene.shortcutKey ? String(initialScene.shortcutKey) : '');
    } else {
      setName('');
      setEmoji('🌲');
      setColor('#10b981');
      setPlaylistId(playlists[0]?.id || '');
      setAmbientTrackId('');
      setAmbientVolume(0.35);
      setShortcutKey('');
    }
    setError(null);
  }, [initialScene, open, playlists]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Informe um nome para a cena.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parsedShortcut = shortcutKey ? parseInt(shortcutKey, 10) : null;
      await onSave({
        name: name.trim(),
        emoji: emoji.trim() || '🎭',
        color,
        playlistId: playlistId || null,
        ambientTrackId: ambientTrackId || null,
        ambientVolume,
        shortcutKey:
          parsedShortcut && parsedShortcut >= 1 && parsedShortcut <= 9
            ? parsedShortcut
            : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cena.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#131822] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="font-display text-lg font-bold text-slate-100">
              {initialScene ? 'Editar Botão de Cena' : 'Nova Cena de Situação'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
                Nome da Situação / Cena
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Floresta Sombria"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
                Atalho (1 a 9)
              </label>
              <select
                value={shortcutKey}
                onChange={(e) => setShortcutKey(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="">Sem atalho</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => (
                  <option key={k} value={k}>
                    Tecla {k}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
              Emoji / Ícone
            </label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                className="w-16 text-center text-xl rounded-xl border border-slate-700 bg-slate-900 px-2 py-1.5"
              />
              <div className="flex flex-wrap gap-1.5">
                {EMOJI_PRESETS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setEmoji(em)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-base transition ${
                      emoji === em
                        ? 'bg-amber-500/25 border border-amber-500'
                        : 'bg-slate-800/70 hover:bg-slate-700 border border-transparent'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
              Cor do Botão
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setColor(preset.value)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition ${
                    color.toLowerCase() === preset.value.toLowerCase()
                      ? 'border-white bg-slate-800 text-white shadow-sm'
                      : 'border-slate-700/70 bg-slate-900/60 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full inline-block"
                    style={{ backgroundColor: preset.value }}
                  />
                  {preset.label}
                </button>
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-slate-700 bg-slate-900 p-0.5"
                title="Escolher cor personalizada"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
              Playlist Principal Associada
            </label>
            <select
              value={playlistId}
              onChange={(e) => setPlaylistId(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
            >
              <option value="">-- Nenhuma playlist (apenas camada ambiente) --</option>
              {playlists.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name} ({pl.tracks.length} faixas)
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4" />
                Camada de Som Ambiente Opcional (Loop)
              </label>
              <span className="text-xs font-mono text-slate-400">
                Vol: {Math.round(ambientVolume * 100)}%
              </span>
            </div>

            <select
              value={ambientTrackId}
              onChange={(e) => setAmbientTrackId(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
            >
              <option value="">Sem som ambiente automático nesta cena</option>
              {ambientTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.isAmbient ? '🌧️ ' : '🎵 '}
                  {t.title}
                </option>
              ))}
            </select>

            {ambientTrackId && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">Volume Ambiente:</span>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={ambientVolume}
                  onChange={(e) => setAmbientVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-teal-400"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : initialScene ? 'Salvar Alterações' : 'Criar Botão de Cena'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
