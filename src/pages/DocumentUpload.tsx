import { useCallback, useMemo, useState } from 'react';
import { logError } from '@/lib/logger';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useDropzone } from 'react-dropzone';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { UploadCloud, Sparkles, Bot, Bell, ShieldCheck, FileText } from 'lucide-react';
import { useCases } from '@/hooks/useCases';
import { useUploadDocument } from '@/hooks/useDocuments';
import { Case } from '@/types';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { formatNumber } from '@/i18n/dates';

// Built inside the component so validation messages follow the UI language.
const makeFormSchema = (t: TFunction) =>
  z.object({
    name: z.string().min(2, {
      message: t('documents:upload.validation.nameMin'),
    }),
    content: z.string().optional(),
    summary: z.string().optional(),
    metadata: z.any().optional(),
    effective_date: z.string().optional(),
    renewal_date: z.string().optional(),
    termination_date: z.string().optional(),
    value: z
      .string()
      .optional()
      .refine((val) => !val || !Number.isNaN(Number(val)), {
        message: t('documents:upload.validation.valueNumber'),
      }),
    contract_type: z.string().optional(),
    currency: z.string().optional(),
    terms: z.string().optional(),
  });

type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

export default function DocumentUpload() {
  const navigate = useNavigate();
  const { t } = useTranslation('documents');
  const formSchema = useMemo(() => makeFormSchema(t), [t]);
  const [selectedCase, setSelectedCase] = useState('');
  const [file, setFile] = useState<File | null>(null);
  // Merged state from both branches
  const [isDragging, setIsDragging] = useState(false);
  const [autoSummarize, setAutoSummarize] = useState(true);
  const [notifyTeam, setNotifyTeam] = useState(false);
  // Assuming useUploadDocument returns a mutation object like useMutation
  const uploadDocument = useUploadDocument();

  const { data: casesData = { cases: [], count: 0 } } = useCases();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const watchName = watch('name');
  const watchSummary = watch('summary');

  const readinessSteps = useMemo(
    () => [
      {
        title: t('upload.steps.file.title'),
        description: t('upload.steps.file.description'),
        completed: Boolean(file),
      },
      {
        title: t('upload.steps.context.title'),
        description: t('upload.steps.context.description'),
        completed: Boolean(watchName) || Boolean(selectedCase),
      },
      {
        title: t('upload.steps.ai.title'),
        description: t('upload.steps.ai.description'),
        completed: autoSummarize || notifyTeam,
      },
    ],
    [autoSummarize, file, notifyTeam, selectedCase, watchName, t]
  );

  const readinessProgress = useMemo(() => {
    const completed = readinessSteps.filter((step) => step.completed).length;
    return Math.round((completed / readinessSteps.length) * 100);
  }, [readinessSteps]);

  const handleGenerateSummary = useCallback(() => {
    // This logic seems a bit redundant as autoSummarize is already true by default,
    // but we'll keep it as it's part of the original logic in `main`.
    toast.success(
      autoSummarize ? t('upload.toast.summaryAlreadyEnabled') : t('upload.toast.summaryRequested'),
      {
        description: file
          ? t('upload.toast.summaryWillInclude')
          : t('upload.toast.summaryNeedsFile'),
      }
    );
    setAutoSummarize(true);
  }, [autoSummarize, file, t]);

  const onSubmit = async (values: FormValues) => {
    if (!file) {
      toast.error(t('common:toast.error'), { description: t('upload.toast.selectFile') });
      return;
    }

    try {
      const numericValue = values.value ? Number(values.value) : undefined;

      // Use the logic from `codex` as it seems more complete for the document upload
      // and integrates all the fields from `formSchema`.
      await uploadDocument.mutateAsync({
        name: values.name,
        file,
        case_id: selectedCase || undefined,
        summary: values.summary?.trim() || undefined,
        contract_type: values.contract_type?.trim() || undefined,
        effective_date: values.effective_date || undefined,
        renewal_date: values.renewal_date || undefined,
        termination_date: values.termination_date || undefined,
        value: numericValue,
        currency: values.currency?.trim() || undefined,
        terms: values.terms?.trim() || undefined,
        metadata: {
          // Merge metadata logic from both branches for completeness
          ...(values.metadata ? { custom: values.metadata } : {}),
          ...(selectedCase ? { case_id: selectedCase } : {}),
          ai_preferences: {
            // Keep AI preferences from `main`
            autoSummarize,
            notifyTeam,
          },
          original_filename: file.name,
        },
      });

      toast.success(t('common:toast.success'), { description: t('upload.toast.uploaded') });

      navigate('/documents');
    } catch (error: unknown) {
      logError('Error creating document', error);
      const errorMessage =
        error instanceof Error ? error.message : t('upload.toast.createFailed');
      toast.error(t('common:toast.error'), { description: errorMessage });
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async (acceptedFiles: File[]) => {
      if (acceptedFiles && acceptedFiles.length > 0) {
        const file = acceptedFiles[0];

        // Validate file before accepting
        try {
          const { validateFile } = await import('@/lib/fileValidation');
          const validation = validateFile(file);
          if (!validation.valid) {
            toast.error(t('upload.toast.invalidFile'), {
              description: validation.error || t('upload.toast.validationFailed'),
            });
            return;
          }
        } catch (error) {
          logError('File validation error', error);
          toast.error(t('upload.toast.validationError'), {
            description: t('upload.toast.validateFailed'),
          });
          return;
        }

        setFile(file);
        setIsDragging(false);
      }
    },
    multiple: false,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
  });

  return (
    <PageContainer>
      <PageHeader title={t('upload.title')} description={t('upload.description')} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <Card className="shadow-card">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl font-semibold">{t('upload.detailsTitle')}</CardTitle>
            <CardDescription>
              {t('upload.detailsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Readiness Checklist (from main) */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    {t('upload.readiness.label')}
                  </p>
                  <h2 className="text-lg font-semibold">
                    {readinessProgress === 100
                      ? t('upload.readiness.ready')
                      : t('upload.readiness.incomplete')}
                  </h2>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold">{readinessProgress}%</span>
                  <p className="text-xs text-muted-foreground">{t('upload.readiness.complete')}</p>
                </div>
              </div>
              <Progress value={readinessProgress} className="h-2" />
              <div className="grid gap-3 md:grid-cols-3">
                {readinessSteps.map((step) => (
                  <div
                    key={step.title}
                    className={`rounded-lg border p-3 text-sm transition ${step.completed ? 'border-primary bg-primary/5' : 'border-dashed'}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{step.title}</p>
                      <Badge
                        variant={step.completed ? 'default' : 'outline'}
                        className="text-[10px] uppercase tracking-wide"
                      >
                        {step.completed ? t('upload.readiness.done') : t('common:status.pending')}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <Alert className="border-primary/40 bg-primary/5">
              <AlertTitle className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                {t('upload.boost.title')}
              </AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                {t('upload.boost.description')}
              </AlertDescription>
            </Alert>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* File Upload (merged with isDragging class) */}
              <section className="space-y-3">
                <Label htmlFor="file">{t('upload.fields.file')}</Label>
                <div
                  {...getRootProps()}
                  className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/60 p-6 text-center transition hover:border-primary hover:bg-primary/5 ${isDragging ? 'border-primary bg-primary/10' : ''}`}
                >
                  <input {...getInputProps()} id="file" />
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UploadCloud className="h-6 w-6" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {file ? file.name : t('upload.dropzone.prompt')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('upload.dropzone.supported')}
                    </p>
                    {file && (
                      <p className="text-xs text-muted-foreground/80 mt-1">
                        {formatNumber(file.size / 1024, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}{' '}
                        KB • {file.type || t('upload.dropzone.unknownType')}
                      </p>
                    )}
                  </div>
                  {file && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                    >
                      {t('upload.dropzone.clear')}
                    </Button>
                  )}
                </div>
              </section>

              {/* Document Name and Related Case (from main) */}
              <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('upload.fields.name')}</Label>
                  <Input
                    id="name"
                    placeholder={t('upload.fields.namePlaceholder')}
                    type="text"
                    {...register('name')}
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="case">{t('upload.fields.case')}</Label>
                  <Select value={selectedCase} onValueChange={setSelectedCase}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('upload.fields.casePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {casesData.cases.map((case_: Case) => (
                        <SelectItem key={case_.id} value={case_.id}>
                          {case_.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              <Separator />

              {/* Dates & Financial Details (from codex) */}
              <section className="space-y-4">
                <p className="text-lg font-semibold">{t('upload.sections.contract')}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="effective_date">{t('upload.fields.effectiveDate')}</Label>
                    <Input type="date" id="effective_date" {...register('effective_date')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="renewal_date">{t('upload.fields.renewalDate')}</Label>
                    <Input type="date" id="renewal_date" {...register('renewal_date')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="termination_date">{t('upload.fields.terminationDate')}</Label>
                    <Input type="date" id="termination_date" {...register('termination_date')} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="value">{t('upload.fields.value')}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="value"
                        placeholder="0.00"
                        type="number"
                        step="0.01"
                        {...register('value')}
                      />
                      <Input
                        id="currency"
                        placeholder={t('upload.fields.currency')}
                        className="max-w-[120px]"
                        {...register('currency')}
                      />
                    </div>
                    {errors.value && (
                      <p className="text-xs text-destructive">{errors.value.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contract_type">{t('upload.fields.documentType')}</Label>
                    <Input
                      id="contract_type"
                      placeholder={t('upload.fields.documentTypePlaceholder')}
                      {...register('contract_type')}
                    />
                  </div>
                </div>
              </section>

              <Separator />

              {/* Summary and Key Terms */}
              <section className="space-y-4">
                <p className="text-lg font-semibold">{t('upload.sections.context')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="summary">{t('upload.fields.summary')}</Label>
                    <Textarea
                      id="summary"
                      placeholder={t('upload.fields.summaryPlaceholder')}
                      rows={4}
                      {...register('summary')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="terms">{t('upload.fields.terms')}</Label>
                    <Textarea
                      id="terms"
                      placeholder={t('upload.fields.termsPlaceholder')}
                      rows={4}
                      {...register('terms')}
                    />
                  </div>
                </div>
              </section>

              <Separator />

              {/* AI Workflow (from main) */}
              <section className="space-y-3 rounded-lg border bg-muted/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{t('upload.workflow.title')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('upload.workflow.description')}
                    </p>
                  </div>
                  <Badge
                    variant={autoSummarize ? 'default' : 'secondary'}
                    className="text-[10px] uppercase"
                  >
                    {autoSummarize ? t('upload.workflow.aiEnabled') : t('upload.workflow.manual')}
                  </Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-md border bg-background/80 p-3 text-sm">
                    <Checkbox
                      checked={autoSummarize}
                      onCheckedChange={(value) => setAutoSummarize(Boolean(value))}
                    />
                    <span>
                      <span className="flex items-center gap-2 font-medium">
                        <Bot className="h-4 w-4 text-primary" />
                        {t('upload.workflow.summarize')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('upload.workflow.summarizeHelp')}
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-md border bg-background/80 p-3 text-sm">
                    <Checkbox
                      checked={notifyTeam}
                      onCheckedChange={(value) => setNotifyTeam(Boolean(value))}
                    />
                    <span>
                      <span className="flex items-center gap-2 font-medium">
                        <Bell className="h-4 w-4 text-primary" />
                        {t('upload.workflow.notify')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('upload.workflow.notifyHelp')}
                      </span>
                    </span>
                  </label>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={handleGenerateSummary}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('upload.workflow.askAi')}
                </Button>
              </section>

              <CardFooter className="flex flex-col gap-2 p-0">
                <Button
                  type="submit"
                  className="w-full shadow-md"
                  disabled={uploadDocument.isPending || !file}
                >
                  {uploadDocument.isPending ? t('upload.submitting') : t('upload.submit')}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {t('upload.encryptionNote')}
                </p>
              </CardFooter>
            </form>
          </CardContent>
        </Card>

        {/* AI Preview and Checklist Sidebar (from main) */}
        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('upload.preview.title')}</CardTitle>
              <CardDescription>
                {t('upload.preview.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs uppercase text-muted-foreground">{t('upload.fields.name')}</p>
                <p className="font-medium text-foreground">
                  {watchName || (file ? file.name : t('untitledDocument'))}
                </p>
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs uppercase text-muted-foreground">{t('upload.preview.aiSummary')}</p>
                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  {watchSummary
                    ? watchSummary
                    : autoSummarize
                      ? t('upload.preview.summaryPending')
                      : t('upload.preview.summaryDisabled')}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase text-muted-foreground">{t('upload.preview.workflow')}</p>
                <div className="flex flex-wrap gap-2">
                  {autoSummarize && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1 text-[10px] uppercase"
                    >
                      <Bot className="h-3 w-3" /> {t('upload.preview.summaryBadge')}
                    </Badge>
                  )}
                  {notifyTeam && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1 text-[10px] uppercase"
                    >
                      <Bell className="h-3 w-3" /> {t('upload.preview.notifyBadge')}
                    </Badge>
                  )}
                  {selectedCase && (
                    <Badge
                      variant="outline"
                      className="flex items-center gap-1 text-[10px] uppercase"
                    >
                      <FileText className="h-3 w-3" /> {t('upload.preview.linkedCaseBadge')}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('upload.checklist.title')}</CardTitle>
              <CardDescription>
                {t('upload.checklist.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
                <span>{t('upload.checklist.redact')}</span>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 text-primary" />
                <span>{t('upload.checklist.dates')}</span>
              </div>
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
                <span>{t('upload.checklist.summaries')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
