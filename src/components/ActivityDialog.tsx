/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateActivity, useUpdateActivity } from '@/features/activities/api/useCreateActivity';
import { useOrganizationMembers } from '@/hooks/useOrganization';
import { useActivityTypes } from '@/hooks/useActivityTypes';
import { CaseActivity } from '@/features/activities/types';
import { useTranslation } from 'react-i18next';

interface ActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  activity?: CaseActivity;
}

export function ActivityDialog({ open, onOpenChange, caseId, activity }: ActivityDialogProps) {
  const isEdit = !!activity;
  const { t } = useTranslation('matters');
  const { data: users = [] } = useOrganizationMembers();
  const { data: activityTypes = [] } = useActivityTypes();
  const createActivity = useCreateActivity();
  const updateActivity = useUpdateActivity();

  const [form, setForm] = useState(() =>
    activity
      ? {
          title: activity.title,
          description: activity.description || '',
          activity_type: activity.activity_type,
          due_date: activity.due_date || '',
          assigned_to: activity.assigned_to || 'unassigned',
          status: activity.status || 'pending',
        }
      : {
          title: '',
          description: '',
          activity_type: activityTypes[0]?.value || 'meeting',
          due_date: '',
          assigned_to: 'unassigned',
          status: 'pending',
        }
  );

  const [submitting, setSubmitting] = useState(false);

  const statusOptions = [
    { value: 'pending', label: t('activities.status.pending') },
    { value: 'in_progress', label: t('activities.status.in_progress') },
    { value: 'completed', label: t('activities.status.completed') },
    { value: 'cancelled', label: t('activities.status.cancelled') },
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (isEdit && activity) {
        await updateActivity.mutateAsync({
          id: activity.id,
          ...form,
          assigned_to: form.assigned_to === 'unassigned' ? null : form.assigned_to,
          due_date: form.due_date || null,
        });
      } else {
        await createActivity.mutateAsync({
          caseId,
          payload: {
            ...form,
            assigned_to: form.assigned_to === 'unassigned' ? null : form.assigned_to,
            due_date: form.due_date || null,
          },
        });
      }

      onOpenChange(false);
      if (!isEdit) {
        setForm({
          title: '',
          description: '',
          activity_type: activityTypes[0]?.value || 'meeting',
          due_date: '',
          assigned_to: 'unassigned',
          status: 'pending',
        });
      }
    } catch (error) {
      console.error('Failed to save activity:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('activities.dialog.editTitle') : t('activities.dialog.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('activities.dialog.editDescription')
              : t('activities.dialog.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" id="activity-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('activities.dialog.titleLabel')} *</label>
              <Input
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder={t('activities.dialog.titlePlaceholder')}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">{t('activities.dialog.typeLabel')}</label>
              <Select
                value={form.activity_type}
                onValueChange={(value) => setForm((prev) => ({ ...prev, activity_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('activities.dialog.typePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {activityTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {t(`activities.types.${type.value}`, { defaultValue: type.label })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">{t('common:time.dueDate')}</label>
              <Input name="due_date" type="date" value={form.due_date} onChange={handleChange} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">{t('common:fields.status')}</label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">{t('activities.dialog.assignTo')}</label>
              <Select
                value={form.assigned_to}
                onValueChange={(value) => setForm((prev) => ({ ...prev, assigned_to: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('activities.dialog.assigneePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">{t('list.unassigned')}</SelectItem>
                  {users.map((user: any) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.first_name} {user.last_name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">{t('common:fields.description')}</label>
              <Textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder={t('activities.dialog.descriptionPlaceholder')}
                rows={3}
              />
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="activity-form" disabled={submitting}>
            {submitting
              ? t('common:status.saving')
              : isEdit
                ? t('edit.saveChanges')
                : t('activities.dialog.submitCreate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
