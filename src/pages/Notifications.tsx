import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useNotifications as useNotificationsHook,
  useUpdateNotification,
  useDeleteNotification,
  useMarkAllNotificationsAsRead,
} from '@/hooks/useNotifications';
import {
  Bell,
  CheckCircle,
  Clock,
  AlertTriangle,
  Calendar,
  FileText,
  Briefcase,
  Info,
  CheckCheck,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { formatDate as formatLocalizedDate, formatRelative } from '@/i18n/dates';

// Define local notification type to match database
interface Notification {
  id: string;
  title: string | null;
  description: string | null;
  type: string | null;
  status: string | null;
  read: boolean;
  created_at: string | null;
  date: string;
}

// Transform database notification to local type
function transformNotification(n: {
  id: string;
  title: string | null;
  description: string | null;
  type: string | null;
  status: string | null;
  created_at: string | null;
}): Notification {
  return {
    ...n,
    read: n.status !== 'unread',
    date: n.created_at || new Date().toISOString(),
  };
}

export default function Notifications() {
  const { data: rawNotifications = [] } = useNotificationsHook();
  const notifications = rawNotifications.map(transformNotification);
  const updateNotification = useUpdateNotification();
  const deleteNotification = useDeleteNotification();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const { t } = useTranslation('notifications');

  const markAsRead = (id: string) => {
    updateNotification.mutate({ id, status: 'read' });
  };

  const handleDelete = (id: string) => {
    deleteNotification.mutate(id);
  };

  const [activeTab, setActiveTab] = useState('all');

  // Group notifications by type
  const allNotifications = [...notifications];
  const unreadNotifications = notifications.filter((n) => n.status === 'unread');
  const caseNotifications = notifications.filter((n) => n.type === 'case');
  const documentNotifications = notifications.filter((n) => n.type === 'document');
  const eventNotifications = notifications.filter((n) => n.type === 'calendar');

  // Sort notifications by date (newest first)
  const sortedNotifications = (notifs: Notification[]) => {
    return [...notifs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // Get the icon based on notification type
  const getIcon = (type: string) => {
    switch (type) {
      case 'event':
        return <Calendar className="h-5 w-5 text-blue-500" />;
      case 'document':
        return <FileText className="h-5 w-5 text-green-500" />;
      case 'case':
        return <Briefcase className="h-5 w-5 text-purple-500" />;
      case 'system':
        return <Info className="h-5 w-5 text-amber-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.round(diffMs / 86400000);

    // Recent: "3 hours ago" / "πριν από 3 ώρες"; older: localized date.
    if (diffDays < 7) {
      return formatRelative(date);
    }
    return formatLocalizedDate(date, 'PP');
  };

  const handleMarkAllRead = () => {
    markAllAsRead.mutate();
  };

  // Render notification list
  const renderNotificationList = (notificationList: Notification[]) => {
    const sorted = sortedNotifications(notificationList);

    if (sorted.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bell className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium">{t('empty.title')}</h3>
          <p className="text-muted-foreground mt-1 max-w-md">
            {activeTab === 'unread'
              ? t('empty.allRead')
              : t('empty.noneInCategory')}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {sorted.map((notification) => (
          <div
            key={notification.id}
            className={`flex p-4 rounded-lg border ${notification.read ? 'bg-card' : 'bg-primary/5 border-primary/20'}`}
          >
            <div className="mr-4 mt-1">{getIcon(notification.type ?? 'system')}</div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className={`font-medium ${notification.read ? '' : 'text-primary'}`}>
                    {notification.title}
                  </h3>
                  <p className="text-muted-foreground text-sm mt-1">{notification.description}</p>
                </div>
                <div className="flex items-center gap-1">
                  {!notification.read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => markAsRead(notification.id)}
                    >
                      <CheckCheck className="h-3 w-3 mr-1" />
                      {t('actions.markRead')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(notification.id)}
                    title={t('actions.delete')}
                    aria-label={t('actions.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center mt-2">
                <span className="text-xs text-muted-foreground">
                  {formatDate(notification.date)}
                </span>
                <Badge variant="outline" className="ml-2 text-xs py-0 px-1.5 h-5">
                  {t(`types.${notification.type ?? 'system'}`, {
                    defaultValue:
                      (notification.type ?? 'system').charAt(0).toUpperCase() +
                      (notification.type ?? 'system').slice(1),
                  })}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <PageContainer size="narrow">
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
      />

      {/* Main content */}
      <Card className="shadow-sm">
        <CardHeader className="border-b pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              {t('page.yourNotifications')}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleMarkAllRead}
                disabled={!unreadNotifications.length}
              >
                <CheckCircle className="h-4 w-4 mr-1.5" />
                {t('actions.markAllRead')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => notifications.forEach((n) => handleDelete(n.id))}
                disabled={!notifications.length}
              >
                {t('actions.clearAll')}
              </Button>
            </div>
          </div>
          <CardDescription>
            {t('page.unreadCount', { count: unreadNotifications.length })}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Tabs defaultValue="all" onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-5 mb-6">
              <TabsTrigger value="all" className="flex items-center gap-1.5">
                <Bell className="h-4 w-4" />
                <span>{t('common:status.all')}</span>
                <Badge variant="secondary" className="ml-1">
                  {allNotifications.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="unread" className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                <span>{t('tabs.unread')}</span>
                <Badge variant="secondary" className="ml-1">
                  {unreadNotifications.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="cases" className="flex items-center gap-1.5">
                <Briefcase className="h-4 w-4" />
                <span>{t('common:entities.matters')}</span>
                <Badge variant="secondary" className="ml-1">
                  {caseNotifications.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center gap-1.5">
                <FileText className="h-4 w-4" />
                <span>{t('common:entities.documents')}</span>
                <Badge variant="secondary" className="ml-1">
                  {documentNotifications.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="events" className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                <span>{t('common:entities.events')}</span>
                <Badge variant="secondary" className="ml-1">
                  {eventNotifications.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all">{renderNotificationList(allNotifications)}</TabsContent>

            <TabsContent value="unread">{renderNotificationList(unreadNotifications)}</TabsContent>

            <TabsContent value="cases">{renderNotificationList(caseNotifications)}</TabsContent>

            <TabsContent value="documents">
              {renderNotificationList(documentNotifications)}
            </TabsContent>

            <TabsContent value="events">{renderNotificationList(eventNotifications)}</TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            {t('settings.title')}
          </CardTitle>
          <CardDescription>{t('settings.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('settings.email.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {t('settings.email.description')}
                </p>
                <Button className="w-full" variant="outline">
                  {t('settings.email.action')}
                </Button>
              </CardContent>
            </Card>

            <Card className="border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('settings.browser.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {t('settings.browser.description')}
                </p>
                <Button className="w-full" variant="outline">
                  {t('settings.browser.action')}
                </Button>
              </CardContent>
            </Card>

            <Card className="border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('settings.filters.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {t('settings.filters.description')}
                </p>
                <Button className="w-full" variant="outline">
                  {t('settings.filters.action')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
