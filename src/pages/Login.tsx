import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { AppLogo } from '@/components/ui/AppLogo';
import { useAuth } from '@/hooks/useAuth';
import { EmailOtpChallenge } from '@/components/auth/EmailOtpChallenge';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import type { MfaRequiredResponse } from '@/lib/authClient';
import { SIGNUP_ENABLED } from '@/lib/features';

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const { t } = useTranslation('auth');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [mfa, setMfa] = useState<MfaRequiredResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error, mfa: mfaChallenge, success } = await signIn(formData.email, formData.password);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (mfaChallenge) {
      setMfa(mfaChallenge);
      return;
    }
    if (success) navigate('/dashboard');
  };

  if (mfa && mfa.method === 'email_otp') {
    return (
      <EmailOtpChallenge
        mfaToken={mfa.mfaToken}
        emailHint={mfa.emailHint}
        purpose="login"
        onSuccess={() => navigate('/dashboard')}
        onCancel={() => setMfa(null)}
      />
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher persist={false} compact />
      </div>
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <AppLogo size="md" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">{t('signIn.title')}</CardTitle>
            <p className="text-muted-foreground mt-2">{t('signIn.subtitleShort')}</p>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('common:fields.email')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t('email.placeholder')}
                  className="pl-10"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('common:fields.password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('password.placeholder')}
                  className="pl-10 pr-10"
                  autoComplete="current-password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('password.hide') : t('password.show')}
                  title={showPassword ? t('password.hide') : t('password.show')}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                {t('signIn.forgotPassword')}
              </Link>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('signIn.submitting') : t('signIn.submit')}
            </Button>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </form>

          {SIGNUP_ENABLED && (
            <div className="mt-6">
              <Separator className="my-4" />
              <div className="text-center text-sm text-muted-foreground">
                {t('signIn.noAccount')}{' '}
                <Link to="/onboarding" className="text-primary hover:underline font-medium">
                  {t('signIn.signUp')}
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
