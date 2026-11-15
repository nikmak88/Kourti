import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  FileText,
  Users,
  Briefcase,
  TrendingUp,
  AlertTriangle,
  Clock,
  BarChart,
  RefreshCw,
  ArrowRight,
  Scale,
  Calendar,
} from 'lucide-react';
import { useInsights } from '@/hooks/useInsights';
import { useDashboard } from '@/hooks/useDashboard';
import { useAllCases } from '@/hooks/useCases';
import { useAllActivities } from '@/features/activities/api/useAllActivities';
import { Case, Contract } from '@/types';
import type { CalendarEvent } from '@/types';
import { formatDate as formatLocalizedDate, intlLocale } from '@/i18n/dates';
import { ModuleErrorBoundary } from '@/components/ErrorBoundary';
import { useNavigate } from 'react-router-dom';
import { calculateCaseStatusData } from '@/lib/analyticsUtils';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';

/** Locale-aware date for tables ("—" when empty/invalid). */
function formatDate(
  date: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
): string {
  if (!date) return '—';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(dateObj.getTime())) return '—';
  return dateObj.toLocaleDateString(intlLocale(), options);
}

export default function Dashboard() {
  const windowDays = 7;
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('dashboard');

  // Get data for different dashboard sections
  const { upcomingCases, upcomingContracts } = useInsights(windowDays);
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
  } = useDashboard();
  const { data: casesData, isLoading: casesLoading } = useAllCases();
  const { data: activitiesData, isLoading: activitiesLoading } = useAllActivities();

  // Process case status data for pie chart - ONLY use real data
  const casesByStatus = useMemo(() => {
    return calculateCaseStatusData(casesData || []).map((entry) => ({
      ...entry,
      name: t(`common:status.${entry.name.toLowerCase().replace(' ', '_')}`, {
        defaultValue: entry.name,
      }),
    }));
  }, [casesData, t]);

  // Generate monthly activity data based on real activity data
  const recentActivity = useMemo(() => {
    // If we have real activity data, calculate monthly trends by activity type
    if (activitiesData && activitiesData.length > 0) {
      const monthlyData: Record<string, Record<string, number>> = {};
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];

      // Initialize all months
      months.forEach((month) => {
        monthlyData[month] = {};
      });

      // Count activities by month and type
      activitiesData.forEach((activity) => {
        if (activity.created_at) {
          const month = months[new Date(activity.created_at).getMonth()];
          const activityType = activity.activity_type || 'Other';
          monthlyData[month][activityType] = (monthlyData[month][activityType] || 0) + 1;
        }
      });

      // Transform to array format for the chart with top activity types
      const allActivityTypes = new Set<string>();
      Object.values(monthlyData).forEach((monthData) => {
        Object.keys(monthData).forEach((type) => allActivityTypes.add(type));
      });

      // Get top 3 most common activity types
      const typeCounts: Record<string, number> = {};
      activitiesData.forEach((activity) => {
        const type = activity.activity_type || 'Other';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });

      const topTypes = Object.entries(typeCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([type]) => type);

      return months.map((month, index) => {
        // Display label in the UI language (Ιαν, Φεβ, …); counts stay keyed by month.
        const result: Record<string, string | number> = {
          month: formatLocalizedDate(new Date(2000, index, 1), 'LLL'),
        };
        topTypes.forEach((type) => {
          result[type] = monthlyData[month][type] || 0;
        });
        return result;
      });
    }

    // Return empty array if no data
    return [];
  }, [activitiesData, i18n.language]);

  // Handle loading states
  if (dashboardLoading && casesLoading && activitiesLoading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">{t('loading')}</p>
        </div>
      </div>
    );
  }

  // Handle error state
  if (dashboardError) {
    return (
      <div className="px-4 py-12 flex flex-col items-center justify-center">
        <div className="p-4 bg-destructive/10 rounded-full mb-4">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold mb-2">{t('error.title')}</h2>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          {t('error.message')}
        </p>
        <Button onClick={() => refetchDashboard()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('common:actions.retry')}
        </Button>
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader title={t('title')} description={t('description')} />

      {/* Stats Cards (Live Data) - No Revenue */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <Card className="shadow-card border-0 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('stats.activeMatters')}</p>
                <p className="text-2xl font-bold">
                  {dashboardLoading ? (
                    <span className="animate-pulse">—</span>
                  ) : (
                    (dashboardData?.activeCases ?? '0')
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card border-0 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('stats.totalClients')}</p>
                <p className="text-2xl font-bold">
                  {dashboardLoading ? (
                    <span className="animate-pulse">—</span>
                  ) : (
                    (dashboardData?.totalClients ?? '0')
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card border-0 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('common:entities.documents')}</p>
                <p className="text-2xl font-bold">
                  {dashboardLoading ? (
                    <span className="animate-pulse">—</span>
                  ) : (
                    (dashboardData?.totalDocuments ?? '0')
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card border-0 bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/20 dark:to-violet-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-500/10 rounded-lg">
                <Scale className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('stats.totalMatters')}</p>
                <p className="text-2xl font-bold">
                  {dashboardLoading ? (
                    <span className="animate-pulse">—</span>
                  ) : (
                    (dashboardData?.totalCases ?? '0')
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <ModuleErrorBoundary name="Monthly Activity Chart">
          <Card className="shadow-card border-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart className="h-5 w-5 text-primary" />
                {t('charts.monthlyActivity')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={recentActivity}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={30}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    {/* Render lines dynamically based on activity data */}
                    {recentActivity.length > 0 &&
                      Object.keys(recentActivity[0])
                        .filter((key) => key !== 'month')
                        .map((activityType, index) => {
                          const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
                          return (
                            <Line
                              key={activityType}
                              type="monotone"
                              dataKey={activityType}
                              name={t(`activityTypes.${activityType.toLowerCase()}`, {
                                defaultValue: activityType,
                              })}
                              stroke={colors[index % colors.length]}
                              strokeWidth={3}
                              dot={{ fill: colors[index % colors.length], strokeWidth: 2, r: 3 }}
                              activeDot={{ r: 6 }}
                            />
                          );
                        })}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  {t('charts.noActivity')}
                </div>
              )}
            </CardContent>
          </Card>
        </ModuleErrorBoundary>

        <ModuleErrorBoundary name="Cases by Status Chart">
          <Card className="shadow-card border-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                {t('charts.mattersByStatus')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {casesByStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={casesByStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, value, percent }) =>
                        `${name}: ${value} (${((percent || 0) * 100).toFixed(0)}%)`
                      }
                      labelLine={true}
                      strokeWidth={2}
                      stroke="hsl(var(--background))"
                    >
                      {casesByStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  {t('charts.noMatters')}
                </div>
              )}
            </CardContent>
          </Card>
        </ModuleErrorBoundary>
      </div>

      {/* Upcoming Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <ModuleErrorBoundary name="Upcoming Calendar Events">
          <Card className="shadow-card border-0">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  {t('upcoming.events')}
                </CardTitle>
                <p className="text-muted-foreground text-sm">{t('upcoming.nextDays', { count: 7 })}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => navigate('/calendar')}
              >
                {t('common:actions.viewAll')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {dashboardData?.upcomingCalendarEvents &&
              dashboardData.upcomingCalendarEvents.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common:entities.event')}</TableHead>
                      <TableHead>{t('common:time.date')}</TableHead>
                      <TableHead>{t('common:fields.type')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboardData.upcomingCalendarEvents.map((event: Partial<CalendarEvent>) => (
                      <TableRow
                        key={event.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate('/calendar')}
                      >
                        <TableCell
                          className="font-medium max-w-[200px] truncate"
                          title={event.title}
                        >
                          {event.title}
                        </TableCell>
                        <TableCell>{formatDate(event.start_date)}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            {event.event_type
                              ? t(`eventTypes.${event.event_type}`, { defaultValue: event.event_type })
                              : t('common:entities.event')}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-6 bg-muted/10 rounded-md">
                  <p className="text-muted-foreground text-sm">
                    {t('upcoming.noEvents', { count: 7 })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </ModuleErrorBoundary>

        <ModuleErrorBoundary name="Upcoming Hearings">
          <Card className="shadow-card border-0">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-warning" />
                  {t('upcoming.hearings')}
                </CardTitle>
                <p className="text-muted-foreground text-sm">
                  {t('upcoming.nextDays', { count: windowDays })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => navigate('/calendar')}
              >
                {t('common:actions.viewAll')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {upcomingCases.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common:entities.matter')}</TableHead>
                      <TableHead>{t('common:time.date')}</TableHead>
                      <TableHead>{t('upcoming.court')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingCases.map((c: Case) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/matters/${c.id}`)}
                      >
                        <TableCell className="font-medium max-w-[200px] truncate" title={c.title}>
                          {c.title}
                        </TableCell>
                        <TableCell>{formatDate(c.next_hearing_date)}</TableCell>
                        <TableCell
                          className="max-w-[120px] truncate"
                          title={c.court || t('upcoming.tbd')}
                        >
                          {c.court || t('upcoming.tbd')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-6 bg-muted/10 rounded-md">
                  <p className="text-muted-foreground text-sm">
                    {t('upcoming.noHearings', { count: windowDays })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </ModuleErrorBoundary>

        <ModuleErrorBoundary name="Contract Renewals">
          <Card className="shadow-card border-0">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  {t('upcoming.contractRenewals')}
                </CardTitle>
                <p className="text-muted-foreground text-sm">{t('upcoming.expiringSoon')}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => navigate('/contracts')}
              >
                {t('common:actions.viewAll')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {upcomingContracts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common:entities.contract')}</TableHead>
                      <TableHead>{t('upcoming.endDate')}</TableHead>
                      <TableHead>{t('common:fields.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingContracts.map((contract: Contract) => (
                      <TableRow
                        key={contract.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/contracts/${contract.id}`)}
                      >
                        <TableCell
                          className="font-medium max-w-[200px] truncate"
                          title={contract.title}
                        >
                          {contract.title}
                        </TableCell>
                        <TableCell>{formatDate(contract.end_date)}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              contract.status === 'active'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : contract.status === 'draft'
                                  ? 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}
                          >
                            {contract.status
                              ? t(`common:status.${contract.status}`, { defaultValue: contract.status })
                              : t('common:status.unknown')}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-6 bg-muted/10 rounded-md">
                  <p className="text-muted-foreground text-sm">
                    {t('upcoming.noContracts', { count: windowDays })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </ModuleErrorBoundary>
      </div>
    </PageContainer>
  );
}
