import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { confirmResetPassword } from '@/lib/authClient';
import { AppLogo } from '@/components/ui/AppLogo';
import { validatePassword, PASSWORD_REQUIREMENTS } from '@/lib/passwordValidation';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation('auth');

  useEffect(() => {
    let mounted = true;

    const verifyToken = () => {
      try {
        // Check URL for reset token (custom JWT system uses query params or hash)
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));

        const token =
          params.get('token') || hashParams.get('token') || hashParams.get('access_token');
        const type = params.get('type') || hashParams.get('type');

        if (token && (type === 'recovery' || type === 'reset' || !type)) {
          // Clear the hash/params from URL
          window.history.replaceState(null, '', window.location.pathname);

          if (mounted) {
            setResetToken(token);
            setTokenValid(true);
            setVerifying(false);
          }
          return;
        }

        // If no token found, the link is invalid
        if (mounted) {
          setTokenValid(false);
          toast.error(t('resetPassword.invalidTitle'), {
            description: t('resetPassword.invalidDescription'),
          });
          setTimeout(() => navigate('/forgot-password'), 3000);
        }
      } catch {
        if (mounted) {
          setTokenValid(false);
          toast.error(t('common:toast.error'), {
            description: t('resetPassword.verifyFailed'),
          });
          setTimeout(() => navigate('/forgot-password'), 3000);
        }
      } finally {
        if (mounted) {
          setVerifying(false);
        }
      }
    };

    verifyToken();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error(t('password.mismatchTitle'), {
        description: t('password.mismatchDescription'),
      });
      return;
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      toast.error(t('password.tooWeak'), { description: passwordCheck.error! });
      return;
    }

    setLoading(true);

    try {
      const { error } = await confirmResetPassword(resetToken, password);

      if (error) throw new Error(error.message);

      // Clear password from state
      setPassword('');
      setConfirmPassword('');

      toast.success(t('resetPassword.successTitle'), {
        description: t('resetPassword.successDescription'),
      });

      // Redirect to login after successful password reset
      navigate('/login');
    } catch (error: unknown) {
      setPassword('');
      setConfirmPassword('');
      const errorMessage =
        error instanceof Error ? error.message : t('resetPassword.failed');
      toast.error(t('common:toast.error'), { description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-card">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-muted-foreground">{t('resetPassword.verifying')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-card border-destructive/20">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="rounded-full bg-destructive/10 p-4">
                <Lock className="h-10 w-10 text-destructive" />
              </div>
              <div className="space-y-3">
                <h3 className="font-semibold text-xl">{t('resetPassword.invalidTitle')}</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>{t('resetPassword.invalidDescription')}</p>
                  <p className="text-xs">
                    <strong>{t('link.commonReasons')}</strong>
                  </p>
                  <ul className="text-xs text-left list-disc list-inside space-y-1 bg-muted/50 p-3 rounded-md">
                    <li>{t('resetPassword.reasonUsed')}</li>
                    <li>{t('resetPassword.reasonExpired')}</li>
                    <li>{t('link.clickedTwice')}</li>
                  </ul>
                  <p className="text-xs">{t('resetPassword.requestNewHint')}</p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate('/forgot-password')}
                className="w-full"
              >
                {t('resetPassword.requestNew')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <AppLogo size="md" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">{t('resetPassword.title')}</CardTitle>
            <p className="text-muted-foreground mt-2">{t('resetPassword.subtitle')}</p>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{t('password.new')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('password.newPlaceholder')}
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={12}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 mt-2">
                <ul className="list-disc list-inside space-y-0.5">
                  {PASSWORD_REQUIREMENTS.map((req) => (
                    <li key={req.label} className={req.test(password) ? 'text-green-600' : ''}>
                      {req.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('resetPassword.confirmLabel')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder={t('password.confirmPlaceholder')}
                  className="pl-10 pr-10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={12}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {password && confirmPassword && password === confirmPassword && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>{t('password.match')}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !password || !confirmPassword || password !== confirmPassword}
            >
              {loading ? t('resetPassword.submitting') : t('resetPassword.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
