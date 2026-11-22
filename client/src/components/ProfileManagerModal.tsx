import React, { useState, useEffect } from 'react';
import { X, Plus, Edit3, Trash2, Check, UserCog, ListMusic, Sparkles } from 'lucide-react';
import type { MasterProfile } from '../types';
import { api } from '../services/api';

interface Props {
  open: boolean;
  profiles: MasterProfile[];
  activeProfileId: string;
  onSelectProfile: (profileId: string) => void;
  onProfilesChanged: () => Promise<MasterProfile[]>;
  onClose: () => void;
}

const AVATAR_PRESETS = [
  '👑', '🐉', '🧙', '⚔️', '🎲', '🦇', '🕯️', '🦊',
  '💀', '🌙', '🛡️', '🎭', '🔮', '🦉', '🔥', '🧭',
];

const COLOR_PRESETS = [
  '#cc001e',
  '#f59e0b',
  '#10b981',
  '#2563eb',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#64748b',
];

export const ProfileManagerModal: React.FC<Props> = ({
  open,
  profiles,
  activeProfileId,
  onSelectProfile,
  onProfilesChanged,
  onClose,
}) => {
  const [formMode, setFormMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('🧙');
  const [color, setColor] = useState('#cc001e');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFormMode('none');
      setEditingId(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const openCreateForm = () => {
    setFormMode('create');
    setEditingId(null);
    setName('');
    setAvatar('🧙');
    setColor('#cc001e');
    setDescription('');
    setError(null);
  };

  const openEditForm = (profile: MasterProfile) => {
    setFormMode('edit');
    setEditingId(profile.id);
    setName(profile.name);
    setAvatar(profile.avatar || '🎭');
    setColor(profile.color || '#cc001e');
    setDescription(profile.description || '');
    setError(null);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Informe o nome do mestre ou da campanha.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (formMode === 'create') {
        const { profile } = await api.createProfile({
          name: name.trim(),
          avatar,
          color,
          description: description.trim(),
        });
        await onProfilesChanged();
        onSelectProfile(profile.id);
        setFormMode('none');
      } else if (formMode === 'edit' && editingId) {
        await api.updateProfile(editingId, {
          name: name.trim(),
          avatar,
          color,
          description: description.trim(),
        });
        await onProfilesChanged();
        setFormMode('none');
        setEditingId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async (profile: MasterProfile) => {
    if (profiles.length <= 1) return;
    const confirmed = window.confirm(
      `Excluir o perfil "${profile.name}"?\n\nAs playlists e cenas deste perfil serão removidas, mas todas as faixas da Biblioteca compartilhada continuam salvas.`
    );
    if (!confirmed) return;

    setError(null);
    try {
      const res = await api.deleteProfile(profile.id);
      const updated = await onProfilesChanged();
      if (activeProfileId === profile.id) {
        const nextId = res.profiles[0]?.id || updated[0]?.id;
        if (nextId) onSelectProfile(nextId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir perfil.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-2xl rounded-md border border-[#2a2a33] bg-[#141417] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#24242b] px-6 py-4 bg-[#101013]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-[#cc001e]/15 border border-[#cc001e]/30 flex items-center justify-center text-[#cc001e]">
              <UserCog className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-sans text-base font-extrabold text-[#f0f4f5] tracking-tight">
                Perfis de Mestre
              </h2>
              <p className="text-[11px] text-[#cbd5e1]">
                Cada mestre possui suas próprias playlists e cenas. A biblioteca de áudios é compartilhada.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="taste-btn rounded-md p-2 text-[#cbd5e1] hover:text-[#f0f4f5] hover:bg-[#23232a]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-[#cc001e]/40 bg-[#cc001e]/10 px-4 py-2.5 text-xs text-[#f0f4f5]">
              {error}
            </div>
          )}

          {/* Create / Edit Profile Form */}
          {formMode !== 'none' ? (
            <form
              onSubmit={handleSaveForm}
              className="rounded-lg border border-[#2a2a33] bg-[#0e0e0e] p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#24242b] pb-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#f0f4f5]">
                  {formMode === 'create' ? 'Novo Perfil de Mestre' : 'Editar Perfil de Mestre'}
                </h3>
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="text-xs text-[#cbd5e1] hover:text-white"
                >
                  Voltar à lista
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#cbd5e1] mb-1.5">
                    Nome do Mestre / Campanha
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Mestre Lucas — Ordem Paranormal"
                    className="w-full rounded-lg border border-[#2a2a33] bg-[#141417] px-3.5 py-2 text-sm text-[#f0f4f5] placeholder-[#4f5660] focus:border-[#cc001e] focus:outline-none"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#cbd5e1] mb-1.5">
                    Descrição (opcional)
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex.: Mesa de sábado, terror investigativo"
                    className="w-full rounded-lg border border-[#2a2a33] bg-[#141417] px-3.5 py-2 text-sm text-[#f0f4f5] placeholder-[#4f5660] focus:border-[#cc001e] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#cbd5e1] mb-1.5">
                  Ícone / Avatar
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {AVATAR_PRESETS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setAvatar(em)}
                      className={`taste-btn w-9 h-9 rounded-md flex items-center justify-center text-base border transition ${
                        avatar === em
                          ? 'bg-[#cc001e]/20 border-[#cc001e] scale-105'
                          : 'bg-[#141417] border-[#2a2a33] hover:border-[#3d3d47]'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#cbd5e1] mb-1.5">
                  Cor do Perfil
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition ${
                        color.toLowerCase() === c.toLowerCase()
                          ? 'border-white scale-110 shadow-md'
                          : 'border-white/20 opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-7 w-10 cursor-pointer rounded border border-[#2a2a33] bg-[#141417] p-0.5"
                    title="Cor personalizada"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#24242b]">
                <button
                  type="button"
                  onClick={() => setFormMode('none')}
                  className="taste-btn rounded-lg border border-[#2a2a33] bg-[#1a1a1f] px-4 py-2 text-xs font-semibold text-[#cbd5e1] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="taste-btn inline-flex items-center gap-1.5 rounded-lg bg-[#cc001e] hover:bg-[#e00022] px-5 py-2 text-xs font-bold text-white shadow-brand-glow-sm disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving ? 'Salvando...' : formMode === 'create' ? 'Criar e Ativar' : 'Salvar'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#cbd5e1]">
                  Perfis cadastrados ({profiles.length})
                </span>
                <button
                  onClick={openCreateForm}
                  className="taste-btn inline-flex items-center gap-1.5 rounded-lg bg-[#cc001e] hover:bg-[#e00022] px-4 py-2 text-xs font-bold text-white shadow-brand-glow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Perfil de Mestre
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {profiles.map((profile) => {
                  const isActive = profile.id === activeProfileId;
                  return (
                    <div
                      key={profile.id}
                      onClick={() => {
                        onSelectProfile(profile.id);
                        onClose();
                      }}
                      className={`taste-card group relative rounded-lg border-2 p-4 cursor-pointer transition flex flex-col justify-between gap-3 ${
                        isActive
                          ? 'border-[#cc001e] bg-[#1b1417] shadow-brand-glow-sm'
                          : 'border-[#24242b] bg-[#0e0e0e] hover:border-[#3d3d47] hover:bg-[#17171c]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-11 h-11 rounded-lg flex items-center justify-center text-2xl shrink-0 border"
                            style={{
                              backgroundColor: `${profile.color || '#cc001e'}18`,
                              borderColor: `${profile.color || '#cc001e'}55`,
                            }}
                          >
                            {profile.avatar}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-extrabold text-[#f0f4f5] truncate">
                                {profile.name}
                              </h3>
                              {isActive && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-[#cc001e] text-white shrink-0">
                                  Ativo
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#cbd5e1] line-clamp-1 mt-0.5">
                              {profile.description || 'Playlists e cenas independentes'}
                            </p>
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => openEditForm(profile)}
                            className="taste-btn p-1.5 rounded-md bg-[#141417] border border-[#2a2a33] text-[#cbd5e1] hover:text-white"
                            title="Editar perfil"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteProfile(profile)}
                            disabled={profiles.length <= 1}
                            className="taste-btn p-1.5 rounded-md bg-[#141417] border border-[#2a2a33] text-[#cc001e] hover:bg-[#cc001e]/20 disabled:opacity-30 disabled:cursor-not-allowed"
                            title={
                              profiles.length <= 1
                                ? 'É necessário manter ao menos um perfil'
                                : 'Excluir perfil'
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[#24242b]/80 text-[11px] font-mono text-[#cbd5e1]">
                        <span className="inline-flex items-center gap-1">
                          <ListMusic className="w-3 h-3 text-[#cc001e]" />
                          {profile.playlistCount ?? 0}{' '}
                          {(profile.playlistCount ?? 0) === 1 ? 'playlist' : 'playlists'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-[#f59e0b]" />
                          {profile.sceneCount ?? 0}{' '}
                          {(profile.sceneCount ?? 0) === 1 ? 'cena' : 'cenas'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
