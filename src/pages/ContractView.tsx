import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useContract } from '@/hooks/useContracts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import {
  Download,
  Edit,
  GitBranch,
  FileText,
  Calendar,
  Building,
  DollarSign,
  Clock,
  Eye,
  Share,
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Bot,
  Save,
  X,
  FileDown,
} from 'lucide-react';
import { RichTextEditor } from '@/components/RichTextEditor';
import { exportAsDocx, exportContractAsPdf } from '@/lib/documentExport';
import { invokeNodeApi } from '@/lib/backendApi';
import { toast } from 'sonner';
import { logError } from '@/lib/logger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AIReviewDialog } from '@/components/AIReviewDialog';
import { PageContainer } from '@/components/layout/PageContainer';
import { contractTypeLabel } from '@/hooks/useContractTypes';
import { useTranslation } from 'react-i18next';
import {
  formatDate as formatLocalizedDate,
  formatCurrency as formatLocalizedCurrency,
} from '@/i18n/dates';

export default function ContractView() {
  const { id } = useParams();
  const { t } = useTranslation('contracts');
  const { data: contract, isLoading, error } = useContract(id!);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">{t('view.loading')}</p>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error || !contract) {
    return (
      <PageContainer>
        <Card className="shadow-card">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('edit.notFound.title')}</h3>
            <p className="text-muted-foreground mb-4">
              {error
                ? t('view.loadError')
                : t('view.notFoundDescription')}
            </p>
            <Button asChild>
              <Link to="/contracts">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('shared.backToContracts')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const handleSaveEdit = async () => {
    if (!contract || !editedContent) return;

    setIsSaving(true);
    try {
      await invokeNodeApi(`/api/v1/contracts/${contract.id}`, {
        method: 'PATCH',
        body: { terms: editedContent },
      });

      toast.success(t('toast.updated'));
      setIsEditMode(false);
      // Refresh the contract data
      window.location.reload();
    } catch (err) {
      logError('Save failed', err);
      toast.error(t('toast.saveContractFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditedContent('');
  };

  const handleStartEdit = () => {
    setEditedContent(contract?.terms || '');
    setIsEditMode(true);
  };

  const handleDownloadPDF = async () => {
    if (!contract) return;

    try {
      await exportContractAsPdf(
        {
          title: contract.title,
          content: contract.terms || '',
          type: contract.contract_type,
          value: contract.value,
          currency: contract.currency,
          startDate: contract.start_date,
          endDate: contract.end_date,
        },
        contract.title
      );
      toast.success(t('toast.downloadedPdf'));
    } catch (err) {
      logError('PDF download failed', err);
      toast.error(t('toast.downloadPdfFailed'));
    }
  };

  const handleDownloadDOCX = async () => {
    if (!contract) return;

    try {
      await exportAsDocx(contract.terms || '', contract.title);
      toast.success(t('toast.downloadedDocx'));
    } catch (err) {
      logError('DOCX download failed', err);
      toast.error(t('toast.downloadDocxFailed'));
    }
  };

  const handleDownload = async () => {
    if (!contract.terms) return;
    const blob = new Blob([contract.terms], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${contract.title}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'signed':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return t('common:status.notSet');
    return formatLocalizedDate(dateString, 'P');
  };

  const formatCurrency = (amount: number | null | undefined, currency: string) => {
    if (!amount) return t('view.notSpecified');
    return formatLocalizedCurrency(amount, currency || 'USD');
  };

  return (
    <PageContainer>
      <Breadcrumbs />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/contracts">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('common:actions.back')}
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {contract.title}
            </h1>
            <Badge variant="outline" className={getStatusColor(contract.status)}>
              {t(`status.${contract.status.toLowerCase()}`, { defaultValue: contract.status })}
            </Badge>
            {contract.terms && (
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                <Bot className="h-3 w-3 mr-1" />
                {t('success.aiGenerated')}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {contractTypeLabel(t, contract.contract_type) || t('common:entities.contract')}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Share className="h-4 w-4 mr-2" />
            {t('common:actions.share')}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!contract.terms}>
                <FileDown className="h-4 w-4 mr-2" />
                {t('common:actions.download')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDownloadPDF}>
                <FileText className="h-4 w-4 mr-2" />
                {t('success.downloadPdf')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadDOCX}>
                <FileText className="h-4 w-4 mr-2" />
                {t('success.downloadDocx')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                {t('view.downloadTxt')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" asChild>
            <Link to={`/contracts/${contract.id}/history`}>
              <GitBranch className="h-4 w-4 mr-2" />
              {t('view.history')}
            </Link>
          </Button>

          {isEditMode ? (
            <>
              <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
                <X className="h-4 w-4 mr-2" />
                {t('common:actions.cancel')}
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? t('common:status.saving') : t('common:actions.saveChanges')}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleStartEdit} disabled={!contract.terms}>
              <Edit className="h-4 w-4 mr-2" />
              {t('common:actions.edit')}
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">{t('view.tabs.overview')}</TabsTrigger>
          <TabsTrigger value="document">{t('view.tabs.document')}</TabsTrigger>
          <TabsTrigger value="details">{t('view.tabs.details')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Contract Summary */}
            <Card className="lg:col-span-2 shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t('view.summary')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('create.basic.valueLabel')}</p>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">
                        {formatCurrency(contract.value, contract.currency || 'USD')}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('create.terms.startDate')}</p>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{formatDate(contract.start_date)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('common:fields.endDate')}</p>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{formatDate(contract.end_date)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('common:fields.createdAt')}</p>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{formatDate(contract.created_at)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('view.lastUpdated')}</p>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{formatDate(contract.updated_at)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('common:fields.type')}</p>
                    <p className="font-medium">
                      {contractTypeLabel(t, contract.contract_type) || t('view.standardContract')}
                    </p>
                  </div>
                </div>

                {contract.description && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">{t('common:fields.description')}</p>
                      <p className="text-sm leading-relaxed">{contract.description}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Status & Info */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  {t('view.statusInfo')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t('view.contractStatus')}</p>
                  <Badge className={getStatusColor(contract.status)}>
                    {t(`status.${contract.status.toLowerCase()}`, { defaultValue: contract.status })}
                  </Badge>
                </div>

                {contract.client_id && (
                  <div>
                    <p className="text-sm text-muted-foreground">{t('common:entities.client')}</p>
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {(contract as unknown as { client?: { name?: string } }).client?.name ||
                          contract.client_id}
                      </span>
                    </div>
                  </div>
                )}

                <Separator />

                <div>
                  <p className="text-sm text-muted-foreground mb-2">{t('view.contractId')}</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                    {contract.id}
                  </code>
                </div>

                {contract.terms && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-blue-700">
                      <Bot className="h-4 w-4" />
                      <span className="text-sm font-medium">{t('success.aiGenerated')}</span>
                    </div>
                    <p className="text-xs text-blue-600 mt-1">
                      {t('view.aiNotice')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="document" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t('view.document')}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {!isEditMode && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      {t('view.readOnly')}
                    </div>
                  )}
                  {isEditMode && (
                    <Badge
                      variant="secondary"
                      className="bg-amber-50 text-amber-700 border-amber-200"
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      {t('view.editingMode')}
                    </Badge>
                  )}
                  {contract.terms && !isEditMode && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="default" className="flex gap-1 items-center">
                          <Sparkles className="h-4 w-4" /> {t('list.aiReview')}
                        </Button>
                      </DialogTrigger>
                      <AIReviewDialog contractText={contract.terms} />
                    </Dialog>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {contract.terms ? (
                isEditMode ? (
                  <RichTextEditor
                    content={editedContent}
                    onChange={setEditedContent}
                    editable={true}
                  />
                ) : (
                  <div className="prose max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed bg-muted/30 p-6 rounded-lg border max-h-96 overflow-y-auto">
                      {contract.terms}
                    </pre>
                  </div>
                )
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">{t('view.noDocument')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>{t('view.details')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">{t('view.financial')}</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('view.valueColon')}</span>
                      <span className="font-medium">
                        {formatCurrency(contract.value, contract.currency || 'USD')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('view.currencyColon')}</span>
                      <span className="font-medium">{contract.currency || 'USD'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">{t('view.timeline')}</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('view.effectiveDate')}</span>
                      <span className="font-medium">{formatDate(contract.start_date)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('view.expirationDate')}</span>
                      <span className="font-medium">{formatDate(contract.end_date)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('view.createdColon')}</span>
                      <span className="font-medium">{formatDate(contract.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
