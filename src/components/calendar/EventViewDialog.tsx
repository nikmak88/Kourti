import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CalendarEvent, CalendarEventWithOwner } from '@/types';
import { format } from 'date-fns';
import { Clock, MapPin, Users, FileText, Edit, Trash2, User } from 'lucide-react';
import { useDeleteCalendarEvent } from '@/hooks/useCalendar';
import { toast } from 'sonner';
import { EventEditDialog } from './EventEditDialog';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '@/i18n/dates';

interface EventViewDialogProps {
  event: CalendarEvent | CalendarEventWithOwner | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventViewDialog({ event, open, onOpenChange }: EventViewDialogProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const deleteEvent = useDeleteCalendarEvent();
  const { t } = useTranslation('calendar');

  if (!event) return null;

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'meeting':
        return 'bg-primary text-primary-foreground';
      case 'hearing':
        return 'bg-destructive text-destructive-foreground';
      case 'deadline':
        return 'bg-warning text-warning-foreground';
      case 'deposition':
        return 'bg-success text-success-foreground';
      case 'review':
        return 'bg-muted text-muted-foreground';
      case 'consultation':
        return 'bg-secondary text-secondary-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const handleDelete = async () => {
    try {
      await deleteEvent.mutateAsync(event.id);
      onOpenChange(false);
    } catch {
      toast.error(t('common:toast.error'), {
        description: t('view.deleteFailed'),
      });
    }
  };

  const handleEdit = () => {
    setShowEditDialog(true);
    // Don't close the view dialog, keep it in background
  };

  const handleEditClose = () => {
    setShowEditDialog(false);
    // If event was updated, view dialog remains open to show updated event
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl">{event.title}</DialogTitle>
              <Badge className={getEventTypeColor(event.event_type || 'meeting')}>
                {event.event_type
                  ? t(`eventTypes.${event.event_type}`, { defaultValue: event.event_type })
                  : t('eventTypes.event')}
              </Badge>
            </div>
            <DialogDescription>{t('view.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Event Details */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{format(new Date(event.start_date), 'PPP', { locale: dateLocale() })}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(event.start_date), 'p', { locale: dateLocale() })} -{' '}
                    {format(new Date(event.end_date), 'p', { locale: dateLocale() })}
                  </p>
                </div>
              </div>

              {event.location && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm">{event.location}</p>
                </div>
              )}

              {event.description && (
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{t('common:fields.description')}</p>
                    <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                  </div>
                </div>
              )}

              {event.attendees && event.attendees.length > 0 && (
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{t('form.attendees')}</p>
                    <div className="mt-2 space-y-1">
                      {event.attendees.map((attendee, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{attendee}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-between pt-4 border-t">
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleEdit}>
                  <Edit className="h-4 w-4 mr-2" />
                  {t('view.edit')}
                </Button>
                <Button variant="outline" onClick={handleDelete} disabled={deleteEvent.isPending}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('view.delete')}
                </Button>
              </div>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common:actions.close')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EventEditDialog
        event={event as CalendarEvent}
        open={showEditDialog}
        onOpenChange={handleEditClose}
      />
    </>
  );
}
