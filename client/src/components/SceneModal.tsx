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
  '⚔️', '🕯️', '🔥', '🌲', '🏰', '🌊', '🌧️', '🐉',
  '💀', '👑', '🍺', '🌙', '⚡', '🏔️', '🕳️', '🔮',
];

const COLOR_PRESETS = [
  { label: 'Carmesim', value: '#cc001e' },
  { label: 'Obsidiana', value: '#0e0e0e' },
  { label: 'Gelo', value: '#f0f4f5' },
  { label: 'Ouro', value: '#f59e0b' },
  { label: 'Esmeralda', value: '#10b981' },
  { label: 'Cobalto', value: '#2563eb' },
  { label: 'Ametista', value: '#8b5cf6' },
  { label: 'Tempestade', value: '#64748b' },
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
  const [emoji, setEmoji] = useState('⚔️');
  const [color, setColor] = useState('#cc001e');
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
      setColor(initialScene.color || '#cc001e');
      setPlaylistId(initialScene.playlistId || '');
      setAmbientTrackId(initialScene.ambientTrackId || '');
      setAmbientVolume(initialScene.ambientVolume ?? 0.35);
      setShortcutKey(initialScene.shortcutKey ? String(initialScene.shortcutKey) : '');
    } else {
      setName('');
      setEmoji('⚔️');
      setColor('#cc001e');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-lg rounded-md border border-[#2a2a33] bg-[#141417] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#24242b] px-6 py-4 bg-[#101013]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-[#cc001e]/15 border border-[#cc001e]/30 flex items-center justify-center text-[#cc001e]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-sans text-base font-bold text-[#f0f4f5] tracking-tight">
                {initialScene ? 'Editar Cena de Situação' : 'Nova Cena'}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#cc001e]"></span>
                <span className="text-[10px] font-mono text-[#cbd5e1] uppercase tracking-wider">Design Edge Controls</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="taste-btn rounded-md p-2 text-[#cbd5e1] hover:text-[#f0f4f5] hover:bg-[#23232a]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-[#cc001e]/40 bg-[#cc001e]/10 px-4 py-3 text-xs text-[#f0f4f5]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#cbd5e1] mb-1.5">
                Nome da Situação / Cena
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Batalha Sangrenta"
                className="w-full rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-4 py-2.5 text-sm text-[#f0f4f5] placeholder-[#4f5660] focus:border-[#cc001e] focus:ring-1 focus:ring-[#cc001e] focus:outline-none transition"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#cbd5e1] mb-1.5">
                Atalho (1 a 9)
              </label>
              <select
                value={shortcutKey}
                onChange={(e) => setShortcutKey(e.target.value)}
                className="w-full rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-3.5 py-2.5 text-sm text-[#f0f4f5] focus:border-[#cc001e] focus:ring-1 focus:ring-[#cc001e] focus:outline-none transition"
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
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#cbd5e1] mb-1.5">
              Emoji / Ícone
            </label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                className="w-16 text-center text-xl rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-2 py-2 text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none"
              />
              <div className="flex flex-wrap gap-1.5">
                {EMOJI_PRESETS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setEmoji(em)}
                    className={`taste-btn w-9 h-9 rounded-md flex items-center justify-center text-base border transition ${
                      emoji === em
                        ? 'bg-[#cc001e]/20 border-[#cc001e] text-white scale-105'
                        : 'bg-[#1a1a1f] border-[#2a2a33] hover:border-[#3d3d47] text-[#f0f4f5]'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#cbd5e1] mb-1.5">
              Cor de Destaque
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setColor(preset.value)}
                  className={`taste-btn flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium border transition ${
                    color.toLowerCase() === preset.value.toLowerCase()
                      ? 'border-[#cc001e] bg-[#23232a] text-[#f0f4f5] shadow-brand-glow-sm'
                      : 'border-[#2a2a33] bg-[#0e0e0e] text-[#cbd5e1] hover:border-[#3d3d47]'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full inline-block border border-white/20"
                    style={{ backgroundColor: preset.value }}
                  />
                  {preset.label}
                </button>
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-11 cursor-pointer rounded-md border border-[#2a2a33] bg-[#0e0e0e] p-1"
                title="Escolher cor personalizada"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#cbd5e1] mb-1.5">
              Playlist Principal Associada
            </label>
            <select
              value={playlistId}
              onChange={(e) => setPlaylistId(e.target.value)}
              className="w-full rounded-lg border border-[#2a2a33] bg-[#0e0e0e] px-4 py-2.5 text-sm text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none"
            >
              <option value="">-- Nenhuma playlist (apenas som de ambiente) --</option>
              {playlists.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name} ({pl.tracks.length} faixas)
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border border-[#2a2a33] bg-[#0e0e0e] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#cc001e] flex items-center gap-1.5">
                <Volume2 className="w-4 h-4" />
                Camada de Som Ambiente em Loop
              </label>
              <span className="text-xs font-mono text-[#f0f4f5]">
                {Math.round(ambientVolume * 100)}%
              </span>
            </div>

            <select
              value={ambientTrackId}
              onChange={(e) => setAmbientTrackId(e.target.value)}
              className="w-full rounded-md border border-[#2a2a33] bg-[#141417] px-3.5 py-2 text-xs text-[#f0f4f5] focus:border-[#cc001e] focus:outline-none"
            >
              <option value="">Sem som ambiente nesta cena</option>
              {ambientTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.isAmbient ? '🌧️ ' : '🎵 '}
                  {t.title}
                </option>
              ))}
            </select>

            {ambientTrackId && (
              <div className="flex items-center gap-3 pt-1">
                <span className="text-xs text-[#cbd5e1]">Volume:</span>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={ambientVolume}
                  onChange={(e) => setAmbientVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-[#cc001e]"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#24242b]">
            <button
              type="button"
              onClick={onClose}
              className="taste-btn rounded-lg border border-[#2a2a33] bg-[#1a1a1f] px-5 py-2.5 text-xs font-semibold text-[#cbd5e1] hover:text-[#f0f4f5] hover:bg-[#23232a]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="taste-btn rounded-lg bg-[#cc001e] hover:bg-[#e00022] px-6 py-2.5 text-xs font-bold text-white shadow-brand-glow-sm disabled:opacity-50"
            >
              {saving ? 'Salvando...' : initialScene ? 'Salvar Alterações' : 'Criar Cena'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
