import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useClient, useUpdateClient, useDeleteClient } from '@/hooks/useClients';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer } from '@/components/layout/PageContainer';

// Built inside the component so validation messages follow the UI language.
const makeClientSchema = (t: TFunction) =>
  z.object({
    name: z.string().min(1, t('clients:validation.nameRequired')),
    status: z.string().min(1, t('clients:validation.statusRequired')),
    email: z
      .string()
      .min(1, t('clients:validation.emailRequired'))
      .email(t('clients:validation.emailInvalid')),
    phone: z.string().optional(),
    address: z.string().optional(),
    company: z.string().optional(),
    notes: z.string().optional(),
  });

type ClientFormData = z.infer<ReturnType<typeof makeClientSchema>>;

export default function ClientEdit() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { data: client, isLoading } = useClient(clientId!);
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();
  const { t } = useTranslation('clients');
  const clientSchema = useMemo(() => makeClientSchema(t), [t]);

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      company: '',
      notes: '',
      status: 'active',
    },
  });

  useEffect(() => {
    if (client) {
      form.reset({
        name: client.name,
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        company: client.company || '',
        notes: client.notes || '',
        status: client.status,
      });
    }
  }, [client, form]);

  const onSubmit = async (data: ClientFormData) => {
    try {
      const clientData = {
        id: clientId!,
        name: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        company: data.company,
        notes: data.notes,
        status: data.status,
      };

      await updateClient.mutateAsync(clientData);
      navigate(`/clients/${clientId}`);
    } catch {
      // Error is handled by the mutation
    }
  };

  const handleDelete = async () => {
    try {
      await deleteClient.mutateAsync(clientId!);
      navigate('/clients');
    } catch {
      // Error is handled by the mutation
    }
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </PageContainer>
    );
  }

  if (!client) {
    return (
      <PageContainer>
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">{t('details.notFound')}</h1>
          <Button onClick={() => navigate('/clients')}>{t('details.backToClients')}</Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Breadcrumbs />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/clients/${clientId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {t('actions.editClient')}
            </h1>
            <p className="text-muted-foreground">
              {t('edit.description', { name: client.name })}
            </p>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              {t('actions.deleteClient')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('actions.deleteClient')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('delete.confirmDescription', { name: client.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t('common:actions.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Form */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>{t('form.cardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('form.nameLabel')} *</FormLabel>
                      <FormControl>
                        <Input placeholder={t('form.namePlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common:fields.company')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('form.companyPlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common:fields.email')} *</FormLabel>
                      <FormControl>
                        <Input placeholder={t('form.emailPlaceholder')} type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common:fields.phone')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('form.phonePlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common:fields.status')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('form.statusPlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">{t('common:status.active')}</SelectItem>
                          <SelectItem value="inactive">{t('common:status.inactive')}</SelectItem>
                          <SelectItem value="prospective">{t('status.prospective')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common:fields.address')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('form.addressPlaceholder')}
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common:fields.notes')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('form.notesPlaceholder')}
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`/clients/${clientId}`)}
                >
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={updateClient.isPending}>
                  {updateClient.isPending ? t('edit.submitting') : t('edit.submit')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
