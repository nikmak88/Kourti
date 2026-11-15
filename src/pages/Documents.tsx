import { useMemo, useState } from 'react';
import { logError } from '@/lib/logger';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/i18n/dates';
import { useSearch } from '@/hooks/use-search';
import { useDocuments } from '@/hooks/useDocuments';
import { getNodeDocumentSignedUrl } from '@/lib/backendApi';
import { downloadDocument } from '@/lib/fileApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, ColumnDef } from '@/components/ui/data-table';
import { TableSkeleton } from '@/components/ui/loading-states';
import { EmptyState } from '@/components/ui/empty-state';
import {
  FileText,
  Upload,
  Filter,
  Eye,
  Download,
  Share,
  MoreVertical,
  FileImage,
  File,
  MessageSquare,
  Calendar,
  User,
  ScanSearch,
} from 'lucide-react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Document } from '@/types';
import { DocumentViewer } from '@/components/DocumentViewer';
import { InternalShareDialog } from '@/components/InternalShareDialog';
import { exportAsDocx, exportAsPdf } from '@/lib/documentExport';
import { toast } from 'sonner';
import { ModuleFilterBar } from '@/components/filters/ModuleFilterBar';

export default function Documents() {
  const navigate = useNavigate();
  const { t } = useTranslation('documents');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [shareDocument, setShareDocument] = useState<Document | null>(null);
  const { term: globalSearch } = useSearch();
  const { data: documents = [], isLoading } = useDocuments();
  // Compute filtered documents before any early returns (Rules of Hooks)
  const filteredDocuments = useMemo(() => {
    if (!documents || !Array.isArray(documents)) {
      return [];
    }

    return documents.filter((doc: Document) => {
      const docTitle = doc.title || doc.name || '';
      const matchesTerm = (term: string) => docTitle.toLowerCase().includes(term.toLowerCase());

      const matchesLocal = searchTerm === '' || matchesTerm(searchTerm);
      const matchesGlobal = globalSearch === '' || matchesTerm(globalSearch);
      const matchesType =
        typeFilter === 'all' || (doc.file_type && doc.file_type.toLowerCase() === typeFilter);
      const matchesStatus =
        statusFilter === 'all' || (doc.status && doc.status.toLowerCase() === statusFilter);

      return matchesLocal && matchesGlobal && matchesType && matchesStatus;
    });
  }, [documents, globalSearch, searchTerm, typeFilter, statusFilter]);

  // Helper functions
  const getFileIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'pdf':
        return <FileText className="h-5 w-5 text-destructive" />;
      case 'docx':
      case 'doc':
        return <FileText className="h-5 w-5 text-primary" />;
      case 'jpg':
      case 'jpeg':
      case 'png':
        return <FileImage className="h-5 w-5 text-success" />;
      default:
        return <File className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const handleDownload = async (doc: Document) => {
    if (!doc.file_path) return;
    if (doc.storage_status === 'missing') {
      toast.error(t('toast.fileUnavailable'), {
        description: t('toast.fileUnavailableDescription'),
      });
      return;
    }

    try {
      try {
        const signed = await getNodeDocumentSignedUrl(doc.id, {
          disposition: 'attachment',
          filename:
            (doc.metadata as { original_filename?: string } | undefined)?.original_filename ||
            doc.name ||
            'download',
        });

        const a = document.createElement('a');
        a.href = signed.signedUrl;
        a.download = signed.fileName || doc.name || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch {
        // Fallback to direct download via fileApi
        const data = await downloadDocument(doc.file_path);
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          (doc.metadata as { original_filename?: string } | undefined)?.original_filename ||
          doc.name ||
          'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      logError('Download failed', err);
    }
  };

  const handleShare = (doc: Document) => {
    setShareDocument(doc);
  };

  // Early return after all hooks
  if (isLoading) {
    return (
      <PageContainer>
        <Breadcrumbs />
        <PageHeader title={t('list.title')} description={t('list.loadingDescription')} />
        <TableSkeleton rows={8} columns={5} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Breadcrumbs />
      <PageHeader
        title={t('list.title')}
        description={t('list.description')}
        actions={
          <>
            <Button
              variant="default"
              className="shadow-md"
              onClick={() => navigate('/contracts/review')}
            >
              <ScanSearch className="h-4 w-4 mr-2" />
              {t('list.aiReview')}
            </Button>
            <Button
              variant="outline"
              className="shadow-sm"
              onClick={() => navigate('/documents/upload')}
            >
              <Upload className="h-4 w-4 mr-2" />
              {t('list.uploadDocument')}
            </Button>
          </>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('list.stats.total')}</p>
                <p className="text-2xl font-bold">{documents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-warning/10 rounded-lg">
                <MessageSquare className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('list.stats.underReview')}</p>
                <p className="text-2xl font-bold">0</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <Download className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('common:time.thisWeek')}</p>
                <p className="text-2xl font-bold">0</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <ModuleFilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t('list.searchPlaceholder')}
        searchWidth="w-full sm:w-[280px]"
        filters={[
          {
            key: 'type',
            placeholder: t('common:fields.type'),
            value: typeFilter,
            onChange: setTypeFilter,
            width: 'w-[130px]',
            icon: <Filter className="h-4 w-4" />,
            options: [
              { value: 'all', label: t('list.filters.allTypes') },
              { value: 'pdf', label: 'PDF' },
              { value: 'docx', label: t('list.filters.word') },
              { value: 'doc', label: t('list.filters.wordDoc') },
              { value: 'jpg', label: t('list.filters.images') },
              { value: 'png', label: 'PNG' },
            ],
          },
          {
            key: 'status',
            placeholder: t('common:fields.status'),
            value: statusFilter,
            onChange: setStatusFilter,
            width: 'w-[150px]',
            options: [
              { value: 'all', label: t('list.filters.allStatuses') },
              { value: 'draft', label: t('status.draft') },
              { value: 'pending', label: t('status.pending') },
              { value: 'signed', label: t('status.signed') },
              { value: 'review', label: t('status.review') },
              { value: 'archived', label: t('status.archived') },
            ],
          },
        ]}
        onClearAll={() => {
          setSearchTerm('');
          setTypeFilter('all');
          setStatusFilter('all');
        }}
      />

      {/* Documents Table */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>{t('list.allDocuments', { count: filteredDocuments.length })}</CardTitle>
          <CardDescription>
            {t('list.tableDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={
              [
                {
                  id: 'document',
                  header: t('common:entities.document'),
                  accessorFn: (doc) => doc.title || doc.name,
                  minWidth: '250px',
                  cell: (doc) => (
                    <div className="flex items-center gap-3 max-w-[250px]">
                      {getFileIcon(doc.file_type || 'file')}
                      <div className="font-medium truncate" title={doc.title || doc.name}>
                        {doc.title || doc.name}
                      </div>
                      {doc.storage_status === 'missing' && (
                        <Badge
                          variant="destructive"
                          className="shrink-0 text-[10px]"
                          title={t('list.unavailableTooltip')}
                        >
                          {t('list.unavailable')}
                        </Badge>
                      )}
                    </div>
                  ),
                },
                {
                  id: 'case',
                  header: t('list.columns.linkedCase'),
                  sortable: false,
                  minWidth: '150px',
                  cell: (doc) => {
                    const docCase = (doc as unknown as { case?: { id: string; title: string } })
                      .case;
                    return docCase ? (
                      <Badge
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80 max-w-[150px] truncate"
                        onClick={() => navigate(`/matters/${docCase.id}`)}
                        title={docCase.title}
                      >
                        {docCase.title}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">{t('list.noCaseLinked')}</span>
                    );
                  },
                },
                {
                  id: 'status',
                  header: t('common:fields.status'),
                  accessorKey: 'status',
                  minWidth: '120px',
                  cell: (doc) => (
                    <Badge className="bg-muted text-muted-foreground" variant="secondary">
                      {doc.status
                        ? t(`status.${doc.status.toLowerCase()}`, { defaultValue: doc.status })
                        : t('status.uploaded')}
                    </Badge>
                  ),
                },
                {
                  id: 'uploadedBy',
                  header: t('list.columns.uploadedBy'),
                  sortable: false,
                  minWidth: '180px',
                  cell: (doc) => (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm">
                          {(() => {
                            const profiles = (
                              doc as unknown as {
                                profiles?: { first_name?: string; last_name?: string };
                              }
                            ).profiles;
                            return profiles?.first_name && profiles?.last_name
                              ? `${profiles.first_name} ${profiles.last_name}`
                              : t('list.unknownUser');
                          })()}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(doc.created_at, 'P')}
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  id: 'comments',
                  header: t('list.columns.comments'),
                  sortable: false,
                  minWidth: '100px',
                  cell: () => (
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">0</span>
                    </div>
                  ),
                },
                {
                  id: 'lastAccessed',
                  header: t('list.columns.lastAccessed'),
                  accessorKey: 'created_at',
                  minWidth: '130px',
                  cell: (doc) => (
                    <span className="text-sm text-muted-foreground">
                      {formatDate(doc.created_at, 'P')}
                    </span>
                  ),
                },
                {
                  id: 'actions',
                  header: t('list.columns.actions'),
                  sortable: false,
                  minWidth: '80px',
                  cell: (doc) => (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSelectedDocument(doc)}>
                          <Eye className="h-4 w-4 mr-2" />
                          {t('list.menu.view')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            navigate(`/contracts/review?documentId=${doc.id}`);
                          }}
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          {t('list.aiReview')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload(doc)}>
                          <Download className="h-4 w-4 mr-2" />
                          {t('common:actions.download')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleShare(doc)}>
                          <Share className="h-4 w-4 mr-2" />
                          {t('list.menu.shareInternally')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              await exportAsPdf(
                                doc.content || '',
                                (doc.name || 'document').replace(/[^a-z0-9]/gi, '_').toLowerCase(),
                                doc.name || t('common:entities.document')
                              );
                              toast.success(t('common:toast.success'), {
                                description: t('toast.exportedPdf'),
                              });
                            } catch {
                              toast.error(t('common:toast.error'), {
                                description: t('toast.exportPdfFailed'),
                              });
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {t('list.menu.exportPdf')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              await exportAsDocx(
                                doc.content || '',
                                (doc.name || 'document').replace(/[^a-z0-9]/gi, '_').toLowerCase()
                              );
                              toast.success(t('common:toast.success'), {
                                description: t('toast.exportedDocx'),
                              });
                            } catch {
                              toast.error(t('common:toast.error'), {
                                description: t('toast.exportDocxFailed'),
                              });
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {t('list.menu.exportDocx')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ),
                },
              ] as ColumnDef<Document>[]
            }
            data={filteredDocuments}
            emptyMessage=""
            getRowKey={(row) => row.id}
          />

          {filteredDocuments.length === 0 && documents.length === 0 && (
            <EmptyState
              icon={FileText}
              title={t('list.empty.title')}
              description={t('list.empty.description')}
              action={{
                label: t('list.uploadDocument'),
                onClick: () => navigate('/documents/upload'),
                icon: Upload,
              }}
            />
          )}
          {filteredDocuments.length === 0 && documents.length > 0 && (
            <EmptyState
              icon={FileText}
              title={t('list.noMatch.title')}
              description={t('list.noMatch.description', { search: searchTerm || globalSearch })}
              action={{
                label: t('list.noMatch.action'),
                onClick: () => {
                  setSearchTerm('');
                  setTypeFilter('all');
                },
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* AI Review Panel */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            {t('list.aiPanel.title')}
          </CardTitle>
          <CardDescription>
            {t('list.aiPanel.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">{t('list.aiPanel.clauses.title')}</h4>
              <p className="text-sm text-muted-foreground">
                {t('list.aiPanel.clauses.description')}
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">{t('list.aiPanel.risk.title')}</h4>
              <p className="text-sm text-muted-foreground">
                {t('list.aiPanel.risk.description')}
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">{t('list.aiPanel.summary.title')}</h4>
              <p className="text-sm text-muted-foreground">
                {t('list.aiPanel.summary.description')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Viewer */}
      {selectedDocument && (
        <DocumentViewer
          open={!!selectedDocument}
          onOpenChange={() => setSelectedDocument(null)}
          document={{
            id: selectedDocument.id,
            name: selectedDocument.name || selectedDocument.title || t('untitledDocument'),
            file_path: selectedDocument.file_path,
            mime_type: selectedDocument.file_type,
            file_size: selectedDocument.file_size,
            content: selectedDocument.content,
            metadata: selectedDocument.metadata,
          }}
        />
      )}

      {/* Internal Share Dialog */}
      {shareDocument && (
        <InternalShareDialog
          open={!!shareDocument}
          onOpenChange={() => setShareDocument(null)}
          document={{
            id: shareDocument.id,
            name: shareDocument.name || shareDocument.title || t('untitledDocument'),
          }}
        />
      )}
    </PageContainer>
  );
}
