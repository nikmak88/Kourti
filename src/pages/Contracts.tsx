import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSearch } from '@/hooks/use-search';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useContracts } from '@/hooks/useContracts';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { DataTable, ColumnDef } from '@/components/ui/data-table';
import {
  Plus,
  Filter,
  Eye,
  Edit,
  MoreVertical,
  FileCheck,
  User,
  Clock,
  AlertTriangle,
  GitBranch,
  Zap,
  ScanSearch,
  RefreshCw,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import { ModuleFilterBar } from '@/components/filters/ModuleFilterBar';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/i18n/dates';

// Status options constant for consistency
const CONTRACT_STATUSES = [
  { value: 'all', labelKey: 'list.filters.allStatus' },
  { value: 'active', labelKey: 'status.active' },
  { value: 'signed', labelKey: 'status.signed' },
  { value: 'draft', labelKey: 'status.draft' },
  { value: 'expired', labelKey: 'status.expired' },
  { value: 'under_review', labelKey: 'status.under_review' },
];

export default function Contracts() {
  const navigate = useNavigate();
  const { t } = useTranslation('contracts');
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expiryFilter, setExpiryFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const { term: globalSearch } = useSearch();

  // Use pagination parameters in the hook
  const { data, isLoading, error, refetch } = useContracts(
    page,
    pageSize,
    statusFilter !== 'all' ? statusFilter : undefined
  );

  const contracts = data?.contracts || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const clientFilter = searchParams.get('client')?.toLowerCase() || '';

  // Create a memoized function to determine expiry status
  const getExpiryStatus = (contract: { end_date?: string }) => {
    if (!contract.end_date) return { isExpiring: false, isExpired: false };

    const today = new Date();
    const expiryDate = new Date(contract.end_date);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    return {
      isExpiring: expiryDate > today && expiryDate <= thirtyDaysFromNow,
      isExpired: expiryDate < today,
    };
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center min-h-[calc(100vh-200px)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="ml-4 text-lg text-muted-foreground">{t('list.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 flex flex-col items-center justify-center space-y-4 min-h-[calc(100vh-200px)]">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <p className="text-destructive text-lg font-medium">{t('list.loadFailed')}</p>
        <p className="text-muted-foreground text-center max-w-md">
          {error instanceof Error ? error.message : t('list.unexpectedError')}
        </p>
        <Button onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          {t('common:actions.retry')}
        </Button>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'active':
        return 'bg-success text-success-foreground';
      case 'signed':
        return 'bg-primary text-primary-foreground';
      case 'draft':
        return 'bg-muted text-muted-foreground';
      case 'expired':
        return 'bg-destructive text-destructive-foreground';
      case 'under_review':
      case 'under review':
        return 'bg-warning text-warning-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Client-side filtering only for the search term, client filter, and expiry
  // (status filtering is handled server-side for better performance)
  const filteredContracts = contracts.filter((contract) => {
    const termMatches = (term: string) =>
      contract.title.toLowerCase().includes(term.toLowerCase()) ||
      String(contract.id).toLowerCase().includes(term.toLowerCase());

    const matchesLocal = searchTerm === '' || termMatches(searchTerm);
    const matchesGlobal = globalSearch === '' || termMatches(globalSearch);
    const matchesClient =
      clientFilter === '' ||
      String(contract.client_id).toLowerCase() === clientFilter ||
      (contract as unknown as { client?: { name?: string } }).client?.name
        ?.toLowerCase()
        .includes(clientFilter);

    let matchesExpiry = true;
    if (expiryFilter !== 'all') {
      const { isExpiring, isExpired } = getExpiryStatus(contract);
      if (expiryFilter === 'expiring') matchesExpiry = isExpiring;
      else if (expiryFilter === 'expired') matchesExpiry = isExpired;
      else if (expiryFilter === 'valid') matchesExpiry = !isExpiring && !isExpired;
    }

    return matchesLocal && matchesGlobal && matchesClient && matchesExpiry;
  });

  // Calculate contract statistics
  const contractStats = {
    total: totalCount,
    active: contracts.filter((c) => c.status.toLowerCase() === 'active').length,
    expiringSoon: contracts.filter((c) => getExpiryStatus(c).isExpiring).length,
    expired: contracts.filter((c) => getExpiryStatus(c).isExpired).length,
  };

  // Pagination handlers
  const handlePreviousPage = () => setPage((prev) => Math.max(1, prev - 1));
  const handleNextPage = () => setPage((prev) => Math.min(totalPages, prev + 1));

  return (
    <PageContainer>
      <Breadcrumbs />
      <PageHeader
        title={t('list.title')}
        description={t('list.description')}
        actions={
          <>
            <Button
              variant="outline"
              className="shadow-sm flex-1 sm:flex-none"
              onClick={() => navigate('/contracts/create')}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('list.newContract')}
            </Button>
            <Button
              variant="default"
              className="shadow-md flex-1 sm:flex-none"
              onClick={() => navigate('/contracts/review')}
            >
              <ScanSearch className="h-4 w-4 mr-2" />
              {t('list.aiReview')}
            </Button>
            <Button
              variant="outline"
              className="shadow-sm flex-1 sm:flex-none"
              onClick={() => navigate('/contracts/compare')}
            >
              <GitBranch className="h-4 w-4 mr-2" />
              {t('list.compareContracts')}
            </Button>
          </>
        }
      />
      {clientFilter && (
        <div>
          <Badge variant="outline" className="px-2 py-1">
            {t('list.clientFilter', { client: clientFilter })}
            <button
              className="ml-2 hover:text-destructive"
              onClick={() => navigate('/contracts')}
              aria-label={t('list.clearClientFilter')}
            >
              ×
            </button>
          </Badge>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('list.stats.total')}</p>
                <p className="text-2xl font-bold">{contractStats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <Clock className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('list.stats.active')}</p>
                <p className="text-2xl font-bold">{contractStats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-warning/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('list.stats.expiringSoon')}</p>
                <p className="text-2xl font-bold">{contractStats.expiringSoon}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('list.stats.expired')}</p>
                <p className="text-2xl font-bold">{contractStats.expired}</p>
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
            key: 'status',
            placeholder: t('common:fields.status'),
            value: statusFilter,
            onChange: (v) => {
              setStatusFilter(v);
              setPage(1);
            },
            width: 'w-[150px]',
            icon: <Filter className="h-4 w-4" />,
            options: CONTRACT_STATUSES.map((o) => ({ value: o.value, label: t(o.labelKey) })),
          },
          {
            key: 'expiry',
            placeholder: t('list.filters.expiry'),
            value: expiryFilter,
            onChange: setExpiryFilter,
            width: 'w-[160px]',
            options: [
              { value: 'all', label: t('list.filters.allExpiry') },
              { value: 'valid', label: t('list.filters.valid') },
              { value: 'expiring', label: t('list.filters.expiringSoon') },
              { value: 'expired', label: t('list.filters.expired') },
            ],
          },
        ]}
        onClearAll={() => {
          setSearchTerm('');
          setStatusFilter('all');
          setExpiryFilter('all');
          setPage(1);
        }}
      />

      {/* Contracts Table */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>{t('list.allContracts', { count: totalCount })}</CardTitle>
          <CardDescription>
            {t('list.tableDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={
              [
                {
                  id: 'contract',
                  header: t('common:entities.contract'),
                  accessorKey: 'title',
                  minWidth: '250px',
                  cell: (contract) => (
                    <div className="font-medium truncate max-w-[250px]" title={contract.title}>
                      {contract.title}
                    </div>
                  ),
                },
                {
                  id: 'client',
                  header: t('common:entities.client'),
                  accessorFn: (contract) =>
                    (contract as unknown as { client?: { name?: string } }).client?.name ||
                    contract.client_id ||
                    t('list.noClient'),
                  minWidth: '180px',
                  cell: (contract) => (
                    <div
                      className="truncate max-w-[180px]"
                      title={
                        (contract as unknown as { client?: { name?: string } }).client?.name ||
                        contract.client_id ||
                        t('list.noClient')
                      }
                    >
                      {(contract as unknown as { client?: { name?: string } }).client?.name ||
                        contract.client_id ||
                        t('list.noClient')}
                    </div>
                  ),
                },
                {
                  id: 'status',
                  header: t('common:fields.status'),
                  accessorKey: 'status',
                  minWidth: '130px',
                  cell: (contract) => (
                    <Badge className={getStatusColor(contract.status)} variant="secondary">
                      {t(`status.${contract.status.toLowerCase()}`, { defaultValue: contract.status })}
                    </Badge>
                  ),
                },
                {
                  id: 'createdBy',
                  header: t('common:fields.createdBy'),
                  sortable: false,
                  minWidth: '180px',
                  cell: (contract) => (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm">
                          {(contract as unknown as { created_by_user?: { first_name?: string } })
                            .created_by_user?.first_name || t('list.userFallback')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(contract.created_at, 'P')}
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  id: 'actions',
                  header: t('common:fields.actions'),
                  sortable: false,
                  minWidth: '80px',
                  cell: (contract) => (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={t('list.moreOptions')}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/contracts/${contract.id}`} className="flex items-center">
                            <Eye className="h-4 w-4 mr-2" />
                            {t('list.actions.view')}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/contracts/${contract.id}/edit`} className="flex items-center">
                            <Edit className="h-4 w-4 mr-2" />
                            {t('list.actions.edit')}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            to={`/contracts/${contract.id}/history`}
                            className="flex items-center"
                          >
                            <GitBranch className="h-4 w-4 mr-2" />
                            {t('list.actions.history')}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            to={`/contracts/review?contractId=${contract.id}`}
                            className="flex items-center"
                          >
                            <ScanSearch className="h-4 w-4 mr-2" />
                            {t('list.aiReview')}
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ),
                },
              ] as ColumnDef<(typeof contracts)[number]>[]
            }
            data={filteredContracts}
            emptyMessage={t('list.noMatches')}
            getRowKey={(row) => row.id}
          />

          {/* Pagination */}
          {totalCount > 0 && (
            <div className="flex items-center justify-between mt-6">
              <Button
                variant="outline"
                onClick={handlePreviousPage}
                disabled={page <= 1}
                aria-label={t('list.previousPage')}
              >
                {t('common:actions.previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('list.pageOf', { page, total: totalPages })}
              </span>
              <Button
                variant="outline"
                onClick={handleNextPage}
                disabled={page >= totalPages}
                aria-label={t('list.nextPage')}
              >
                {t('common:actions.next')}
              </Button>
            </div>
          )}

          {/* Empty state for zero contracts */}
          {totalCount === 0 && (
            <div className="text-center py-12">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <FileCheck className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">{t('list.empty.title')}</h3>
              <p className="text-muted-foreground mb-4">
                {t('list.empty.description')}
              </p>
              <Button onClick={() => navigate('/contracts/create')} className="shadow-md">
                <Plus className="h-4 w-4 mr-2" />
                {t('list.empty.action')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Contract Features */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            {t('list.ai.title')}
          </CardTitle>
          <CardDescription>
            {t('list.ai.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">{t('list.ai.intelligenceTitle')}</h4>
              <p className="text-sm text-muted-foreground">
                {t('list.ai.intelligenceText')}
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">{t('list.ai.riskTitle')}</h4>
              <p className="text-sm text-muted-foreground">
                {t('list.ai.riskText')}
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">{t('list.ai.renewalTitle')}</h4>
              <p className="text-sm text-muted-foreground">
                {t('list.ai.renewalText')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
