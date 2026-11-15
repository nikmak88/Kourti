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
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { UserPlus2Icon, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAllRoles } from '@/hooks/useAllRoles';
import { useInviteUser } from '@/hooks/useUserManagement';
import { toast } from 'sonner';

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

interface BulkInviteRow {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  status?: 'pending' | 'success' | 'error';
  error?: string;
}

export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [bulkData, setBulkData] = useState<BulkInviteRow[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const { data: allRoles = [] } = useAllRoles();
  const inviteUser = useInviteUser();
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

  const availableRoles = [
    ...allRoles
      .filter((role) => role.source === 'global')
      .map((role) => ({
        value: role.role || role.role_name,
        label: roleLabel(role.role || role.role_name, role.display_name || role.role_name || role.role),
      })),
    ...allRoles
      .filter((role) => role.source === 'custom')
      .map((role) => ({
        value: role.role || role.role_name,
        label: role.display_name || role.role_name || role.role,
      })),
  ];

  const handleSubmit = async (data: InviteFormData) => {
    try {
      await inviteUser.mutateAsync({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        department: data.department,
      });
      form.reset();
      setOpen(false);
      toast.success(t('invite.toast.successTitle'), {
        description: t('invite.toast.successDescription'),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('invite.toast.sendFailed');
      toast.error(t('common:toast.error'), { description: errorMessage });
    }
  };

  const handleBulkImport = (text: string) => {
    // Parse CSV-like format: email,firstName,lastName,role,department
    const lines = text.split('\n').filter((line) => line.trim());
    const rows: BulkInviteRow[] = [];

    for (const line of lines) {
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length >= 4) {
        rows.push({
          email: parts[0],
          firstName: parts[1],
          lastName: parts[2],
          role: parts[3] || 'user',
          department: parts[4] || '',
          status: 'pending',
        });
      }
    }

    setBulkData(rows);
  };

  const handleBulkInvite = async () => {
    if (bulkData.length === 0) return;

    setBulkProcessing(true);
    const results: BulkInviteRow[] = [];

    for (const row of bulkData) {
      try {
        await inviteUser.mutateAsync({
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          role: row.role,
          department: row.department,
        });
        results.push({ ...row, status: 'success' });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : t('invite.toast.rowFailed');
        results.push({
          ...row,
          status: 'error',
          error: errorMessage,
        });
      }
    }

    setBulkData(results);
    setBulkProcessing(false);

    const successCount = results.filter((r) => r.status === 'success').length;
    const errorCount = results.filter((r) => r.status === 'error').length;

    toast.success(t('invite.toast.bulkCompleteTitle'), {
      description: t('invite.toast.bulkCompleteDescription', {
        success: successCount,
        failed: errorCount,
      }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus2Icon className="h-4 w-4 mr-2" />
          {t('invite.trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('invite.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('invite.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'single' | 'bulk')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single">{t('invite.tabs.single')}</TabsTrigger>
            <TabsTrigger value="bulk">{t('invite.tabs.bulk')}</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-4">
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
                        <Input type="email" placeholder="john.doe@example.com" {...field} />
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
                      <FormLabel>{t('common:fields.role')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('invite.selectRole')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableRoles.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
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
                        <Input placeholder={t('invite.departmentPlaceholderAlt')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    {t('common:actions.cancel')}
                  </Button>
                  <Button type="submit" disabled={inviteUser.isPending}>
                    {inviteUser.isPending ? t('invite.sending') : t('invite.send')}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-4">
            <div className="space-y-2">
              <Label>{t('invite.bulk.formatLabel')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('invite.bulk.formatHelp')}
              </p>
              <Textarea
                placeholder="john.doe@example.com,John,Doe,user,Legal&#10;jane.smith@example.com,Jane,Smith,admin,Finance"
                className="min-h-[200px] font-mono text-sm"
                onChange={(e) => handleBulkImport(e.target.value)}
              />
            </div>

            {bulkData.length > 0 && (
              <div className="space-y-2">
                <Label>{t('invite.bulk.preview', { count: bulkData.length })}</Label>
                <div className="max-h-[200px] overflow-y-auto border rounded-md p-2 space-y-1">
                  {bulkData.map((row, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 rounded text-sm"
                    >
                      <div className="flex-1">
                        <span className="font-medium">
                          {row.firstName} {row.lastName}
                        </span>
                        <span className="text-muted-foreground ml-2">({row.email})</span>
                        <Badge variant="secondary" className="ml-2">
                          {roleLabel(row.role)}
                        </Badge>
                      </div>
                      {row.status === 'success' && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      {row.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button onClick={handleBulkInvite} disabled={bulkProcessing || bulkData.length === 0}>
                {bulkProcessing
                  ? t('common:status.processing')
                  : t('invite.bulk.submit', { count: bulkData.length })}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
