import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAllRoles } from '@/hooks/useAllRoles';
import { useUserRole } from '@/hooks/useUserManagement';

// Built inside the component so validation messages follow the UI language.
const createInviteSchema = (t: TFunction) =>
  z.object({
    email: z.string().email(t('users:invite.validation.emailInvalid')),
    firstName: z.string().min(1, t('users:invite.validation.firstNameRequired')),
    lastName: z.string().min(1, t('users:invite.validation.lastNameRequired')),
    role: z.string().min(1, t('users:invite.validation.roleRequired')),
    department: z.string().optional(),
  });

type InviteFormData = z.infer<ReturnType<typeof createInviteSchema>>;

interface InviteUserDialogProps {
  onInvite: (data: {
    email: string;
    firstName: string;
    lastName: string;
    roleId?: string;
    department?: string;
  }) => Promise<unknown>;
}

export function InviteUserDialog({ onInvite }: InviteUserDialogProps) {
  const [open, setOpen] = useState(false);
  const { data: allRoles = [] } = useAllRoles();
  const { data: userRole } = useUserRole();
  const isSuperAdmin = userRole?.role === 'superadmin';
  const { t } = useTranslation('users');
  const inviteSchema = useMemo(() => createInviteSchema(t), [t]);
  // Role codes are API values: translate known ones, show the stored name otherwise.
  const roleLabel = (code: string, fallback?: string) =>
    t(`roles.${code}`, { defaultValue: fallback || code });

  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      role: '',
      department: '',
    },
  });

  // Get available roles (all global roles + custom roles)
  // Filter out superadmin role unless the current user is a superadmin
  const availableRoles = [
    // Global roles
    ...allRoles
      .filter((role) => role.source === 'global')
      .filter(
        (role) => isSuperAdmin || (role.role !== 'superadmin' && role.role_name !== 'superadmin')
      )
      .map((role) => ({
        value: role.role || role.role_name,
        label: roleLabel(role.role || role.role_name, role.display_name || role.role_name || role.role),
      })),
    // Custom roles
    ...allRoles
      .filter((role) => role.source === 'custom')
      .map((role) => ({
        value: role.role || role.role_name,
        label: role.display_name || role.role_name || role.role,
      })),
  ];

  const handleSubmit = async (data: InviteFormData) => {
    try {
      await onInvite({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        roleId: data.role,
        department: data.department,
      });
      form.reset();
      setOpen(false);
    } catch (error) {
      console.error('Failed to invite user:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus2Icon className="h-4 w-4 mr-2" />
          {t('invite.trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('invite.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('invite.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('invite.firstName')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('invite.firstNamePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('invite.lastName')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('invite.lastNamePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('invite.email')}</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="john.doe@company.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('invite.roleRequiredLabel')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('invite.selectRole')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          <div className="flex items-center gap-2">
                            {role.label}
                            {['superadmin', 'admin', 'user'].includes(role.value) && (
                              <Badge variant="secondary" className="text-xs">
                                {t('invite.badgeGlobal')}
                              </Badge>
                            )}
                            {!['superadmin', 'admin', 'user'].includes(role.value) && (
                              <Badge variant="outline" className="text-xs">
                                {t('invite.badgeCustom')}
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('invite.departmentOptional')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('invite.departmentPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit">{t('invite.send')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
