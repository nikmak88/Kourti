import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';
import { useAuth } from '@/hooks/useAuth';
import { AppLogo } from '@/components/ui/AppLogo';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { logError, logInfo } from '@/lib/logger';
import {
  validatePassword as sharedValidatePassword,
  PASSWORD_REQUIREMENTS,
} from '@/lib/passwordValidation';

interface ForcePasswordChangeProps {
  onPasswordChanged: () => void;
}

export default function ForcePasswordChange({ onPasswordChanged }: ForcePasswordChangeProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { t } = useTranslation('auth');

  const validatePasswordLocal = (password: string): string | null => {
    const result = sharedValidatePassword(password);
    return result.error;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      toast.error(t('password.mismatchTitle'), {
        description: t('password.mismatchDescription'),
      });
      return;
    }

    // Validate password strength
    const passwordError = validatePasswordLocal(newPassword);
    if (passwordError) {
      toast.error(t('password.tooWeak'), { description: passwordError });
      return;
    }

    setIsLoading(true);

    try {
      // Force-set password (no current password required for first-login flow)
      await invokeNodeApi('/api/v1/auth/force-change-password', {
        method: 'POST',
        body: { newPassword },
      });

      // The server clears the must-change flag and revokes every session as
      // part of the change, so the current session is no longer valid: sign
      // out locally and send the user back to log in with the new password.
      setNewPassword('');
      setConfirmPassword('');
      logInfo('Password changed successfully');

      toast.success(t('forceChange.successTitle'), {
        description: t('forceChange.successDescription'),
      });

      await signOut();
      navigate('/auth', { replace: true });
      onPasswordChanged();
    } catch (error: unknown) {
      logError('Password change failed', { error });
      const errorMessage =
        error instanceof Error ? error.message : t('common:errors.generic');
      toast.error(t('forceChange.failed'), { description: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const passwordStrength = (): { score: number; label: string; color: string } => {
    let score = 0;
    if (newPassword.length >= 12) score++;
    if (newPassword.length >= 16) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[a-z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;

    if (score <= 2) return { score, label: t('password.strength.weak'), color: 'bg-red-500' };
    if (score <= 4) return { score, label: t('password.strength.medium'), color: 'bg-yellow-500' };
    return { score, label: t('password.strength.strong'), color: 'bg-green-500' };
  };

  const strength = passwordStrength();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <AppLogo size="md" />
          </div>
          <div className="flex justify-center">
            <div className="p-3 bg-primary/10 rounded-full">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">{t('forceChange.title')}</CardTitle>
            <CardDescription className="mt-2">
              {t('forceChange.subtitle')}
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('password.new')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('password.newPlaceholder')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                  autoFocus
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Password strength indicator */}
              {newPassword && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= strength.score ? strength.color : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('password.strength.label')}{' '}
                    <span className={`font-medium ${strength.color.replace('bg-', 'text-')}`}>
                      {strength.label}
                    </span>
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('password.confirm')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('password.confirmPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  required
                  autoComplete="new-password"
                />
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">{t('password.mismatchTitle')}</p>
              )}
            </div>

            <div className="text-xs text-muted-foreground space-y-1 bg-muted/50 p-3 rounded-md">
              <p className="font-medium">{t('password.requirements')}</p>
              <ul className="list-disc list-inside space-y-0.5">
                {PASSWORD_REQUIREMENTS.map((req) => (
                  <li key={req.label} className={req.test(newPassword) ? 'text-green-600' : ''}>
                    {req.label}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading || !newPassword || !confirmPassword || newPassword !== confirmPassword
              }
            >
              {isLoading ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  {t('forceChange.updating')}
                </>
              ) : (
                t('forceChange.submit')
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
