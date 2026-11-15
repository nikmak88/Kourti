import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Check,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { csvToTaxonomyRows, taxonomyToCsv, type TaxonomyRow } from '@/lib/taxonomyCsv';

/**
 * Settings → Matter types & issues (firm admins).
 * Backend: /api/v1/matter-taxonomy (routes/api/matterTaxonomy.ts).
 * Removing a default only hides it for this firm; removing the firm's own item
 * deletes it, or retires it when matters still use it. Everything removed can
 * be restored ("Show removed").
 */

interface Issue {
  id: string;
  name: string;
  description: string | null;
  is_global: boolean;
  removed: boolean;
  matter_count: number;
}
interface MatterType extends Omit<Issue, 'is_global'> {
  is_global: boolean;
  issues: Issue[];
}
interface Taxonomy {
  types: MatterType[];
  can_manage: boolean;
}

const API = '/api/v1/matter-taxonomy';
const QUERY_KEY = ['matter-taxonomy'];

function removalMessage(t: TFunction, result: string, name: string, count: number) {
  if (result === 'hidden') return t('settings:matterTypes.removal.hidden', { name });
  if (result === 'retired') return t('settings:matterTypes.removal.retired', { name, count });
  return t('settings:matterTypes.removal.deleted', { name });
}

function InlineEdit({
  initial,
  onSave,
  onCancel,
  placeholder,
}: {
  initial: string;
  onSave: (v: string) => Promise<void> | void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await onSave(value.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') onCancel();
        }}
        className="h-8"
      />
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={save} disabled={busy} aria-label={t('common:actions.save')}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCancel} aria-label={t('common:actions.cancel')}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function MatterTypesTab() {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => invokeNodeApi<Taxonomy>(API),
  });

  const [showRemoved, setShowRemoved] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // "type:<id>" | "issue:<id>"
  const [addingIssueFor, setAddingIssueFor] = useState<string | null>(null);
  const [addingType, setAddingType] = useState(false);
  const [confirmDefaults, setConfirmDefaults] = useState(false);
  const [importRows, setImportRows] = useState<TaxonomyRow[] | null>(null);
  const [importFile, setImportFile] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canManage = data?.can_manage ?? false;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    // Lists used by the New Matter / Edit Matter forms and matter pages.
    queryClient.invalidateQueries({ queryKey: ['caseTypes'] });
    queryClient.invalidateQueries({ queryKey: ['case-types'] });
    queryClient.invalidateQueries({ queryKey: ['case-issues'] });
  };

  const call = async <T,>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) => {
    try {
      const res = await invokeNodeApi<T>(`${API}${path}`, { method, body });
      refresh();
      return res;
    } catch (err) {
      toast.error(t('common:errors.saveFailed'), { description: err instanceof Error ? err.message : undefined });
      throw err;
    }
  };

  const types = useMemo(() => {
    const all = data?.types ?? [];
    return all
      .filter((mt) => showRemoved || !mt.removed)
      .map((mt) => ({ ...mt, issues: mt.issues.filter((i) => showRemoved || !i.removed) }));
  }, [data, showRemoved]);

  const activeCount = (data?.types ?? []).filter((mt) => !mt.removed).length;
  const activeDefaults = (data?.types ?? []).filter((mt) => !mt.removed && mt.is_global).length;

  // ── Actions ───────────────────────────────────────────────────────────────

  const removeType = async (mt: MatterType) => {
    const r = await call<{ result: string; matter_count: number }>(`/types/${mt.id}`, 'DELETE');
    toast.success(removalMessage(t, r.result, mt.name, r.matter_count));
  };
  const removeIssue = async (i: Issue) => {
    const r = await call<{ result: string; matter_count: number }>(`/issues/${i.id}`, 'DELETE');
    toast.success(removalMessage(t, r.result, i.name, r.matter_count));
  };

  const exportCsv = () => {
    const visible = (data?.types ?? [])
      .filter((mt) => !mt.removed)
      .map((mt) => ({ ...mt, issues: mt.issues.filter((i) => !i.removed) }));
    const blob = new Blob([taxonomyToCsv(visible)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matter-types.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { rows } = csvToTaxonomyRows(await file.text());
    if (!rows.length) {
      toast.error(t('matterTypes.import.noRows'), {
        description: t('matterTypes.import.expectedColumns'),
      });
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
      const r = await call<Record<string, number>>('/import', 'POST', {
        rows: importRows,
        replace: importMode === 'replace',
      });
      const replace = importMode === 'replace';
      toast.success(t('matterTypes.import.complete'), {
        description: [
          t(replace ? 'matterTypes.import.summaryTypesReplace' : 'matterTypes.import.summaryTypes', {
            created: r.types_created,
            restored: r.types_restored,
            kept: r.types_kept,
            removed: r.types_removed,
          }),
          t(replace ? 'matterTypes.import.summaryIssuesReplace' : 'matterTypes.import.summaryIssues', {
            created: r.issues_created,
            restored: r.issues_restored,
            kept: r.issues_kept,
            removed: r.issues_removed,
          }),
        ].join(' '),
      });
      setImportRows(null);
    } catch {
      /* toast already shown */
    } finally {
      setImporting(false);
    }
  };

  const importSummary = useMemo(() => {
    if (!importRows) return null;
    const typeNames = new Set(importRows.map((r) => r.type.toLowerCase()));
    const issueCount = new Set(
      importRows.filter((r) => r.issue).map((r) => `${r.type.toLowerCase()}|${r.issue.toLowerCase()}`)
    ).size;
    return { types: typeNames.size, issues: issueCount, preview: importRows.slice(0, 8) };
  }, [importRows]);

  // ── Render ────────────────────────────────────────────────────────────────

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
        <Trans t={t} i18nKey="matterTypes.intro" components={{ strong: <strong /> }} />
      </p>

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setAddingType(true)}>
            <Plus className="mr-1 h-4 w-4" /> {t('matterTypes.addType')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> {t('matterTypes.importCsv')}
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!activeCount}>
            <Download className="mr-1 h-4 w-4" /> {t('matterTypes.exportCsv')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmDefaults(true)}
            disabled={!activeDefaults}
          >
            <Trash2 className="mr-1 h-4 w-4" />{' '}
            {t('matterTypes.removeAllDefaults', { count: activeDefaults })}
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          <div className="ml-auto flex items-center gap-2">
            <Switch id="show-removed" checked={showRemoved} onCheckedChange={setShowRemoved} />
            <Label htmlFor="show-removed" className="flex items-center gap-1 text-sm">
              {showRemoved ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{' '}
              {t('matterTypes.showRemoved')}
            </Label>
          </div>
        </div>
      )}

      {addingType && (
        <div className="rounded-md border p-3">
          <InlineEdit
            initial=""
            placeholder={t('matterTypes.newTypePlaceholder')}
            onCancel={() => setAddingType(false)}
            onSave={async (name) => {
              const r = await call<{ restored: boolean }>('/types', 'POST', { name });
              toast.success(
                r.restored
                  ? t('matterTypes.toast.restored', { name })
                  : t('matterTypes.toast.added', { name })
              );
              setAddingType(false);
            }}
          />
        </div>
      )}

      {!types.length && (
        <p className="text-sm text-muted-foreground">
          {t('matterTypes.empty')}
        </p>
      )}

      <div className="space-y-3">
        {types.map((mt) => (
          <div key={mt.id} className={`rounded-md border ${mt.removed ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
              {editing === `type:${mt.id}` ? (
                <div className="flex-1">
                  <InlineEdit
                    initial={mt.name}
                    onCancel={() => setEditing(null)}
                    onSave={async (name) => {
                      await call(`/types/${mt.id}`, 'PATCH', { name });
                      setEditing(null);
                    }}
                  />
                </div>
              ) : (
                <span className="font-medium">{mt.name}</span>
              )}
              <Badge variant={mt.is_global ? 'secondary' : 'default'}>{mt.is_global ? t('matterTypes.badges.default') : t('matterTypes.badges.custom')}</Badge>
              {mt.matter_count > 0 && (
                <Badge variant="outline">{t('common:count.matters', { count: mt.matter_count })}</Badge>
              )}
              {mt.removed && <Badge variant="destructive">{t('matterTypes.badges.removed')}</Badge>}
              {canManage && editing !== `type:${mt.id}` && (
                <div className="ml-auto flex items-center gap-1">
                  {mt.removed ? (
                    <Button size="sm" variant="ghost" onClick={() => call(`/types/${mt.id}/restore`, 'POST')}>
                      <RotateCcw className="mr-1 h-4 w-4" /> {t('common:actions.restore')}
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setAddingIssueFor(mt.id)}>
                        <Plus className="mr-1 h-4 w-4" /> {t('matterTypes.addIssue')}
                      </Button>
                      {!mt.is_global && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setEditing(`type:${mt.id}`)}
                          aria-label={t('common:actions.rename')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => removeType(mt)}
                        aria-label={t('matterTypes.removeType')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1 px-3 py-2">
              {!mt.issues.length && addingIssueFor !== mt.id && (
                <p className="text-xs text-muted-foreground">{t('matterTypes.noIssues')}</p>
              )}
              {mt.issues.map((i) => (
                <div key={i.id} className={`flex items-center gap-2 text-sm ${i.removed ? 'opacity-60' : ''}`}>
                  {editing === `issue:${i.id}` ? (
                    <div className="flex-1">
                      <InlineEdit
                        initial={i.name}
                        onCancel={() => setEditing(null)}
                        onSave={async (name) => {
                          await call(`/issues/${i.id}`, 'PATCH', { name });
                          setEditing(null);
                        }}
                      />
                    </div>
                  ) : (
                    <span>{i.name}</span>
                  )}
                  {!i.is_global && <Badge variant="outline">{t('matterTypes.badges.custom')}</Badge>}
                  {i.matter_count > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t('common:count.matters', { count: i.matter_count })}
                    </span>
                  )}
                  {i.removed && <Badge variant="destructive">{t('matterTypes.badges.removed')}</Badge>}
                  {canManage && !mt.removed && editing !== `issue:${i.id}` && (
                    <div className="ml-auto flex items-center">
                      {i.removed ? (
                        <Button size="sm" variant="ghost" onClick={() => call(`/issues/${i.id}/restore`, 'POST')}>
                          <RotateCcw className="mr-1 h-3 w-3" /> {t('common:actions.restore')}
                        </Button>
                      ) : (
                        <>
                          {!i.is_global && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setEditing(`issue:${i.id}`)}
                              aria-label={t('matterTypes.renameIssue')}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => removeIssue(i)}
                            aria-label={t('matterTypes.removeIssue')}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {addingIssueFor === mt.id && (
                <InlineEdit
                  initial=""
                  placeholder={t('matterTypes.newIssuePlaceholder')}
                  onCancel={() => setAddingIssueFor(null)}
                  onSave={async (name) => {
                    await call('/issues', 'POST', { case_type_id: mt.id, name });
                    setAddingIssueFor(null);
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Remove all defaults */}
      <AlertDialog open={confirmDefaults} onOpenChange={setConfirmDefaults}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('matterTypes.removeDefaults.title', { count: activeDefaults })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('matterTypes.removeDefaults.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const r = await call<{ hidden: number }>('/remove-defaults', 'POST');
                toast.success(t('matterTypes.removeDefaults.done', { count: r.hidden }));
              }}
            >
              {t('matterTypes.removeDefaults.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV import */}
      <Dialog open={!!importRows} onOpenChange={(o) => !o && setImportRows(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('matterTypes.import.title', { file: importFile })}</DialogTitle>
            <DialogDescription>
              {t('matterTypes.import.found', {
                types: t('matterTypes.import.typeCount', { count: importSummary?.types ?? 0 }),
                issues: t('matterTypes.import.issueCount', { count: importSummary?.issues ?? 0 }),
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-48 overflow-auto rounded border text-xs">
            <table className="w-full">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-2 py-1">{t('matterTypes.import.columnType')}</th>
                  <th className="px-2 py-1">{t('matterTypes.import.columnIssue')}</th>
                </tr>
              </thead>
              <tbody>
                {importSummary?.preview.map((r, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-2 py-1">{r.type}</td>
                    <td className="px-2 py-1">{r.issue || '-'}</td>
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
              <RadioGroupItem value="merge" id="mode-merge" className="mt-1" />
              <Label htmlFor="mode-merge" className="font-normal">
                <Trans t={t} i18nKey="matterTypes.import.modeMerge" components={{ strong: <strong /> }} />
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="replace" id="mode-replace" className="mt-1" />
              <Label htmlFor="mode-replace" className="font-normal">
                <Trans
                  t={t}
                  i18nKey="matterTypes.import.modeReplace"
                  components={{ strong: <strong /> }}
                />
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
