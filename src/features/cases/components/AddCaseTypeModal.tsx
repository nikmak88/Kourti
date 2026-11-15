import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { useCreateCaseType } from '@/features/cases/api/createCaseType';
import { Switch } from '@/components/ui/switch';

// Schema for case type validation (built per render so messages follow the UI language)
const makeCaseTypeSchema = (t: TFunction) =>
  z.object({
    name: z.string().min(1, t('matterTypes.validation.nameRequired')),
    description: z.string().optional(),
    is_active: z.boolean(),
  });

type CaseTypeFormValues = z.infer<ReturnType<typeof makeCaseTypeSchema>>;

interface AddCaseTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (caseTypeId: string) => void;
}

/**
 * Modal for adding a new case type
 */
export function AddCaseTypeModal({ isOpen, onClose, onSuccess }: AddCaseTypeModalProps) {
  const { t } = useTranslation('matters');
  const caseTypeSchema = useMemo(() => makeCaseTypeSchema(t), [t]);
  const { data: organizationId } = useUserOrganization();
  const createCaseType = useCreateCaseType();

  const form = useForm<CaseTypeFormValues>({
    resolver: zodResolver(caseTypeSchema),
    defaultValues: {
      name: '',
      description: '',
      is_active: true,
    },
  });

  const onSubmit = async (data: CaseTypeFormValues) => {
    if (!organizationId) {
      toast.error(t('common:toast.error'), { description: t('matterTypes.toast.organizationRequired') });
      return;
    }

    try {
      const result = await createCaseType.mutateAsync({
        name: data.name,
        description: data.description,
        organization_id: organizationId,
        is_active: data.is_active,
      });

      toast.success(t('common:toast.success'), {
        description: t('matterTypes.toast.created', { name: data.name }),
      });

      form.reset();
      onClose();

      // Call success callback with the new case type ID
      if (onSuccess && result.id) {
        onSuccess(result.id);
      }
    } catch (error) {
      console.error('Error creating case type:', error);
      toast.error(t('common:toast.error'), {
        description: error instanceof Error ? error.message : t('matterTypes.toast.createFailed'),
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('matterTypes.addTitle')}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common:fields.name')}*</FormLabel>
                  <FormControl>
                    <Input placeholder={t('matterTypes.namePlaceholder')} {...field} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common:fields.description')}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('matterTypes.descriptionPlaceholder')} {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t('common:status.active')}</FormLabel>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={createCaseType.isPending}
              >
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={createCaseType.isPending}>
                {createCaseType.isPending ? t('matterTypes.creating') : t('matterTypes.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
