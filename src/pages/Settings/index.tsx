import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProfileTab from './ProfileTab';
import OrgTab from './OrgTab';
import RolesTab from './RolesTab';
import PermissionsTab from './PermissionsTab';
import { useUserRoleAssignments } from '@/hooks/useUserRoleAssignments';
import { cn } from '@/lib/utils';
import {
  User,
  Building2,
  CreditCard,
  ShieldCheck,
  Lock,
  KeyRound,
  Bell,
  ShieldAlert,
  FolderTree,
  FileSignature,
  ListChecks,
} from 'lucide-react';

const PrivacyTab = lazy(() => import('./PrivacyTab'));

const SSOTab = lazy(() => import('./SSOTab'));
const BillingTab = lazy(() => import('./BillingTab'));
const MatterTypesTab = lazy(() => import('./MatterTypesTab'));
const ContractTypesTab = lazy(() => import('./ContractTypesTab'));
const TaskTypesTab = lazy(() => import('./TaskTypesTab'));
const AgentMonitors = lazy(() => import('@/pages/AgentMonitors'));

const AVAILABLE_TABS = [
  'profile',
  'organization',
  'billing',
  'roles',
  'matter-types',
  'contract-types',
  'task-types',
  'permissions',
  'sso',
  'monitoring',
  'privacy',
] as const;

type TabValue = (typeof AVAILABLE_TABS)[number];

function isValidTab(value: string | null): value is TabValue {
  return value !== null && (AVAILABLE_TABS as readonly string[]).includes(value);
}

interface NavItem {
  value: TabValue;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}

