import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Building,
  Mail,
  MoreHorizontal,
  Upload,
  UserCheck,
  Filter,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModuleFilterBar } from '@/components/filters/ModuleFilterBar';
import { DataTable, ColumnDef } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { useClients } from '@/hooks/useClients';
import { useEnableClientPortal, useDisableClientPortal } from '@/features/clientPortal/api';
import { toast } from 'sonner';
import type { Client } from '@/types';
import { TableSkeleton } from '@/components/ui/loading-states';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/i18n/dates';

export default function Clients() {
  const navigate = useNavigate();
  const { t } = useTranslation('clients');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, isLoading, error } = useClients();
  const clients: Client[] = data?.items ?? [];

  if (isLoading) {
    return (
      <PageContainer>
        <Breadcrumbs />
        <PageHeader title={t('list.title')} description={t('list.description')} />
        <TableSkeleton rows={6} columns={4} />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <Breadcrumbs />
        <ErrorState
          title={t('list.loadFailed')}
          message={
            error instanceof Error
              ? error.message
              : t('list.loadFailedDescription')
          }
          error={error}
        />
      </PageContainer>
    );
  }

  // Filter & aggregations ---------------------------------------------------
  const filtered = clients.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' || (c.status?.toLowerCase() ?? '') === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalCases = clients.reduce((sum, c) => sum + (c.cases?.[0]?.count ?? 0), 0);
  const totalContracts = clients.reduce((sum, c) => sum + (c.contracts?.[0]?.count ?? 0), 0);

  // Helpers -----------------------------------------------------------------
  const getStatusColor = (status?: string) => {
    switch ((status ?? '').toLowerCase()) {
      case 'active':
        return 'bg-success/10 text-success';
      case 'inactive':
        return 'bg-muted/50 text-muted-foreground';
      default:
        return 'bg-muted/50 text-muted-foreground';
    }
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  // -------------------------------------------------------------------------
  return (
    <PageContainer className="animate-fade-in">
      <Breadcrumbs />

      <PageHeader
        title={t('list.title')}
        description={t('list.description')}
        actions={
          <>
            <Button onClick={() => navigate('/clients/create')} className="shadow-md hover-scale">
              <Plus className="h-4 w-4 mr-2" />
              {t('list.newClient')}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/bulk-import?type=clients')}
              className="hover-scale"
            >
              <Upload className="h-4 w-4 mr-2" />
              {t('list.bulkImport')}
            </Button>
          </>
        }
      />

      {/* Metrics ---------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MetricCard label={t('list.metrics.totalClients')} value={clients.length} />
        <MetricCard
          label={t('list.metrics.activeClients')}
          value={clients.filter((c) => (c.status?.toLowerCase() ?? '') === 'active').length}
        />
        <MetricCard label={t('list.metrics.totalCases')} value={totalCases} />
        <MetricCard label={t('list.metrics.totalContracts')} value={totalContracts} />
      </div>

      {/* Filters ---------------------------------------------------------- */}
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
            onChange: setStatusFilter,
            width: 'w-[140px]',
            icon: <Filter className="h-4 w-4" />,
            options: [
              { value: 'all', label: t('list.allStatuses') },
              { value: 'active', label: t('common:status.active') },
              { value: 'inactive', label: t('common:status.inactive') },
              { value: 'pending', label: t('common:status.pending') },
            ],
          },
        ]}
        onClearAll={() => {
          setSearchTerm('');
          setStatusFilter('all');
        }}
      />

      {/* Table ------------------------------------------------------------ */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>{t('list.directory')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={
              [
                {
                  id: 'client',
                  header: t('common:entities.client'),
                  accessorKey: 'name',
                  minWidth: '200px',
                  cell: (client) => (
                    <div className="flex items-center gap-3 max-w-[200px]">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                          {getInitials(client.name)}
                        </AvatarFallback>
                      </Avatar>
                      <button
                        onClick={() => navigate(`/clients/${client.id}`)}
                        className="font-medium text-foreground hover:text-primary text-left truncate"
                        title={client.name}
                      >
                        {client.name}
                      </button>
                    </div>
                  ),
                },
                {
                  id: 'contact',
                  header: t('common:fields.email'),
                  sortable: false,
                  minWidth: '200px',
                  cell: (client) => (
                    <div
                      className="flex items-center gap-2 text-sm truncate max-w-[200px]"
                      title={client.email || t('list.noEmail')}
                    >
                      <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{client.email || t('list.noEmail')}</span>
                    </div>
                  ),
                },
                {
                  id: 'type',
                  header: t('common:fields.type'),
                  sortable: false,
                  minWidth: '120px',
                  cell: () => <Badge variant="outline">{t('list.individual')}</Badge>,
                },
                {
                  id: 'status',
                  header: t('common:fields.status'),
                  accessorKey: 'status',
                  minWidth: '120px',
                  cell: (client) => (
                    <Badge className={getStatusColor(client.status)} variant="outline">
                      {client.status
                        ? t(`common:status.${client.status.toLowerCase()}`, {
                            defaultValue: client.status,
                          })
                        : '-'}
                    </Badge>
                  ),
                },
                {
                  id: 'cases',
                  header: t('list.columns.cases'),
                  accessorFn: (client) => client.cases?.[0]?.count ?? 0,
                  minWidth: '100px',
                  cell: (client) => (
                    <span className="font-medium">{client.cases?.[0]?.count ?? 0}</span>
                  ),
                },
                {
                  id: 'contracts',
                  header: t('common:entities.contracts'),
                  accessorFn: (client) => client.contracts?.[0]?.count ?? 0,
                  minWidth: '120px',
                  cell: (client) => (
                    <span className="font-medium">{client.contracts?.[0]?.count ?? 0}</span>
                  ),
                },
                {
                  id: 'created',
                  header: t('common:fields.createdAt'),
                  accessorKey: 'created_at',
                  minWidth: '120px',
                  cell: (client) => (
                    <span className="text-sm text-muted-foreground">
                      {formatDate(client.created_at, 'P')}
                    </span>
                  ),
                },
                {
                  id: 'actions',
                  header: t('list.columns.actions'),
                  sortable: false,
                  minWidth: '80px',
                  cell: (client) => <ClientActionsMenu client={client} navigate={navigate} />,
                },
              ] as ColumnDef<Client>[]
            }
            data={filtered}
            emptyMessage={t('list.noClientsFound')}
            getRowKey={(row) => row.id}
          />
        </CardContent>
      </Card>

      {/* Empty state ------------------------------------------------------ */}
      {filtered.length === 0 && clients.length === 0 && (
        <EmptyState
          icon={UserCheck}
          title={t('list.empty.title')}
          description={t('list.empty.description')}
          action={{
            label: t('list.empty.action'),
            onClick: () => navigate('/clients/create'),
            icon: Plus,
          }}
        />
      )}
      {filtered.length === 0 && clients.length > 0 && (
        <EmptyState
          icon={UserCheck}
          title={t('list.noMatch.title')}
          description={t('list.noMatch.description', { search: searchTerm })}
          action={{
            label: t('list.noMatch.action'),
            onClick: () => {
              setSearchTerm('');
              setStatusFilter('all');
            },
          }}
        />
      )}
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Per-row actions menu (extracted so the client portal hooks can be used) ---
// ---------------------------------------------------------------------------
interface ClientActionsMenuProps {
  client: Client;
  navigate: ReturnType<typeof useNavigate>;
}

function ClientActionsMenu({ client, navigate }: ClientActionsMenuProps) {
  const { t } = useTranslation('clients');
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const enablePortal = useEnableClientPortal();
  const disablePortal = useDisableClientPortal();

  // The clients list row does not carry portal state, so we always offer both
  // enable (idempotent server-side — it re-sends the invite) and disable, and
  // rely on the mutation toasts + query invalidation for feedback.
  const hasEmail = Boolean(client.email);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}`)}>
            {t('actions.viewDetails')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}/edit`)}>
            {t('actions.editClient')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/matters?client=${client.id}`)}>
            {t('actions.viewMatters')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/contracts?client=${client.id}`)}>
            {t('actions.viewContracts')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!hasEmail || enablePortal.isPending}
            onClick={() => {
              if (!hasEmail) {
                toast.error(t('portal.emailRequired'));
                return;
              }
              enablePortal.mutate(client.id);
            }}
          >
            <ShieldCheck className="h-4 w-4 mr-2" />
            {t('portal.enable')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setConfirmDisableOpen(true)}
          >
            <ShieldOff className="h-4 w-4 mr-2" />
            {t('portal.disable')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDisableOpen} onOpenChange={setConfirmDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('portal.disableConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('portal.disableConfirmDescription', { name: client.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => disablePortal.mutate(client.id)}
            >
              {t('portal.disableAccess')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reusable metric card component -------------------------------------------
// ---------------------------------------------------------------------------
interface MetricCardProps {
  label: string;
  value: number | string;
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-lg">
            <Building className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
