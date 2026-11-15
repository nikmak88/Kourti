import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CalendarDays, Clock, Users, Search, Check, X } from 'lucide-react';
import { format, startOfDay, endOfDay, isWithinInterval, parseISO } from 'date-fns';
import { useOrganizationMembersForSharing } from '@/hooks/useCalendarSharing';
import { useCalendarEventsByDateRange } from '@/hooks/useCalendar';
import { cn } from '@/lib/utils';
import { EventCreateDialog } from './EventCreateDialog';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '@/i18n/dates';

interface FindAvailableTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AvailabilitySlot {
  time: Date;
  available: boolean;
  conflictingUsers: string[];
}

export function FindAvailableTimeDialog({ open, onOpenChange }: FindAvailableTimeDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedDuration, setSelectedDuration] = useState<number>(60);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const { t } = useTranslation('calendar');

  const { data: members, isLoading: isLoadingMembers } = useOrganizationMembersForSharing();

  const startDate = useMemo(() => startOfDay(selectedDate).toISOString(), [selectedDate]);
  const endDate = useMemo(() => endOfDay(selectedDate).toISOString(), [selectedDate]);

  const { data: events = [], isLoading: isLoadingEvents } = useCalendarEventsByDateRange(
    startDate,
    endDate
  );

  const filteredMembers = members?.filter(
    (member) =>
      (member.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (member.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const availabilitySlots = useMemo(() => {
    const slots: AvailabilitySlot[] = [];
    const startHour = 8; // 8 AM
    const endHour = 18; // 6 PM

    for (let hour = startHour; hour < endHour; hour++) {
      const slotTime = new Date(selectedDate);
      slotTime.setHours(hour, 0, 0, 0);

      const conflictingUsers: string[] = [];

      // Check each selected user for conflicts
      selectedUsers.forEach((userId) => {
        const userEvents = events.filter(
          (e) => e.created_by === userId || e.attendees?.includes(userId)
        );

        const slotEndTime = new Date(slotTime.getTime() + selectedDuration * 60000);

        const hasConflict = userEvents.some((event) => {
          const eventStart = parseISO(event.start_date);
          const eventEnd = parseISO(event.end_date);

          return (
            isWithinInterval(slotTime, { start: eventStart, end: eventEnd }) ||
            isWithinInterval(slotEndTime, { start: eventStart, end: eventEnd }) ||
            (slotTime <= eventStart && slotEndTime >= eventEnd)
          );
        });

        if (hasConflict) {
          const user = members?.find((m) => m.id === userId);
          if (user) {
            conflictingUsers.push(user.name);
          }
        }
      });

      slots.push({
        time: slotTime,
        available: conflictingUsers.length === 0,
        conflictingUsers,
      });
    }

    return slots;
  }, [selectedDate, selectedDuration, selectedUsers, events, members]);

  const handleUserToggle = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUsers((prev) => [...prev, userId]);
    } else {
      setSelectedUsers((prev) => prev.filter((id) => id !== userId));
    }
  };

  const handleSlotSelect = (slot: AvailabilitySlot) => {
    if (slot.available) {
      setSelectedSlot(slot.time);
      setShowCreateEvent(true);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isLoading = isLoadingMembers || isLoadingEvents;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              {t('findTime.title')}
            </DialogTitle>
            <DialogDescription>
              {t('findTime.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 overflow-hidden">
            {/* Left panel - Settings */}
            <div className="space-y-4 overflow-y-auto">
              {/* Date picker */}
              <div className="space-y-2">
                <Label>{t('common:time.date')}</Label>
                <Input
                  type="date"
                  value={format(selectedDate, 'yyyy-MM-dd')}
                  onChange={(e) => {
                    // Parse as a LOCAL date — `new Date('yyyy-MM-dd')` is interpreted as
                    // UTC midnight, which shifts the day backward in negative-UTC zones.
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    if (y && m && d) setSelectedDate(new Date(y, m - 1, d));
                  }}
                  min={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <Label>{t('findTime.duration')}</Label>
                <div className="flex gap-2">
                  {[30, 60, 90, 120].map((duration) => (
                    <Button
                      key={duration}
                      type="button"
                      variant={selectedDuration === duration ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedDuration(duration)}
                    >
                      {t('findTime.minutes', { count: duration })}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Attendees */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {t('form.attendees')}
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('findTime.searchMembers')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <ScrollArea className="h-48 border rounded-md p-2">
                  {isLoadingMembers ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : filteredMembers && filteredMembers.length > 0 ? (
                    <div className="space-y-1">
                      {filteredMembers.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50"
                        >
                          <Checkbox
                            id={`user-${member.id}`}
                            checked={selectedUsers.includes(member.id)}
                            onCheckedChange={(checked) =>
                              handleUserToggle(member.id, checked as boolean)
                            }
                          />
                          <label
                            htmlFor={`user-${member.id}`}
                            className="flex items-center gap-2 flex-1 cursor-pointer"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback
                                style={{ backgroundColor: member.color }}
                                className="text-white text-xs"
                              >
                                {getInitials(member.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{member.name}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {member.email}
                              </div>
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      {t('findTime.noMembers')}
                    </div>
                  )}
                </ScrollArea>
                <div className="text-xs text-muted-foreground">{t('findTime.selected', { count: selectedUsers.length })}</div>
              </div>
            </div>

            {/* Right panel - Availability grid */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t('findTime.availableSlots')}
              </Label>
              <div className="border rounded-lg p-4">
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
                    ))}
                  </div>
                ) : selectedUsers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>{t('findTime.selectAttendees')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availabilitySlots.map((slot) => (
                      <button
                        key={slot.time.toISOString()}
                        onClick={() => handleSlotSelect(slot)}
                        disabled={!slot.available}
                        className={cn(
                          'w-full p-3 rounded-lg border transition-all text-left',
                          slot.available
                            ? 'bg-green-50 border-green-200 hover:bg-green-100 hover:border-green-300 cursor-pointer'
                            : 'bg-red-50 border-red-200 cursor-not-allowed'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {slot.available ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <X className="h-4 w-4 text-red-600" />
                            )}
                            <span className="font-medium">
                              {format(slot.time, 'p', { locale: dateLocale() })} -{' '}
                              {format(
                                new Date(slot.time.getTime() + selectedDuration * 60000),
                                'p',
                                { locale: dateLocale() }
                              )}
                            </span>
                          </div>
                          {!slot.available && (
                            <Badge variant="destructive" className="text-xs">
                              {t('findTime.conflicts', { count: slot.conflictingUsers.length })}
                            </Badge>
                          )}
                        </div>
                        {!slot.available && (
                          <div className="text-xs text-red-600 mt-1 pl-6">
                            {t('findTime.conflictsWith', { names: slot.conflictingUsers.join(', ') })}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:actions.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Event creation dialog for selected slot */}
      {selectedSlot && (
        <EventCreateDialog
          initialDate={selectedSlot}
          initialDuration={selectedDuration}
          initialAttendees={selectedUsers}
          open={showCreateEvent}
          onOpenChange={setShowCreateEvent}
        />
      )}
    </>
  );
}
