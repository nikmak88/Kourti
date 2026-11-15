import { useMemo } from 'react';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useProfile, useUpdateProfile, useChangePassword } from '@/hooks/useProfile';
import { TwoFactorEmailCard } from '@/components/auth/TwoFactorEmailCard';
import { logError } from '@/lib/logger';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

// Schemas are built inside the component so validation messages follow the UI language.
const createProfileSchema = (t: TFunction) =>
  z.object({
    first_name: z.string().min(2, t('settings:profile.validation.firstNameMin')),
    last_name: z.string().min(2, t('settings:profile.validation.lastNameMin')),
    email: z.string().email(t('settings:profile.validation.emailInvalid')),
    phone: z.string().optional(),
    department: z.string().optional(),
    title: z.string().optional(),
  });

const createPasswordSchema = (t: TFunction) =>
  z
    .object({
      currentPassword: z.string().min(6, t('settings:profile.validation.currentPasswordRequired')),
      newPassword: z.string().min(6, t('settings:profile.validation.newPasswordMin')),
      confirmPassword: z.string().min(6, t('settings:profile.validation.confirmPasswordRequired')),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('settings:profile.validation.passwordsMismatch'),
      path: ['confirmPassword'],
    });

type ProfileData = z.infer<ReturnType<typeof createProfileSchema>>;
type PasswordChangeData = z.infer<ReturnType<typeof createPasswordSchema>>;

export default function ProfileTab() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const { t } = useTranslation('settings');
  const profileSchema = useMemo(() => createProfileSchema(t), [t]);
  const passwordSchema = useMemo(() => createPasswordSchema(t), [t]);

  const profileForm = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      email: profile?.email || '',
      phone: profile?.phone || '',
      department: profile?.department || '',
      title: profile?.title || '',
    },
  });

  const passwordForm = useForm<PasswordChangeData>({
    resolver: zodResolver(passwordSchema),
  });

  const onProfileSubmit = async (data: ProfileData) => {
    try {
      // email is read-only — strip it before sending to backend
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { email: _email, ...updatePayload } = data;
      await updateProfile.mutateAsync(updatePayload);
    } catch (error) {
      logError('Failed to update profile', error);
    }
  };

  const onPasswordSubmit = async (data: PasswordChangeData) => {
    try {
      await changePassword.mutateAsync(data);
      passwordForm.reset();
    } catch (error) {
      logError('Failed to change password', error);
    }
  };

  if (profileLoading) {
    return <div>{t('common:status.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.personal.title')}</CardTitle>
          <CardDescription>{t('profile.personal.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={profileForm.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profile.personal.firstName')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profile.personal.lastName')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={profileForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common:fields.email')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        readOnly
                        disabled
                        className="cursor-not-allowed opacity-60"
                        title={t('profile.personal.emailReadOnlyTitle')}
                      />
                    </FormControl>
                    <p className="text-[12px] text-muted-foreground">
                      {t('profile.personal.emailReadOnlyHelp')}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common:fields.phone')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={profileForm.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common:fields.department')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profile.personal.jobTitle')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? t('profile.personal.updating') : t('profile.personal.submit')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('common:language.label')}</CardTitle>
          <CardDescription>{t('common:language.help')}</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageSwitcher />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.password.title')}</CardTitle>
          <CardDescription>{t('profile.password.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('profile.password.current')}</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('profile.password.new')}</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('profile.password.confirm')}</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? t('profile.password.changing') : t('profile.password.submit')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <TwoFactorEmailCard />
    </div>
  );
}
