import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { CreditCard, Calendar, AlertTriangle, ArrowUpRight, Loader2, Users } from 'lucide-react';
import {
  useCurrentSubscription,
  useManageSubscription,
  useSeatUsage,
} from '@/hooks/useSubscription';
import { useCurrentUserPlan } from '@/hooks/useUserPlans';
import { PlanSelector } from '@/components/billing/PlanSelector';
import { AddSeatsDialog } from '@/components/billing/AddSeatsDialog';
import { PaymentHistory } from '@/components/billing/PaymentHistory';
import i18n from '@/i18n';
import { formatDate as formatLocalizedDate } from '@/i18n/dates';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Status codes come from the API; labelKey is translated at render time.
const STATUS_VARIANTS: Record<string, { labelKey: string; className: string }> = {
  active: {
    labelKey: 'billing.status.active',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  trialing: {
    labelKey: 'billing.status.trialing',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  past_due: {
    labelKey: 'billing.status.pastDue',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  paused: {
    labelKey: 'billing.status.paused',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  },
  cancelled: {
    labelKey: 'billing.status.cancelled',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
};

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return i18n.t('settings:billing.notAvailable');
  return formatLocalizedDate(dateString, 'PPP');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BillingTab() {
  const { data: subscription, isLoading: subLoading } = useCurrentSubscription();
  const { data: currentPlan, isLoading: planLoading } = useCurrentUserPlan();
  const { data: seatUsage } = useSeatUsage();
  const manageSubscription = useManageSubscription();
  const { t } = useTranslation('settings');

  const [planSelectorOpen, setPlanSelectorOpen] = useState(false);
  const [addSeatsOpen, setAddSeatsOpen] = useState(false);

  // auto-open PlanSelector when redirected with ?plan=…&cycle=… (e.g.
  // from the TrialExpiredModal). One-shot per navigation so we don't
  // fight the user closing it. We also forward the picked plan + cycle
  // into PlanSelector so the dialog opens already aligned with what the
  // user chose upstream.
  const [searchParams] = useSearchParams();
  const autoOpenPlan = searchParams.get('plan');
  const autoOpenCycle = searchParams.get('cycle');
  const initialCycle: 'monthly' | 'yearly' = autoOpenCycle === 'yearly' ? 'yearly' : 'monthly';
  const [autoOpenedFor, setAutoOpenedFor] = useState<string | null>(null);
  if (autoOpenPlan && autoOpenedFor !== autoOpenPlan && !planSelectorOpen) {
    setAutoOpenedFor(autoOpenPlan);
    setPlanSelectorOpen(true);
  }
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const isLoading = subLoading || planLoading;

  // ----- Cancel handler -----
  const handleCancelSubscription = async () => {
    if (!subscription) return;

    try {
      await manageSubscription.mutateAsync({
        action: 'cancel',
        subscription_id: subscription.id,
      });
      setCancelDialogOpen(false);
    } catch {
      // Error is handled in the mutation's onError callback
    }
  };

  // ----- Loading state -----
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">{t('billing.loading')}</span>
      </div>
    );
  }

  const hasActiveSubscription = !!subscription && subscription.status !== 'cancelled';

  return (
    <div className="space-y-6">
      {/* ---- Current Plan Card ---- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {t('billing.currentPlan.title')}
              </CardTitle>
              <CardDescription>{t('billing.currentPlan.description')}</CardDescription>
            </div>
            {hasActiveSubscription && (
              <Badge className={STATUS_VARIANTS[subscription.status]?.className}>
                {STATUS_VARIANTS[subscription.status]
                  ? t(STATUS_VARIANTS[subscription.status].labelKey)
                  : subscription.status}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasActiveSubscription && currentPlan ? (
            <>
              {/* Plan details */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('billing.currentPlan.plan')}</p>
                  <p className="text-lg font-semibold">
                    {currentPlan.plan_display_name || currentPlan.plan_name}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('common:fields.type')}</p>
                  <p className="text-lg font-semibold capitalize">
                    {t(`billing.planTypes.${currentPlan.plan_type}`, {
                      defaultValue: currentPlan.plan_type,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {t('billing.currentPlan.interval')}
                  </p>
                  <p className="text-lg font-semibold capitalize">
                    {t(`billing.intervals.${subscription.billing_interval}`, {
                      defaultValue: subscription.billing_interval,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {t('billing.currentPlan.nextBillingDate')}
                  </p>
                  <p className="text-lg font-semibold flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatDate(subscription.current_period_end)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('billing.currentPlan.seats')}</p>
                  <p className="text-lg font-semibold flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {seatUsage
                      ? t('billing.currentPlan.seatsUsed', {
                          used: seatUsage.used,
                          seats: seatUsage.seats,
                        })
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Cancel at period end notice */}
              {subscription.cancel_at_period_end && (
                <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-950">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <Trans
                      t={t}
                      i18nKey="billing.cancelNotice"
                      values={{ date: formatDate(subscription.current_period_end) }}
                      components={{ strong: <strong /> }}
                    />
                  </p>
                </div>
              )}

              {/* Features */}
              {currentPlan.features && currentPlan.features.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-2 text-sm font-medium text-muted-foreground">
                      {t('billing.currentPlan.features')}
                    </p>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {currentPlan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-sm text-foreground">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Actions */}
              <Separator />
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => setPlanSelectorOpen(true)}>
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  {t('billing.actions.changePlan')}
                </Button>
                <Button variant="outline" onClick={() => setAddSeatsOpen(true)}>
                  <Users className="mr-2 h-4 w-4" />
                  {t('billing.actions.addSeats')}
                </Button>
                {!subscription.cancel_at_period_end && (
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setCancelDialogOpen(true)}
                  >
                    {t('billing.actions.cancelSubscription')}
                  </Button>
                )}
              </div>
            </>
          ) : (
            /* ---- Free / No Subscription State ---- */
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="rounded-full bg-muted p-4">
                <CreditCard className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{t('billing.free.title')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('billing.free.description')}
                </p>
              </div>
              <Button onClick={() => setPlanSelectorOpen(true)}>
                <ArrowUpRight className="mr-2 h-4 w-4" />
                {t('billing.free.upgrade')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Payment History ---- */}
      <PaymentHistory />

      {/* ---- Plan Selector Dialog ---- */}
      <PlanSelector
        open={planSelectorOpen}
        onOpenChange={setPlanSelectorOpen}
        initialPlanId={autoOpenPlan ?? undefined}
        initialCycle={initialCycle}
      />

      {/* ---- Add Seats Dialog ---- */}
      <AddSeatsDialog open={addSeatsOpen} onOpenChange={setAddSeatsOpen} />

      {/* ---- Cancel Confirmation Dialog ---- */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('billing.cancelDialog.title')}</DialogTitle>
            <DialogDescription>
              <Trans
                t={t}
                i18nKey="billing.cancelDialog.description"
                values={{ date: formatDate(subscription?.current_period_end) }}
                components={{ strong: <strong /> }}
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={manageSubscription.isPending}
            >
              {t('billing.cancelDialog.keep')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelSubscription}
              disabled={manageSubscription.isPending}
            >
              {manageSubscription.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('billing.cancelDialog.cancelling')}
                </>
              ) : (
                t('billing.cancelDialog.confirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
