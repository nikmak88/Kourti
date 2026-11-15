import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { TFunction } from 'i18next';
import { useCreateCase, type CreateCaseData } from '@/hooks/useCases';
import { useClients } from '@/hooks/useClients';
import { useCaseTypes } from '@/features/cases/api/useCaseTypes';
import { useCaseIssues } from '@/features/cases/api/useCaseIssues';
import { useNotificationTriggers } from '@/hooks/useNotificationTriggers';
import { useCaseFields } from '@/features/cases/api/useCaseFields';
import { CaseTypeSelector } from '@/features/cases/components/CaseTypeSelector';
import { CaseType } from '@/features/cases/types';
import { DynamicForm, DynamicField } from '@/shared/components/DynamicForm';
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
import { ArrowLeft, Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTranslation } from 'react-i18next';
import { formatDate, dateLocale } from '@/i18n/dates';
import { cn } from '@/lib/utils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer } from '@/components/layout/PageContainer';

// Built inside the component so validation messages follow the UI language.
const makeCaseSchema = (t: TFunction) =>
  z.object({
    title: z.string().min(1, t('validation.titleRequired')),
    status: z.string().min(1, t('validation.statusRequired')),
    priority: z.string().min(1, t('validation.priorityRequired')),
    description: z.string().optional(),
    case_number: z.string().optional(),
    client_id: z.string().optional(),
    court: z.string().optional(),
    next_hearing_date: z.date().optional(),
    case_type_id: z.string().optional(),
    case_issue_id: z.string().optional(),
  });

type CaseFormData = z.infer<ReturnType<typeof makeCaseSchema>>;

