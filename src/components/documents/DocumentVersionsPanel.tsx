import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, GitBranch, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { formatRelative } from '@/i18n/dates';
import {
  listDocumentVersions,
  activateDocumentVersion,
  getDocumentVersionDownloadUrl,
  type DocumentVersion,
} from '@/lib/featuresApi';

interface Props {
  documentId: string;
  /** When passed, renders an "active" badge next to the matching version. */
  currentVersionId?: string | null;
  onActivated?: (versionId: string) => void;
}

// Translation keys (documents namespace) for each version source.
const SOURCE_LABEL_KEYS: Record<DocumentVersion['source'], string> = {
  upload: 'versions.source.upload',
  assistant_edit: 'versions.source.assistantEdit',
  user_accept: 'versions.source.userAccept',
  user_reject: 'versions.source.userReject',
  generated: 'versions.source.generated',
};

const SOURCE_BADGE: Record<DocumentVersion['source'], string> = {
  upload: 'bg-gray-100 text-gray-700',
  assistant_edit: 'bg-purple-100 text-purple-700',
  user_accept: 'bg-green-100 text-green-700',
  user_reject: 'bg-red-100 text-red-700',
  generated: 'bg-blue-100 text-blue-700',
};

export function DocumentVersionsPanel({ documentId, currentVersionId, onActivated }: Props) {
  const { t } = useTranslation('documents');
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(currentVersionId ?? null);
  const [activating, setActivating] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDocumentVersions(documentId)
      .then((rows) => {
        if (!cancelled) setVersions(rows);
      })
      .catch((err) =>
        toast.error(t('versions.toast.loadFailed'), {
          description: err instanceof Error ? err.message : t('versions.toast.unknownError'),
        })
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, t]);

  useEffect(() => {
    setActiveId(currentVersionId ?? null);
  }, [currentVersionId]);

  const handleActivate = async (versionId: string) => {
    setActivating(versionId);
    try {
      await activateDocumentVersion(documentId, versionId);
      setActiveId(versionId);
      onActivated?.(versionId);
      toast.success(t('versions.toast.activated'));
    } catch (err) {
      toast.error(t('versions.toast.activateFailed'), {
        description: err instanceof Error ? err.message : t('versions.toast.unknownError'),
      });
    } finally {
      setActivating(null);
    }
  };

  const handleDownload = async (versionId: string) => {
    try {
      const { signedUrl } = await getDocumentVersionDownloadUrl(documentId, versionId);
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(t('versions.toast.downloadFailed'), {
        description: err instanceof Error ? err.message : t('versions.toast.unknownError'),
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-blue-500" />
          {t('versions.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-xs text-muted-foreground">{t('common:status.loading')}</div>
        ) : versions.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            {t('versions.empty')}
          </div>
        ) : (
          <ul className="space-y-2">
            {versions.map((v) => {
              const isActive = activeId === v.id;
              return (
                <li
                  key={v.id}
                  className={`flex items-center gap-3 border rounded-md px-3 py-2 ${
                    isActive ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">v{v.version_number}</span>
                      <Badge variant="secondary" className={SOURCE_BADGE[v.source]}>
                        {t(SOURCE_LABEL_KEYS[v.source], { defaultValue: v.source })}
                      </Badge>
                      {isActive && (
                        <Badge variant="default" className="bg-blue-600">
                          {t('versions.active')}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {v.display_name ?? t('versions.unnamed')} · {formatRelative(v.created_at)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(v.id)}
                    title={t('common:actions.download')}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {!isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleActivate(v.id)}
                      disabled={activating === v.id}
                    >
                      {activating === v.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3 mr-1" />
                      )}
                      {t('versions.makeActive')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
