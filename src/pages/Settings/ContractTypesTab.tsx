import React, { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import { Download, Eye, EyeOff, Loader2, Pencil, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { invokeNodeApi } from '@/lib/backendApi';
import { parseCsv } from '@/lib/taxonomyCsv';
import {
  CONTRACT_TYPES_QUERY_KEY,
  contractTypeLabel,
  useContractTypes,
  type ContractType,
} from '@/hooks/useContractTypes';
import { InlineEdit } from './MatterTypesTab';

/**
 * Settings → Contract types (firm admins). Backend: /api/v1/contract-types
 * (routes/api/contractTypes.ts). Same rules as Settings → Matter types:
 * removing a default hides it for this firm; removing an own type deletes it,
 * or retires it when contracts use it. Everything removed can be restored.
 *
 * CSV: contract_type[,description], comma/semicolon/tab, optional header.
 */

const API = '/api/v1/contract-types';

interface ImportRow {
  name: string;
  description?: string;
}

function csvToRows(text: string): ImportRow[] {
  const table = parseCsv(text);
  const first = (table[0] ?? []).map((c) => c.trim().toLowerCase());
  if (first.some((c) => ['type', 'τύπος', 'τυπος', 'name', 'όνομα'].some((h) => c.includes(h)))) {
    table.shift();
  }
  return table
    .map((r) => ({ name: (r[0] ?? '').trim(), description: (r[1] ?? '').trim() || undefined }))
    .filter((r) => r.name);
}

function toCsv(types: ContractType[]): string {
  const cell = (v: string | null | undefined) => {
    const s = v ?? '';
    return /[",;\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ['contract_type,description', ...types.map((t) => [t.name, t.description].map(cell).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export default function ContractTypesTab() {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const { data, isLoading } = useContractTypes();

  const [showRemoved, setShowRemoved] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDefaults, setConfirmDefaults] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [importFile, setImportFile] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canManage = data?.can_manage ?? false;
  const all = data?.types ?? [];
  const types = useMemo(() => all.filter((ct) => showRemoved || !ct.removed), [all, showRemoved]);
  const activeCount = all.filter((ct) => !ct.removed).length;
  const activeDefaults = all.filter((ct) => !ct.removed && ct.is_default).length;

  const call = async <T,>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) => {
    try {
      const res = await invokeNodeApi<T>(`${API}${path}`, { method, body });
      queryClient.invalidateQueries({ queryKey: CONTRACT_TYPES_QUERY_KEY });
      // A rename also renames the type on existing contracts.
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      return res;
    } catch (err) {
      toast.error(t('common:errors.saveFailed'), {
        description: err instanceof Error ? err.message : undefined,
      });
      throw err;
    }
  };

  const remove = async (ct: ContractType) => {
    const r = await call<{ result: string; contract_count: number }>(`/${ct.id}`, 'DELETE');
    const name = contractTypeLabel(t, ct);
    toast.success(
      r.result === 'hidden'
        ? t('contractTypes.removal.hidden', { name })
        : r.result === 'retired'
          ? t('contractTypes.removal.retired', { name, count: r.contract_count })
          : t('contractTypes.removal.deleted', { name })
    );
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(all.filter((ct) => !ct.removed))], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contract-types.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const rows = csvToRows(await file.text());
    if (!rows.length) {
      toast.error(t('matterTypes.import.noRows'), { description: t('contractTypes.import.expectedColumns') });
      return;
    }
    setImportFile(file.name);
    setImportMode('merge');
    setImportRows(rows);
  };

  const runImport = async () => {
    if (!importRows) return;
    setImporting(true);
    try {
      const replace = importMode === 'replace';
      const r = await call<Record<string, number>>('/import', 'POST', { rows: importRows, replace });
      toast.success(t('matterTypes.import.complete'), {
        description: t(replace ? 'contractTypes.import.summaryReplace' : 'contractTypes.import.summary', r),
      });
      setImportRows(null);
    } catch {
      /* toast already shown */
    } finally {
      setImporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('common:status.loading')}
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <p className="text-sm text-muted-foreground">
        <Trans t={t} i18nKey="contractTypes.intro" components={{ strong: <strong /> }} />
      </p>

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> {t('contractTypes.addType')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> {t('matterTypes.importCsv')}
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!activeCount}>
            <Download className="mr-1 h-4 w-4" /> {t('matterTypes.exportCsv')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmDefaults(true)} disabled={!activeDefaults}>
            <Trash2 className="mr-1 h-4 w-4" />{' '}
            {t('contractTypes.removeAllDefaults', { count: activeDefaults })}
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          <div className="ml-auto flex items-center gap-2">
            <Switch id="ct-show-removed" checked={showRemoved} onCheckedChange={setShowRemoved} />
            <Label htmlFor="ct-show-removed" className="flex items-center gap-1 text-sm">
              {showRemoved ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{' '}
              {t('matterTypes.showRemoved')}
            </Label>
          </div>
        </div>
      )}

      {adding && (
        <div className="rounded-md border p-3">
          <InlineEdit
            initial=""
            placeholder={t('contractTypes.newTypePlaceholder')}
            onCancel={() => setAdding(false)}
            onSave={async (name) => {
              const r = await call<{ restored: boolean }>('', 'POST', { name });
              toast.success(
                r.restored ? t('matterTypes.toast.restored', { name }) : t('matterTypes.toast.added', { name })
              );
              setAdding(false);
            }}
          />
        </div>
      )}

      {!types.length && <p className="text-sm text-muted-foreground">{t('contractTypes.empty')}</p>}

      <div className="divide-y rounded-md border">
        {types.map((ct) => (
          <div
            key={ct.id}
            className={`flex flex-wrap items-center gap-2 px-3 py-2 ${ct.removed ? 'opacity-60' : ''}`}
          >
            {editing === ct.id ? (
              <div className="flex-1">
                <InlineEdit
                  initial={ct.name}
                  onCancel={() => setEditing(null)}
                  onSave={async (name) => {
                    await call(`/${ct.id}`, 'PATCH', { name });
                    setEditing(null);
                  }}
                />
              </div>
            ) : (
              <span className="font-medium">{contractTypeLabel(t, ct)}</span>
            )}
            <Badge variant={ct.is_default ? 'secondary' : 'default'}>
              {ct.is_default ? t('matterTypes.badges.default') : t('matterTypes.badges.custom')}
            </Badge>
            {ct.contract_count > 0 && (
              <Badge variant="outline">{t('common:count.contracts', { count: ct.contract_count })}</Badge>
            )}
            {ct.removed && <Badge variant="destructive">{t('matterTypes.badges.removed')}</Badge>}
            {canManage && editing !== ct.id && (
              <div className="ml-auto flex items-center gap-1">
                {ct.removed ? (
                  <Button size="sm" variant="ghost" onClick={() => call(`/${ct.id}/restore`, 'POST')}>
                    <RotateCcw className="mr-1 h-4 w-4" /> {t('common:actions.restore')}
                  </Button>
                ) : (
                  <>
                    {!ct.is_default && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setEditing(ct.id)}
                        aria-label={t('common:actions.rename')}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => remove(ct)}
                      aria-label={t('contractTypes.removeType')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <AlertDialog open={confirmDefaults} onOpenChange={setConfirmDefaults}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('contractTypes.removeDefaults.title', { count: activeDefaults })}</AlertDialogTitle>
            <AlertDialogDescription>{t('contractTypes.removeDefaults.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const r = await call<{ hidden: number }>('/remove-defaults', 'POST');
                toast.success(t('contractTypes.removeDefaults.done', { count: r.hidden }));
              }}
            >
              {t('contractTypes.removeDefaults.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!importRows} onOpenChange={(o) => !o && setImportRows(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('contractTypes.import.title', { file: importFile })}</DialogTitle>
            <DialogDescription>
              {t('contractTypes.import.found', { count: importRows?.length ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-auto rounded border text-xs">
            <table className="w-full">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-2 py-1">{t('contractTypes.import.columnType')}</th>
                  <th className="px-2 py-1">{t('contractTypes.import.columnDescription')}</th>
                </tr>
              </thead>
              <tbody>
                {importRows?.slice(0, 8).map((r, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-2 py-1">{r.name}</td>
                    <td className="px-2 py-1">{r.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {importRows && importRows.length > 8 && (
              <p className="px-2 py-1 text-muted-foreground">
                {t('matterTypes.import.moreRows', { count: importRows.length - 8 })}
              </p>
            )}
          </div>
          <RadioGroup value={importMode} onValueChange={(v) => setImportMode(v as 'merge' | 'replace')}>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="merge" id="ct-mode-merge" className="mt-1" />
              <Label htmlFor="ct-mode-merge" className="font-normal">
                <Trans t={t} i18nKey="contractTypes.import.modeMerge" components={{ strong: <strong /> }} />
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="replace" id="ct-mode-replace" className="mt-1" />
              <Label htmlFor="ct-mode-replace" className="font-normal">
                <Trans t={t} i18nKey="contractTypes.import.modeReplace" components={{ strong: <strong /> }} />
              </Label>
            </div>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportRows(null)}>
              {t('common:actions.cancel')}
            </Button>
            <Button onClick={runImport} disabled={importing}>
              {importing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {importMode === 'replace' ? t('matterTypes.import.replaceWithFile') : t('common:actions.import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