export default function Settings() {
  const { t } = useTranslation('settings');
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const initialTab = isValidTab(urlTab) ? urlTab : 'profile';
  const [tab, setTab] = useState<TabValue>(initialTab);

  const { data: roleData } = useUserRoleAssignments();
  const isSuperAdmin = roleData?.isSuperAdmin || false;
  const isAdmin = roleData?.isAdmin || false;

  useEffect(() => {
    const nextUrlTab = searchParams.get('tab');
    const nextTab = isValidTab(nextUrlTab) ? nextUrlTab : 'profile';
    if (nextTab !== tab) {
      setTab(nextTab);
    }
  }, [searchParams, tab]);

  const handleTabChange = (value: TabValue) => {
    setTab(value);
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    if (value === 'profile') {
      nextSearchParams.delete('tab');
    } else {
      nextSearchParams.set('tab', value);
    }
    setSearchParams(nextSearchParams, { replace: true });
  };

  const navItems: NavItem[] = useMemo(
    () => [
      {
        value: 'profile',
        label: t('nav.profile.label'),
        description: t('nav.profile.description'),
        icon: User,
      },
      {
        value: 'organization',
        label: t('nav.organization.label'),
        description: t('nav.organization.description'),
        icon: Building2,
      },
      {
        value: 'billing',
        label: t('nav.billing.label'),
        description: t('nav.billing.description'),
        icon: CreditCard,
      },
      {
        value: 'roles',
        label: t('nav.roles.label'),
        description: t('nav.roles.description'),
        icon: ShieldCheck,
      },
      {
        value: 'matter-types',
        label: t('nav.matterTypes.label'),
        description: t('nav.matterTypes.description'),
        icon: FolderTree,
        adminOnly: true,
      },
      {
        value: 'contract-types',
        label: t('nav.contractTypes.label'),
        description: t('nav.contractTypes.description'),
        icon: FileSignature,
        adminOnly: true,
      },
      {
        value: 'task-types',
        label: t('nav.taskTypes.label'),
        description: t('nav.taskTypes.description'),
        icon: ListChecks,
      },
      {
        value: 'permissions',
        label: t('nav.permissions.label'),
        description: t('nav.permissions.description'),
        icon: Lock,
        adminOnly: true,
      },
      {
        value: 'sso',
        label: t('nav.sso.label'),
        description: t('nav.sso.description'),
        icon: KeyRound,
        superAdminOnly: true,
      },
      {
        value: 'monitoring',
        label: t('nav.monitoring.label'),
        description: t('nav.monitoring.description'),
        icon: Bell,
      },
      {
        value: 'privacy',
        label: t('nav.privacy.label'),
        description: t('nav.privacy.description'),
        icon: ShieldAlert,
      },
    ],
    [t]
  );

  const filteredNavItems = navItems.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });

  const activeItem = navItems.find((item) => item.value === tab);

  return (
    <div className="flex h-full min-h-0">
      {/* Vertical side nav */}
      <nav className="hidden md:flex w-[240px] flex-col shrink-0 border-r border-border/40 py-4 pr-0">
        <div className="px-4 mb-4">
          <h1 className="text-lg font-semibold text-foreground">{t('nav.title')}</h1>
        </div>
        <div className="flex-1 space-y-0.5 px-2">
          {filteredNavItems.map((item) => {
            const active = tab === item.value;
            return (
              <button
                key={item.value}
                onClick={() => handleTabChange(item.value)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                  active
                    ? 'bg-primary/8 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <item.icon
                  className={cn(
                    'h-4 w-4 flex-shrink-0',
                    active ? 'text-primary' : 'text-muted-foreground/60'
                  )}
                />
                <div className="min-w-0">
                  <div className="text-[13px] leading-tight">{item.label}</div>
                  <div
                    className={cn(
                      'text-[11px] leading-tight mt-0.5',
                      active ? 'text-primary/60' : 'text-muted-foreground/50'
                    )}
                  >
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile tab selector */}
      <div className="md:hidden w-full">
        <div className="border-b border-border/40 px-4 py-3">
          <h1 className="text-lg font-semibold text-foreground mb-3">{t('nav.title')}</h1>
          <select
            value={tab}
            onChange={(e) => handleTabChange(e.target.value as TabValue)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px]"
          >
            {filteredNavItems.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="p-4">
          <SettingsContent tab={tab} activeItem={activeItem} />
        </div>
      </div>

      {/* Main content area - desktop */}
      <div className="hidden md:flex flex-col flex-1 min-w-0 overflow-auto">
        <div className="px-6 py-4 border-b border-border/40">
          <h2 className="text-base font-semibold text-foreground">{activeItem?.label}</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">{activeItem?.description}</p>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <SettingsContent tab={tab} activeItem={activeItem} />
        </div>
      </div>
    </div>
  );
}

function SettingsContent({ tab }: { tab: TabValue; activeItem?: NavItem }) {
  const { t } = useTranslation();
  const fallback = (
    <div className="py-6 text-sm text-muted-foreground">{t('common:status.loading')}</div>
  );

  switch (tab) {
    case 'profile':
      return <ProfileTab />;
    case 'organization':
      return <OrgTab />;
    case 'billing':
      return (
        <Suspense fallback={fallback}>
          <BillingTab />
        </Suspense>
      );
    case 'roles':
      return <RolesTab />;
    case 'matter-types':
      return (
        <Suspense fallback={fallback}>
          <MatterTypesTab />
        </Suspense>
      );
    case 'contract-types':
      return (
        <Suspense fallback={fallback}>
          <ContractTypesTab />
        </Suspense>
      );
    case 'task-types':
      return (
        <Suspense fallback={fallback}>
          <TaskTypesTab />
        </Suspense>
      );
    case 'permissions':
      return <PermissionsTab />;
    case 'sso':
      return (
        <Suspense fallback={fallback}>
          <SSOTab />
        </Suspense>
      );
    case 'monitoring':
      return (
        <Suspense fallback={fallback}>
          <AgentMonitors />
        </Suspense>
      );
    case 'privacy':
      return (
        <Suspense fallback={fallback}>
          <PrivacyTab />
        </Suspense>
      );
    default:
      return null;
  }
}
