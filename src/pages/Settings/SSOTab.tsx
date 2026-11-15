import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, RefreshCcw, AlertCircle, CheckCircle, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  useOrganizationSsoConfigs,
  useUpsertOrganizationSsoConfig,
  useTestSsoConfig,
} from '@/hooks/useOrganizationSsoConfig';
import { useUserRoleAssignments } from '@/hooks/useUserRoleAssignments';
import { toast } from 'sonner';

const urlValidator = (value: string | undefined | null) => {
  if (!value) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

// Schemas are built inside the component so validation messages follow the UI language.
const createGoogleSchema = (t: TFunction) =>
  z
    .object({
      enabled: z.boolean(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      redirectUri: z.string().optional(),
      domainHint: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.enabled) {
        if (!data.clientId?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['clientId'],
            message: t('settings:sso.validation.googleClientIdRequired'),
          });
        }
        if (!data.redirectUri?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['redirectUri'],
            message: t('settings:sso.validation.googleRedirectUriRequired'),
          });
        }
      }

      if (data.redirectUri && !urlValidator(data.redirectUri)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['redirectUri'],
          message: t('settings:sso.validation.redirectUriInvalid'),
        });
      }
    });

const createMicrosoftSchema = (t: TFunction) =>
  z
    .object({
      enabled: z.boolean(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      redirectUri: z.string().optional(),
      domainHint: z.string().optional(),
      tenantId: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.enabled) {
        if (!data.clientId?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['clientId'],
            message: t('settings:sso.validation.microsoftClientIdRequired'),
          });
        }
        if (!data.redirectUri?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['redirectUri'],
            message: t('settings:sso.validation.microsoftRedirectUriRequired'),
          });
        }
        if (!data.tenantId?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tenantId'],
            message: t('settings:sso.validation.microsoftTenantIdRequired'),
          });
        }
      }

      if (data.redirectUri && !urlValidator(data.redirectUri)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['redirectUri'],
          message: t('settings:sso.validation.redirectUriInvalid'),
        });
      }
    });

type GoogleFormValues = z.infer<ReturnType<typeof createGoogleSchema>>;
type MicrosoftFormValues = z.infer<ReturnType<typeof createMicrosoftSchema>>;

