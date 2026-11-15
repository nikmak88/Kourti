import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCases, useDeleteCase } from '@/hooks/useCases'; // Add real data hooks
import { useSearch } from '@/hooks/use-search';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, ColumnDef } from '@/components/ui/data-table';
import { TableSkeleton } from '@/components/ui/loading-states';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Briefcase } from 'lucide-react';
import {
  Plus,
  Filter,
  Eye,
  Edit,
  MoreVertical,
  FileText,
  Calendar,
  User,
  Trash2,
  Upload,
} from 'lucide-react';
import { ModuleFilterBar } from '@/components/filters/ModuleFilterBar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/i18n/dates';

export default function App() {
  // Changed to App for React component export
  const navigate = useNavigate();
  const { t } = useTranslation('matters');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Use real data hooks, combining error handling and pagination logic
  const {
    data,
    isLoading,
    error,
    refetch, // For retrying on error
    page,
    pageSize,
    setPage,
  } = useCases();

  const cases = useMemo(() => data?.cases || [], [data?.cases]);
  const totalCount = data?.count || 0;
  // Ensure totalPages is at least 1 to avoid division by zero or negative pages
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const statuses = ['Active', 'Review', 'Draft', 'Closed'];
  const { term: globalSearch, setTerm } = useSearch(); // Destructure setTerm from useSearch
  const deleteCase = useDeleteCase();
  const [searchParams] = useSearchParams();
  const clientQuery = searchParams.get('client');

  // Effect to display toast notifications for errors and reset global search term
  useEffect(() => {
    if (error) {
      toast.error(t('common:toast.error'), {
        description: error instanceof Error ? error.message : t('toast.loadFailedDescription'),
      });
    }
    // Reset global search term when the component mounts or if setTerm changes
    setTerm('');
  }, [error, setTerm, t]); // Added setTerm to dependencies

  type CaseRow = {
    id: string;
    name: string;
    client: string;
    clientId?: string;
    status: string;
    priority: string;
    assignedTo: string;
    startDate: string;
    dueDate: string;
    documentsCount: number;
  };

  const caseRows: CaseRow[] = cases.map((c) => ({
    id: String(c.id || c.case_number || ''),
    name: c.title as string,
    client: String(c.client?.name || c.client || t('list.unknownClient')),
    clientId: c.client_id || c.client?.id,
    status: c.status as string,
    priority: c.priority as string,
    assignedTo: c.assigned_user
      ? [c.assigned_user.first_name, c.assigned_user.last_name].filter(Boolean).join(' ')
      : t('list.unassigned'),
    startDate: c.created_at ? formatDate(c.created_at, 'PP') : '',
    dueDate: c.next_hearing_date ? formatDate(c.next_hearing_date, 'PP') : t('list.noDateSet'),
    documentsCount: 0,
  }));

  // Determine the client name if a client query parameter is present
  const clientFilterName = clientQuery
    ? caseRows.find(
        (c) => c.clientId === clientQuery || c.client.toLowerCase() === clientQuery.toLowerCase()
      )?.client || clientQuery
    : '';

  // Handle matter deletion
  const handleDeleteCase = async (caseId: string) => {
    try {
      await deleteCase.mutateAsync(caseId);
      toast.success(t('toast.deletedTitle'), {
        description: t('toast.deletedDescription'),
      });
    } catch {
      // The useDeleteCase hook should handle its own error toasts,
      // but a generic fallback is good here if needed.
      toast.error(t('toast.deleteFailedTitle'), {
        description: t('toast.deleteFailedDescription'),
      });
    }
  };

  // Display loading state
  if (isLoading) {
    return (
      <PageContainer>
        <Breadcrumbs />
        <PageHeader title={t('list.title')} description={t('list.description')} />
        <TableSkeleton rows={8} columns={6} />
      </PageContainer>
    );
  }

  // Display error state
  if (error) {
    return (
      <PageContainer>
        <Breadcrumbs />
        <ErrorState
          title={t('list.loadFailedTitle')}
          message={
            error instanceof Error
              ? error.message
              : t('list.loadFailedMessage')
          }
          error={error}
          onRetry={() => refetch()}
        />
      </PageContainer>
    );
  }

  // Helper function to get status badge color
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-500 text-white'; // Using direct Tailwind classes for better control
      case 'review':
        return 'bg-yellow-500 text-white';
      case 'open':
        return 'bg-blue-500 text-white';
      case 'closed':
        return 'bg-red-500 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
  };

  // Helper function to get priority badge color
  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'bg-red-600 text-white';
      case 'medium':
        return 'bg-orange-500 text-white';
      case 'low':
        return 'bg-green-600 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const filteredCases = caseRows.filter((case_item) => {
    const matchesLocalSearch =
      searchTerm === '' ||
      case_item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      case_item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      case_item.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesGlobalSearch =
      globalSearch === '' ||
      case_item.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
      case_item.client.toLowerCase().includes(globalSearch.toLowerCase()) ||
      case_item.id.toLowerCase().includes(globalSearch.toLowerCase());

    const matchesStatus = statusFilter === 'all' || case_item.status.toLowerCase() === statusFilter;

    const matchesClient =
      !clientQuery ||
      case_item.clientId === clientQuery ||
      case_item.client.toLowerCase() === clientQuery.toLowerCase();

    const matchesPriority =
      priorityFilter === 'all' || case_item.priority.toLowerCase() === priorityFilter;

    return (
      matchesLocalSearch && matchesGlobalSearch && matchesStatus && matchesClient && matchesPriority
    );
  });

  const handlePreviousPage = () => setPage((prev: number) => Math.max(1, prev - 1));
  const handleNextPage = () => setPage((prev: number) => Math.min(totalPages, prev + 1));

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
              className="shadow-md flex-1 sm:flex-none"
              onClick={() => navigate('/bulk-import?type=matters')}
            >
              <Upload className="h-4 w-4 mr-2" />
              {t('list.bulkImport')}
            </Button>
            <Button
              className="shadow-md flex-1 sm:flex-none"
              onClick={() => navigate('/matters/create')}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('list.newMatter')}
            </Button>
          </>
        }
      />

      {/* Compact Filters Toolbar */}
      <ModuleFilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t('filters.searchPlaceholder')}
        searchWidth="w-full sm:w-[320px]"
        filters={[
          {
            key: 'status',
            placeholder: t('common:fields.status'),
            value: statusFilter,
            onChange: setStatusFilter,
            width: 'w-[150px]',
            icon: <Filter className="h-4 w-4" />,
            options: [
              { value: 'all', label: t('filters.allStatuses') },
              ...statuses.map((s) => ({
                value: s.toLowerCase(),
                label: t(`status.${s.toLowerCase()}`, { defaultValue: s }),
              })),
            ],
          },
          {
            key: 'priority',
            placeholder: t('common:fields.priority'),
            value: priorityFilter,
            onChange: setPriorityFilter,
            width: 'w-[140px]',
            options: [
              { value: 'all', label: t('filters.allPriorities') },
              { value: 'high', label: t('common:priority.high') },
              { value: 'medium', label: t('common:priority.medium') },
              { value: 'low', label: t('common:priority.low') },
            ],
          },
        ]}
        onClearAll={() => {
          setSearchTerm('');
          setStatusFilter('all');
          setPriorityFilter('all');
        }}
        trailing={
          clientQuery ? (
            <Badge variant="secondary" className="px-3 py-1 text-base rounded-full">
              {t('filters.clientLabel')} <span className="font-semibold ml-1">{clientFilterName}</span>
            </Badge>
          ) : undefined
        }
      />

      {/* Matters Table */}
      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">{t('list.allMatters', { count: totalCount })}</CardTitle>
          <CardDescription>{t('list.allMattersDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={
              [
                {
                  id: 'name',
                  header: t('list.columns.name'),
                  accessorKey: 'name',
                  minWidth: '200px',
                  cell: (case_item) => (
                    <Link
                      to={`/matters/${case_item.id}`}
                      className="font-medium text-foreground outline-none transition hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary focus-visible:ring-offset-background rounded-sm truncate block max-w-[200px]"
                      title={case_item.name}
                    >
                      {case_item.name}
                    </Link>
                  ),
                },
                {
                  id: 'client',
                  header: t('common:entities.client'),
                  accessorKey: 'client',
                  minWidth: '150px',
                  cell: (case_item) => (
                    <div className="truncate max-w-[150px]" title={case_item.client}>
                      {case_item.client}
                    </div>
                  ),
                },
                {
                  id: 'status',
                  header: t('common:fields.status'),
                  accessorKey: 'status',
                  minWidth: '120px',
                  cell: (case_item) => (
                    <Badge className={getStatusColor(case_item.status)}>
                      {t(`status.${case_item.status?.toLowerCase()}`, {
                        defaultValue: case_item.status,
                      })}
                    </Badge>
                  ),
                },
                {
                  id: 'priority',
                  header: t('common:fields.priority'),
                  accessorKey: 'priority',
                  minWidth: '120px',
                  cell: (case_item) => (
                    <Badge className={getPriorityColor(case_item.priority)}>
                      {t(`common:priority.${case_item.priority?.toLowerCase()}`, {
                        defaultValue: case_item.priority,
                      })}
                    </Badge>
                  ),
                },
                {
                  id: 'assignedTo',
                  header: t('common:fields.assignedTo'),
                  accessorKey: 'assignedTo',
                  minWidth: '150px',
                  cell: (case_item) => (
                    <div className="flex items-center gap-2 max-w-[150px]">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate" title={case_item.assignedTo}>
                        {case_item.assignedTo}
                      </span>
                    </div>
                  ),
                },
                {
                  id: 'dueDate',
                  header: t('common:time.dueDate'),
                  accessorKey: 'dueDate',
                  minWidth: '150px',
                  cell: (case_item) => (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {case_item.dueDate}
                    </div>
                  ),
                },
                {
                  id: 'documentsCount',
                  header: t('common:entities.documents'),
                  accessorKey: 'documentsCount',
                  minWidth: '120px',
                  cell: (case_item) => (
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {case_item.documentsCount}
                    </div>
                  ),
                },
                {
                  id: 'actions',
                  header: t('list.columns.actions'),
                  sortable: false,
                  minWidth: '80px',
                  className: 'text-right',
                  cell: (case_item) => (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:bg-gray-100"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[180px]">
                        <DropdownMenuItem asChild>
                          <Link
                            to={`/matters/${case_item.id}`}
                            className="flex items-center cursor-pointer px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            {t('list.actions.viewDetails')}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            to={`/matters/${case_item.id}/edit`}
                            className="flex items-center cursor-pointer px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            {t('list.actions.edit')}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            to={`/matters/${case_item.id}/documents`}
                            className="flex items-center cursor-pointer px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            {t('list.actions.viewDocuments')}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="text-destructive flex items-center cursor-pointer px-2 py-1.5 text-sm hover:bg-destructive/10 rounded-sm"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t('list.actions.delete')}
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('list.deleteDialog.title')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('list.deleteDialog.description')}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteCase(case_item.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t('list.actions.delete')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ),
                },
              ] as ColumnDef<CaseRow>[]
            }
            data={filteredCases}
            emptyMessage={t('list.emptyFiltered')}
            getRowKey={(row) => row.id}
          />

          {/* Conditional rendering for empty states */}
          {filteredCases.length === 0 && cases.length === 0 && (
            <EmptyState
              icon={Briefcase}
              title={t('list.empty.title')}
              description={t('list.empty.description')}
              action={{
                label: t('list.empty.action'),
                onClick: () => navigate('/matters/create'),
                icon: Plus,
              }}
            />
          )}
          {filteredCases.length === 0 && cases.length > 0 && (
            <EmptyState
              icon={Briefcase}
              title={t('list.noMatches.title')}
              description={t('list.noMatches.description')}
              action={{
                label: t('list.noMatches.action'),
                onClick: () => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setPriorityFilter('all');
                },
              }}
            />
          )}

          {/* Pagination controls */}
          {totalCount > 0 && (
            <div className="flex items-center justify-between mt-6">
              <Button
                variant="outline"
                onClick={handlePreviousPage}
                disabled={page === 1}
                className="shadow-sm"
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
                className="shadow-sm"
              >
                {t('common:actions.next')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