export default function CaseCreate() {
  const navigate = useNavigate();
  const { t } = useTranslation('matters');
  const caseSchema = useMemo(() => makeCaseSchema(t), [t]);
  const { data } = useClients();
  const clients = data?.items ?? [];
  const createCase = useCreateCase();
  const { createCaseNotification } = useNotificationTriggers();

  // hooks for case types, issues & fields
  useCaseTypes(); // Load case types for selector
  const [caseTypeId, setCaseTypeId] = useState<string>('');
  const { data: caseIssues = [], isLoading: isLoadingCaseIssues } = useCaseIssues(caseTypeId);
  const [caseIssueId, setCaseIssueId] = useState<string>('');
  const { data: caseFields = [] } = useCaseFields(caseTypeId);
  const [dynamicValues, setDynamicValues] = useState<Record<string, unknown>>({});

  // Remember last used matter type
  const lastMatterType =
    typeof window !== 'undefined' ? localStorage.getItem('last_matter_type') : '';

  const form = useForm<CaseFormData>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      title: '',
      description: '',
      status: 'open',
      priority: 'medium',
      client_id: '',
      court: '',
      case_type_id: lastMatterType || '',
      case_issue_id: '',
    },
  });

  // Save matter type to localStorage when changed
  useEffect(() => {
    if (caseTypeId && typeof window !== 'undefined') {
      localStorage.setItem('last_matter_type', caseTypeId);
    }
  }, [caseTypeId]);

  // Reset issue when type changes
  useEffect(() => {
    setCaseIssueId('');
    form.setValue('case_issue_id', '');
  }, [caseTypeId, form]);

  const onSubmit = async (data: CaseFormData) => {
    try {
      // Validate required fields
      if (!caseTypeId) {
        form.setError('case_type_id', { message: t('validation.typeRequired') });
        return;
      }

      const caseData = {
        title: data.title,
        description: data.description || '',
        case_number: data.case_number,
        status: data.status || 'open',
        priority: data.priority || 'medium',
        client_id: data.client_id || null,
        court: data.court,
        next_hearing_date: data.next_hearing_date?.toISOString() || null,
        case_type_id: caseTypeId,
        case_issue_id: caseIssueId || null,
        custom_fields: dynamicValues,
      } as CreateCaseData;

      const newCase = await createCase.mutateAsync(caseData);

      // Create notification for matter creation
      await createCaseNotification(newCase, 'created');

      navigate(`/matters/${newCase.id}`);
    } catch {
      /* error handled by mutation */
    }
  };

  return (
    <PageContainer>
      <Breadcrumbs />
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/matters')}>
          {' '}
          <ArrowLeft className="h-4 w-4" />{' '}
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            {t('create.title')}
          </h1>
          <p className="text-muted-foreground">{t('create.description')}</p>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>{t('create.detailsCard')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Static fields */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('form.titleLabel')} *</FormLabel>
                      <FormControl>
                        <Input placeholder={t('form.titlePlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="case_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('form.numberLabel')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('form.numberPlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common:entities.client')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('form.clientPlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
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
                          <SelectItem value="open">{t('status.open')}</SelectItem>
                          <SelectItem value="active">{t('status.active')}</SelectItem>
                          <SelectItem value="review">{t('status.review')}</SelectItem>
                          <SelectItem value="closed">{t('status.closed')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common:fields.priority')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('form.priorityPlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">{t('common:priority.low')}</SelectItem>
                          <SelectItem value="medium">{t('common:priority.medium')}</SelectItem>
                          <SelectItem value="high">{t('common:priority.high')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common:fields.description')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('form.descriptionPlaceholder')}
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Matter Type and Issue selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="case_type_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        {t('form.typeLabel')} <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <CaseTypeSelector
                          value={caseTypeId}
                          onValueChange={(value) => {
                            setCaseTypeId(value);
                            field.onChange(value);

                            // Reset case issue when case type changes
                            setCaseIssueId('');
                            form.setValue('case_issue_id', '');
                          }}
                          required
                          renderItem={(caseType: CaseType) => (
                            <>
                              {caseType.name}
                              {caseType.description && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  {caseType.description}
                                </span>
                              )}
                            </>
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {caseTypeId && (
                  <FormField
                    control={form.control}
                    name="case_issue_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('form.issueLabel')}
                          {caseIssues.length > 0 ? ' *' : ''}
                        </FormLabel>
                        <FormControl>
                          <Select
                            value={caseIssueId}
                            onValueChange={(value) => {
                              setCaseIssueId(value);
                              field.onChange(value);
                            }}
                            disabled={!caseTypeId || isLoadingCaseIssues}
                            // Only block submit when there is something to choose.
                            required={caseIssues.length > 0}
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  isLoadingCaseIssues ? t('form.issuesLoading') : t('form.issuePlaceholder')
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {isLoadingCaseIssues ? (
                                <SelectItem value="loading" disabled>
                                  {t('form.issuesLoading')}
                                </SelectItem>
                              ) : caseIssues.length > 0 ? (
                                caseIssues.map((issue) => (
                                  <SelectItem key={issue.id} value={issue.id}>
                                    {issue.name}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="none" disabled>
                                  {t('form.noIssues')}
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Dynamic Custom Fields */}
              {caseTypeId && caseFields.length > 0 && (
                <DynamicForm
                  fields={
                    caseFields.map((field) => ({
                      ...field,
                      required: field.is_required ?? false,
                    })) as DynamicField[]
                  }
                  initialValues={{}}
                  onSubmit={setDynamicValues}
                  hideSubmit
                />
              )}

              {/* Optional Fields Section */}
              <div className="border-t pt-6 mt-6">
                <h3 className="text-lg font-medium mb-4 text-foreground">{t('create.optionalSection')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="court"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('form.courtLabel')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('form.courtPlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="next_hearing_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t('form.nextHearingLabel')}</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  'w-full pl-3 text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                {' '}
                                {field.value ? (
                                  formatDate(field.value, 'PPP')
                                ) : (
                                  <span>{t('form.pickDate')}</span>
                                )}{' '}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />{' '}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(d) => d < new Date()}
                              initialFocus
                              locale={dateLocale()}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => navigate('/matters')}>
                  {t('common:actions.cancel')}
                </Button>
                <Button type="submit" disabled={createCase.isPending}>
                  {createCase.isPending ? t('create.submitting') : t('create.submit')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