const HelperLabel = ({ label, tooltip }: { label: string; tooltip?: string }) => {
  if (!tooltip) {
    return <span>{label}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger type="button" className="text-muted-foreground">
          <Info className="h-3.5 w-3.5" aria-hidden />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-sm">{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
};

export default function SSOTab() {
  const { data: configs, isLoading } = useOrganizationSsoConfigs();
  const updateMutation = useUpsertOrganizationSsoConfig();
  const testMutation = useTestSsoConfig();
  const [googleSecretStored, setGoogleSecretStored] = useState(false);
  const [microsoftSecretStored, setMicrosoftSecretStored] = useState(false);
  // Check if user is superadmin - MUST be before any conditional returns
  const { data: roleData } = useUserRoleAssignments();
  const isSuperAdmin = roleData?.isSuperAdmin || false;
  const { t } = useTranslation('settings');
  const googleSchema = useMemo(() => createGoogleSchema(t), [t]);
  const microsoftSchema = useMemo(() => createMicrosoftSchema(t), [t]);

  // Extract Google and Microsoft configs from array
  const googleConfig = configs?.find((c) => c.provider === 'google');
  const microsoftConfig = configs?.find((c) => c.provider === 'microsoft');

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  const googleForm = useForm<GoogleFormValues>({
    resolver: zodResolver(googleSchema),
    defaultValues: {
      enabled: false,
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      domainHint: '',
    },
  });

  const microsoftForm = useForm<MicrosoftFormValues>({
    resolver: zodResolver(microsoftSchema),
    defaultValues: {
      enabled: false,
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      domainHint: '',
      tenantId: '',
    },
  });

  useEffect(() => {
    if (googleConfig) {
      googleForm.reset({
        enabled: googleConfig.is_enabled ?? false,
        clientId: googleConfig.client_id ?? '',
        clientSecret: '',
        redirectUri: googleConfig.redirect_uri ?? '',
        domainHint: googleConfig.domain_hint ?? '',
      });
      setGoogleSecretStored(Boolean(googleConfig.has_client_secret));
    }
  }, [googleConfig, googleForm]);

  useEffect(() => {
    if (microsoftConfig) {
      microsoftForm.reset({
        enabled: microsoftConfig.is_enabled ?? false,
        clientId: microsoftConfig.client_id ?? '',
        clientSecret: '',
        redirectUri: microsoftConfig.redirect_uri ?? '',
        domainHint: microsoftConfig.domain_hint ?? '',
        tenantId: microsoftConfig.tenant_id ?? '',
      });
      setMicrosoftSecretStored(Boolean(microsoftConfig.has_client_secret));
    }
  }, [microsoftConfig, microsoftForm]);

  const googleEnabled = googleForm.watch('enabled');
  const microsoftEnabled = microsoftForm.watch('enabled');

  const googleDomainHintHelper = useMemo(() => t('sso.google.domainHintTooltip'), [t]);
  const microsoftDomainHintHelper = useMemo(() => t('sso.microsoft.domainHintTooltip'), [t]);

  // Test connection handlers
  const handleTestGoogle = async () => {
    if (!googleConfig?.id) {
      toast.error(t('common:toast.error'), {
        description: t('sso.google.saveFirst'),
      });
      return;
    }

    try {
      const result = await testMutation.mutateAsync(googleConfig.id);

      if (result.success) {
        toast.success(t('sso.toast.connectionSuccess'), {
          description: result.message,
        });
      } else {
        toast.error(t('sso.toast.configurationIssues'), {
          description: result.errors?.join(', ') || result.message,
        });
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : t('sso.google.testFailed');
      toast.error(t('sso.toast.testFailed'), {
        description: errorMessage,
      });
    }
  };

  const handleTestMicrosoft = async () => {
    if (!microsoftConfig?.id) {
      toast.error(t('common:toast.error'), {
        description: t('sso.microsoft.saveFirst'),
      });
      return;
    }

    try {
      const result = await testMutation.mutateAsync(microsoftConfig.id);

      if (result.success) {
        toast.success(t('sso.toast.connectionSuccess'), {
          description: result.message,
        });
      } else {
        toast.error(t('sso.toast.configurationIssues'), {
          description: result.errors?.join(', ') || result.message,
        });
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : t('sso.microsoft.testFailed');
      toast.error(t('sso.toast.testFailed'), {
        description: errorMessage,
      });
    }
  };

  // Show access denied if not superadmin - AFTER all hooks
  if (!isLoading && !isSuperAdmin) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {t('sso.superAdminOnly')}
        </AlertDescription>
      </Alert>
    );
  }

  const handleGoogleSubmit = async (values: GoogleFormValues) => {
    const trimmed = {
      enabled: values.enabled,
      clientId: values.clientId?.trim() || '',
      clientSecret: values.clientSecret?.trim() || '',
      redirectUri: values.redirectUri?.trim() || '',
      domainHint: values.domainHint?.trim() || undefined,
    };

    if (trimmed.enabled && !trimmed.clientSecret && !googleSecretStored) {
      googleForm.setError('clientSecret', {
        message: t('settings:sso.validation.googleClientSecretRequired'),
        type: 'manual',
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: googleConfig?.id,
        provider: 'google',
        clientId: trimmed.clientId,
        clientSecret: trimmed.clientSecret || undefined,
        redirectUri: trimmed.redirectUri,
        domainHint: trimmed.domainHint || undefined,
        isEnabled: trimmed.enabled,
      });

      if (trimmed.clientSecret) {
        setGoogleSecretStored(true);
        googleForm.setValue('clientSecret', '');
      }

      toast.success(t('sso.toast.successTitle'), {
        description: t('sso.google.saved'),
      });
    } catch (error: unknown) {
      console.error('Google SSO update error:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : t('sso.google.saveFailed');
      toast.error(t('common:toast.error'), {
        description: errorMessage,
      });
    }
  };

  const handleMicrosoftSubmit = async (values: MicrosoftFormValues) => {
    const trimmed = {
      enabled: values.enabled,
      clientId: values.clientId?.trim() || '',
      clientSecret: values.clientSecret?.trim() || '',
      redirectUri: values.redirectUri?.trim() || '',
      domainHint: values.domainHint?.trim() || undefined,
      tenantId: values.tenantId?.trim() || '',
    };

    if (trimmed.enabled && !trimmed.clientSecret && !microsoftSecretStored) {
      microsoftForm.setError('clientSecret', {
        message: t('settings:sso.validation.microsoftClientSecretRequired'),
        type: 'manual',
      });
      return;
    }

    if (trimmed.enabled && !trimmed.tenantId) {
      microsoftForm.setError('tenantId', {
        message: t('settings:sso.validation.microsoftTenantIdRequired'),
        type: 'manual',
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: microsoftConfig?.id,
        provider: 'microsoft',
        clientId: trimmed.clientId,
        clientSecret: trimmed.clientSecret || undefined,
        redirectUri: trimmed.redirectUri,
        domainHint: trimmed.domainHint || undefined,
        tenantId: trimmed.tenantId,
        isEnabled: trimmed.enabled,
      });

      if (trimmed.clientSecret) {
        setMicrosoftSecretStored(true);
        microsoftForm.setValue('clientSecret', '');
      }

      toast.success(t('sso.toast.successTitle'), {
        description: t('sso.microsoft.saved'),
      });
    } catch (error: unknown) {
      console.error('Microsoft SSO update error:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : t('sso.microsoft.saveFailed');
      toast.error(t('common:toast.error'), {
        description: errorMessage,
      });
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {t('sso.loading')}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 grid-cols-1">
            <Collapsible defaultOpen={googleEnabled}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer select-none hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Google Workspace</CardTitle>
                        <CardDescription className="mt-1">
                          {t('sso.google.description')}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={googleEnabled ? 'default' : 'outline'} className="shrink-0">
                          {googleEnabled ? t('sso.enabled') : t('sso.disabled')}
                        </Badge>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <Form {...googleForm}>
                      <form
                        onSubmit={googleForm.handleSubmit(handleGoogleSubmit)}
                        className="space-y-6"
                      >
                        <FormField
                          control={googleForm.control}
                          name="enabled"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border p-3">
                              <div className="space-y-0.5">
                                <FormLabel>{t('sso.google.enableLabel')}</FormLabel>
                                <FormDescription>
                                  {t('sso.google.enableHelp')}
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                          <FormField
                            control={googleForm.control}
                            name="clientId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  <HelperLabel
                                    label={t('sso.google.clientIdLabel')}
                                    tooltip={t('sso.google.clientIdTooltip')}
                                  />
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="XXXXXXXX.apps.googleusercontent.com"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={googleForm.control}
                            name="redirectUri"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  <HelperLabel
                                    label={t('sso.redirectUriLabel')}
                                    tooltip={t('sso.google.redirectUriTooltip')}
                                  />
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="https://app.example.com/auth/google/callback"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={googleForm.control}
                          name="clientSecret"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                <HelperLabel
                                  label={t('sso.clientSecretLabel')}
                                  tooltip={t('sso.google.clientSecretTooltip')}
                                />
                              </FormLabel>
                              <FormControl>
                                <div className="flex gap-2">
                                  <Input
                                    type="password"
                                    placeholder={
                                      googleSecretStored
                                        ? t('sso.secretStoredPlaceholder')
                                        : t('sso.secretPlaceholder')
                                    }
                                    {...field}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="whitespace-nowrap"
                                    onClick={() => {
                                      googleForm.setValue('clientSecret', '');
                                      setGoogleSecretStored(false);
                                    }}
                                  >
                                    <RefreshCcw className="mr-2 h-4 w-4" />
                                    {t('sso.rotate')}
                                  </Button>
                                </div>
                              </FormControl>
                              {googleSecretStored && (
                                <FormDescription>
                                  {t('sso.secretStoredHelp')}
                                </FormDescription>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={googleForm.control}
                          name="domainHint"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                <HelperLabel
                                  label={t('sso.domainHintLabel')}
                                  tooltip={googleDomainHintHelper}
                                />
                              </FormLabel>
                              <FormControl>
                                <Input placeholder="example.com" {...field} />
                              </FormControl>
                              <FormDescription>
                                {t('sso.google.domainHintHelp')}
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleTestGoogle}
                            disabled={testMutation.isPending || !googleConfig?.id}
                          >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            {testMutation.isPending ? t('sso.testing') : t('sso.testConnection')}
                          </Button>
                          <Button type="submit" disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? t('common:status.saving') : t('sso.saveSettings')}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Collapsible defaultOpen={microsoftEnabled}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer select-none hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Microsoft Entra ID</CardTitle>
                        <CardDescription className="mt-1">
                          {t('sso.microsoft.description')}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={microsoftEnabled ? 'default' : 'outline'}
                          className="shrink-0"
                        >
                          {microsoftEnabled ? t('sso.enabled') : t('sso.disabled')}
                        </Badge>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <Form {...microsoftForm}>
                      <form
                        onSubmit={microsoftForm.handleSubmit(handleMicrosoftSubmit)}
                        className="space-y-6"
                      >
                        <FormField
                          control={microsoftForm.control}
                          name="enabled"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border p-3">
                              <div className="space-y-0.5">
                                <FormLabel>{t('sso.microsoft.enableLabel')}</FormLabel>
                                <FormDescription>
                                  {t('sso.microsoft.enableHelp')}
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                          <FormField
                            control={microsoftForm.control}
                            name="clientId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  <HelperLabel
                                    label={t('sso.microsoft.clientIdLabel')}
                                    tooltip={t('sso.microsoft.clientIdTooltip')}
                                  />
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="00000000-0000-0000-0000-000000000000"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={microsoftForm.control}
                            name="tenantId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  <HelperLabel
                                    label={t('sso.microsoft.tenantIdLabel')}
                                    tooltip={t('sso.microsoft.tenantIdTooltip')}
                                  />
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="00000000-0000-0000-0000-000000000000"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={microsoftForm.control}
                          name="redirectUri"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                <HelperLabel
                                  label={t('sso.redirectUriLabel')}
                                  tooltip={t('sso.microsoft.redirectUriTooltip')}
                                />
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="https://app.example.com/auth/microsoft/callback"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={microsoftForm.control}
                          name="clientSecret"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                <HelperLabel
                                  label={t('sso.clientSecretLabel')}
                                  tooltip={t('sso.microsoft.clientSecretTooltip')}
                                />
                              </FormLabel>
                              <FormControl>
                                <div className="flex gap-2">
                                  <Input
                                    type="password"
                                    placeholder={
                                      microsoftSecretStored
                                        ? t('sso.secretStoredPlaceholder')
                                        : t('sso.secretPlaceholder')
                                    }
                                    {...field}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="whitespace-nowrap"
                                    onClick={() => {
                                      microsoftForm.setValue('clientSecret', '');
                                      setMicrosoftSecretStored(false);
                                    }}
                                  >
                                    <RefreshCcw className="mr-2 h-4 w-4" />
                                    {t('sso.rotate')}
                                  </Button>
                                </div>
                              </FormControl>
                              {microsoftSecretStored && (
                                <FormDescription>
                                  {t('sso.secretStoredHelp')}
                                </FormDescription>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={microsoftForm.control}
                          name="domainHint"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                <HelperLabel
                                  label={t('sso.domainHintLabel')}
                                  tooltip={microsoftDomainHintHelper}
                                />
                              </FormLabel>
                              <FormControl>
                                <Input placeholder="contoso.com" {...field} />
                              </FormControl>
                              <FormDescription>
                                {t('sso.microsoft.domainHintHelp')}
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleTestMicrosoft}
                            disabled={testMutation.isPending || !microsoftConfig?.id}
                          >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            {testMutation.isPending ? t('sso.testing') : t('sso.testConnection')}
                          </Button>
                          <Button type="submit" disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? t('common:status.saving') : t('sso.saveSettings')}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
