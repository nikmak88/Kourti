/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCase, useUpdateCase } from '@/hooks/useCases';
import { useCaseTypes } from '@/features/cases/api/useCaseTypes';
import { useCaseIssues } from '@/features/cases/api/useCaseIssues';
import { useCaseFields } from '@/features/cases/api/useCaseFields';
import { DynamicForm, DynamicField } from '@/shared/components/DynamicForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { PageContainer } from '@/components/layout/PageContainer';

export default function CaseEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('matters');
  const { data: caseData, isLoading, error } = useCase(id!);
  const updateCase = useUpdateCase();

  const [form, setForm] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // case type, issues & fields
  // Retired types/issues are offered only when the matter already uses them.
  const { data: allCaseTypes = [] } = useCaseTypes({ includeRetired: true });
  const [caseTypeId, setCaseTypeId] = useState<string>('');
  const { data: allCaseIssues = [] } = useCaseIssues(caseTypeId, { includeRetired: true });
  const [caseIssueId, setCaseIssueId] = useState<string>('');
  const caseTypes = allCaseTypes.filter(
    (ct) => !ct.retired || ct.id === (caseData as any)?.case_type_id
  );
  const caseIssues = allCaseIssues.filter(
    (ci) => !ci.retired || ci.id === (caseData as any)?.case_issue_id
  );
  const { data: caseFields = [] } = useCaseFields(caseTypeId);
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({});

  // Update case type and issue IDs when case data is loaded
  useEffect(() => {
    if (caseData) {
      const typeId = (caseData as any)?.case_type_id || '';
      const issueId = (caseData as any)?.case_issue_id || '';
      setCaseTypeId(typeId);
      setCaseIssueId(issueId);
    }
  }, [caseData]);

  // Bootstrap form once case is loaded
  useEffect(() => {
    if (caseData) {
      setForm({
        title: caseData.title,
        status: caseData.status,
        priority: caseData.priority,
        description: caseData.description || '',
        next_hearing_date: caseData.next_hearing_date
          ? caseData.next_hearing_date.split('T')[0]
          : '',
      });
      setDynamicValues((caseData as any).custom_fields || {});
    }
  }, [caseData]);

  if (isLoading || !form) {
    return (
      <PageContainer>
        <div className="animate-spin h-8 w-8 mr-2 border-b-2 border-primary rounded-full mx-auto my-12" />
      </PageContainer>
    );
  }

  if (error || !caseData) {
    return (
      <PageContainer>
        <div className="text-center text-destructive">{t('edit.loadFailed')}</div>
      </PageContainer>
    );
  }

  function handleChange(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateCase.mutateAsync({
        id: caseData!.id,
        ...form,
        case_type_id: caseTypeId,
        case_issue_id: caseIssueId,
        custom_fields: dynamicValues,
      } as any);
      navigate(`/matters/${caseData!.id}`);
    } catch {
      /* handled in hook */
    }
    setSubmitting(false);
  }

  return (
    <PageContainer size="narrow">
      <Breadcrumbs />
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/matters/${caseData.id}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('edit.backToMatter')}
        </Button>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
          {t('edit.title', { title: caseData.title })}
        </h1>
      </div>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>{t('edit.cardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="font-medium">{t('form.titleLabel')}</label>
              <Input
                value={form.title}
                onChange={(e) => handleChange('title', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="font-medium">{t('common:fields.status')}</label>
              <Select value={form.status} onValueChange={(val) => handleChange('status', val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{t('status.open')}</SelectItem>
                  <SelectItem value="active">{t('status.active')}</SelectItem>
                  <SelectItem value="review">{t('status.review')}</SelectItem>
                  <SelectItem value="closed">{t('status.closed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="font-medium">{t('common:fields.priority')}</label>
              <Select value={form.priority} onValueChange={(val) => handleChange('priority', val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">{t('common:priority.high')}</SelectItem>
                  <SelectItem value="medium">{t('common:priority.medium')}</SelectItem>
                  <SelectItem value="low">{t('common:priority.low')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="font-medium">{t('form.nextHearingLabel')}</label>
              <Input
                type="date"
                value={form.next_hearing_date}
                onChange={(e) => handleChange('next_hearing_date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="font-medium">{t('common:fields.description')}</label>
              <Textarea
                value={form.description}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={4}
              />
            </div>

            {/* Matter Type and Issue selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-medium">{t('form.typeLabel')}</label>
                <Select
                  value={caseTypeId}
                  onValueChange={(value) => {
                    setCaseTypeId(value);
                    // Reset case issue when type changes
                    if (value !== caseTypeId) {
                      setCaseIssueId('');
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('form.typePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {caseTypes.map((ct) => (
                      <SelectItem key={ct.id} value={ct.id}>
                        {ct.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {caseTypeId && (
                <div className="space-y-2">
                  <label className="font-medium">{t('form.issueLabel')}</label>
                  <Select
                    value={caseIssueId}
                    onValueChange={setCaseIssueId}
                    disabled={!caseTypeId || caseIssues.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('form.issuePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {caseIssues.map((issue) => (
                        <SelectItem key={issue.id} value={issue.id}>
                          {issue.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Dynamic Fields */}
            {caseTypeId && caseFields.length > 0 && (
              <DynamicForm
                fields={
                  caseFields.map((field) => ({
                    ...field,
                    required: field.is_required ?? false,
                  })) as DynamicField[]
                }
                initialValues={dynamicValues}
                onSubmit={setDynamicValues}
                hideSubmit
              />
            )}

            <div className="flex justify-end gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/matters/${caseData.id}`)}
              >
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {t('edit.saveChanges')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
