import React, { useEffect, useRef, useState } from 'react';
import {
  Cloud,
  CloudOff,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { api, type CloudSyncStatus } from '../services/api';

interface Props {
  onRefreshData: () => Promise<void>;
}

export const CloudBackupPanel: React.FC<Props> = ({ onRefreshData }) => {
  const [status, setStatus] = useState<CloudSyncStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await api.getBackupStatus();
      setStatus(res.status);
    } catch {
      // Non-fatal; leave status as-is
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  const handleForceSync = async () => {
    setFeedback(null);
    setSyncing(true);
    try {
      const res = await api.forceCloudSync();
      setStatus(res.status);
      setFeedback({
        type: 'success',
        text: `Sincronizado na nuvem (${res.status.counts.profiles} perfis, ${res.status.counts.linkTracks} links, ${res.status.counts.playlists} playlists, ${res.status.counts.scenes} cenas).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Falha ao sincronizar com a nuvem.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = async () => {
    setFeedback(null);
    setExporting(true);
    try {
      const { snapshot } = await api.exportBackupJson();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateSlug = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `ambiencia-backup-${dateSlug}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setFeedback({
        type: 'success',
        text: `Backup exportado: ${snapshot.profiles.length} perfis, ${snapshot.tracks.length} links, ${snapshot.playlists.length} playlists e ${snapshot.scenes.length} cenas.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao exportar backup JSON.',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      importMode === 'replace' &&
      !window.confirm(
        'Modo SUBSTITUIR selecionado: isso substituirá todos os perfis, links, playlists e cenas atuais pelos dados deste arquivo JSON. Deseja continuar?'
      )
    ) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFeedback(null);
    setImporting(true);
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const res = await api.importBackupJson(parsed, importMode);
      setStatus(res.status);
      await onRefreshData();

      const r = res.result;
      setFeedback({
        type: 'success',
        text:
          `Backup importado (${importMode === 'replace' ? 'substituído' : 'mesclado'}): ` +
          `${r.profilesRestored} perfis, ${r.tracksRestored} links, ${r.playlistsRestored} playlists, ${r.scenesRestored} cenas` +
          (res.syncedToCloud ? ' • salvo no Upstash Redis.' : '.'),
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof SyntaxError
            ? 'O arquivo selecionado não é um JSON válido.'
            : err instanceof Error
            ? err.message
            : 'Erro ao importar backup JSON.',
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formattedLastSync = status?.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="taste-card rounded-md border border-[#2a2a33] bg-[#141417] p-4 space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
              status?.enabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-[#0e0e0e] border-[#2a2a33] text-[#cbd5e1]'
            }`}
          >
            {status?.enabled ? (
              <Cloud className="w-4 h-4" />
            ) : (
              <CloudOff className="w-4 h-4" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[#f0f4f5]">
                Persistência & Backup de Links
              </span>
              {status ? (
                status.enabled ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Upstash Redis Ativo
                    {formattedLastSync ? ` • ${formattedLastSync}` : ''}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                    Nuvem não configurada (use JSON manual)
                  </span>
                )
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#0e0e0e] text-[#cbd5e1] border border-[#2a2a33]">
                  {loadingStatus ? 'Verificando...' : 'Backup'}
                </span>
              )}
            </div>

            <p className="text-[11px] text-[#cbd5e1] mt-0.5 leading-relaxed">
              {status?.enabled
                ? `Perfis (${status.counts.profiles}), músicas por link (${status.counts.linkTracks}), playlists (${status.counts.playlists}) e cenas (${status.counts.scenes}) sincronizam automaticamente para sobreviver à hibernação do Render. Arquivos MP3/M4A locais não entram no backup.`
                : 'Configure UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN no Render para sincronização automática na nuvem, ou exporte/importe seu backup JSON abaixo.'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {status?.enabled && (
            <button
              type="button"
              disabled={syncing}
              onClick={handleForceSync}
              className="taste-btn rounded-md border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition flex items-center gap-1.5 disabled:opacity-50"
              title="Forçar sincronização imediata com Upstash Redis"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
            </button>
          )}

          <button
            type="button"
            disabled={exporting}
            onClick={handleExport}
            className="taste-btn rounded-md border border-[#2a2a33] bg-[#1a1a1f] hover:border-[#cc001e] hover:text-white px-3 py-1.5 text-xs font-semibold text-[#f0f4f5] transition flex items-center gap-1.5 disabled:opacity-50"
            title="Baixar arquivo .json com perfis, links, playlists e cenas"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting ? 'Exportando...' : 'Exportar JSON'}</span>
          </button>

          <div className="flex items-center rounded-md border border-[#2a2a33] bg-[#0e0e0e] overflow-hidden">
            <select
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
              className="bg-transparent px-2 py-1.5 text-[11px] text-[#cbd5e1] focus:outline-none border-r border-[#2a2a33]"
              title="Modo de importação do JSON"
            >
              <option value="merge" className="bg-[#141417]">
                Mesclar
              </option>
              <option value="replace" className="bg-[#141417]">
                Substituir
              </option>
            </select>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              type="button"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className="taste-btn px-3 py-1.5 text-xs font-semibold text-[#f0f4f5] hover:bg-[#cc001e] hover:text-white transition flex items-center gap-1.5 disabled:opacity-50"
              title="Restaurar perfis, links, playlists e cenas de um arquivo .json"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{importing ? 'Importando...' : 'Importar JSON'}</span>
            </button>
          </div>
        </div>
      </div>

      {status?.lastError && (
        <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Último aviso de sincronização: {status.lastError}</span>
        </div>
      )}

      {feedback && (
        <div
          className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${
            feedback.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-[#cc001e]/40 bg-[#cc001e]/10 text-[#f0f4f5]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-[#cc001e] shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-current opacity-75 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
