import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCreateClient } from '@/hooks/useClients';
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
import { ArrowLeft } from 'lucide-react';
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

interface ClientCreateProps {
  onSuccess?: (client: { id: string; name: string }) => void;
  showHeader?: boolean;
}

export default function ClientCreate({ onSuccess, showHeader = true }: ClientCreateProps) {
  const navigate = useNavigate();
  const createClient = useCreateClient();
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

  const onSubmit = async (data: ClientFormData) => {
    try {
      const clientData = {
        name: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        company: data.company,
        notes: data.notes,
        status: data.status,
      };

      const newClient = await createClient.mutateAsync(clientData);

      if (onSuccess) {
        onSuccess(newClient);
      } else {
        navigate(`/clients/${newClient.id}`);
      }
    } catch {
      // Error is handled by the mutation
    }
  };

  return (
    <PageContainer>
      <Breadcrumbs />
      {/* Header */}
      {showHeader && (
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {t('create.title')}
            </h1>
            <p className="text-muted-foreground">{t('create.description')}</p>
          </div>
        </div>
      )}

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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                  onClick={() => (showHeader ? navigate('/clients') : undefined)}
                >
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={createClient.isPending}>
                  {createClient.isPending ? t('create.submitting') : t('create.submit')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
