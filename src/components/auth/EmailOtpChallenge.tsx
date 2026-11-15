import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { AppLogo } from '@/components/ui/AppLogo';
import { resendEmailOtp } from '@/lib/authClient';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  mfaToken: string;
  emailHint?: string;
  purpose: 'login' | 'signup';
  onSuccess: () => void;
  onCancel?: () => void;
}

const RESEND_COOLDOWN = 30;

export function EmailOtpChallenge({ mfaToken, emailHint, purpose, onSuccess, onCancel }: Props) {
  const { verifyEmailOtp } = useAuth();
  const { t } = useTranslation('auth');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const handleVerify = async (value: string) => {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const { error } = await verifyEmailOtp(mfaToken, value);
    setSubmitting(false);
    if (error) {
      setError(error.message);
      setCode('');
      return;
    }
    onSuccess();
  };

  const handleResend = async () => {
    setError(null);
    setInfo(null);
    const { error } = await resendEmailOtp(mfaToken);
    if (error) {
      setError(error.message);
      return;
    }
    setInfo(t('otp.newCodeSent'));
    setResendIn(RESEND_COOLDOWN);
  };

  const title = purpose === 'signup' ? t('otp.verifyEmailTitle') : t('otp.twoFactorTitle');
  const target = emailHint ?? t('otp.yourEmail');
  const description =
    purpose === 'signup'
      ? t('otp.signupDescription', { target })
      : t('otp.loginDescription', { target });

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <AppLogo size="md" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">{title}</CardTitle>
            <p className="text-muted-foreground mt-2 text-sm">{description}</p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(value) => {
                setCode(value);
                if (value.length === 6 && !submitting) {
                  void handleVerify(value);
                }
              }}
              disabled={submitting}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {error && <p className="text-center text-sm text-destructive">{error}</p>}
          {info && <p className="text-center text-sm text-muted-foreground">{info}</p>}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="w-full"
              disabled={code.length !== 6 || submitting}
              onClick={() => void handleVerify(code)}
            >
              {submitting ? t('otp.verifying') : t('otp.verify')}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={resendIn > 0}
                className="text-primary hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {resendIn > 0 ? t('otp.resendIn', { seconds: resendIn }) : t('otp.resend')}
              </button>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="text-muted-foreground hover:underline"
                >
                  {t('common:actions.cancel')}
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
