import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInviteUser, useUserRole } from '@/hooks/useUserManagement';
import { useSeatUsage } from '@/hooks/useSubscription';
import { useAllRoles } from '@/hooks/useAllRoles';
import {
  useOrganizationUsers,
  useToggleUserStatus,
  useDeleteInvitation,
  useResendInvitation,
  useChangeUserRole,
} from '@/hooks/useOrganizationUsers';
import { UserPlus, Users, Shield, User, UserMinus, UserCheck, Trash2, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable, ColumnDef } from '@/components/ui/data-table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { formatDate } from '@/i18n/dates';

export default function UserManagement() {
  const { t } = useTranslation('users');
  // Role codes are API values: translate known ones, show the stored name otherwise.
  const roleLabel = (code: string, fallback?: string) =>
    t(`roles.${code}`, { defaultValue: fallback || code });
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<string>('');
  const [department, setDepartment] = useState('');

  const { data: userRole } = useUserRole();
  const { data: roles = [] } = useAllRoles();
  const { data: users = [], isLoading } = useOrganizationUsers();
  const { data: seatUsage } = useSeatUsage();
  const inviteUser = useInviteUser();
  const toggleUserStatus = useToggleUserStatus();
  const deleteInvitation = useDeleteInvitation();
  const resendInvitation = useResendInvitation();
  const changeUserRole = useChangeUserRole();

  useEffect(() => {
    if (!role && roles.length > 0) {
      // Find first assignable role (not superadmin unless you are one)
      const defaultRole = roles.find(
        (r) =>
          userRole?.role === 'superadmin' ||
          (r.role !== 'superadmin' && r.role_name !== 'superadmin')
      );
      setRole(defaultRole?.role || defaultRole?.role_name || roles[0].role || roles[0].role_name);
    }
  }, [roles, role, userRole]);

  const canInviteUsers = userRole?.role === 'superadmin' || userRole?.role === 'admin';
  const isSuperAdmin = userRole?.role === 'superadmin';
  // Seats are full when the org has a plan and no seats remain. Backend is the
  // hard gate (409); this just disables the form and explains why.
  const seatsFull = !!seatUsage && seatUsage.seats > 0 && seatUsage.available <= 0;
  const canManageRoles = userRole?.role === 'superadmin' || userRole?.role === 'admin';

  const handleInviteUser = (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !firstName || !lastName || !role) {
      return;
    }

    inviteUser.mutate({
      email,
      firstName,
      lastName,
      role: role,
      department: department || undefined,
    });

    // Reset form
    setEmail('');
    setFirstName('');
    setLastName('');
    // Reset to the default role after successful invite
    const defaultRole = roles.find(
      (r) =>
        userRole?.role === 'superadmin' || (r.role !== 'superadmin' && r.role_name !== 'superadmin')
    );
    setRole(
      defaultRole?.role || defaultRole?.role_name || roles[0]?.role || roles[0]?.role_name || ''
    );
    setDepartment('');
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'superadmin':
        return <Shield className="h-4 w-4 text-purple-600" />;
      case 'admin':
      case 'administrator':
        return <Users className="h-4 w-4 text-blue-600" />;
      case 'finance':
        return <Users className="h-4 w-4 text-green-700" />;
      case 'legal':
        return <Users className="h-4 w-4 text-red-600" />;
      default:
        return <User className="h-4 w-4 text-gray-600" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'superadmin':
        return 'bg-purple-100 text-purple-800';
      case 'admin':
      case 'administrator':
        return 'bg-blue-100 text-blue-800';
      case 'finance':
        return 'bg-green-100 text-green-800';
      case 'legal':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.charAt(0) || 'U'}${lastName?.charAt(0) || 'U'}`.toUpperCase();
  };

  const getVerificationBadge = (verificationStatus: string) => {
    switch (verificationStatus) {
      case 'verified':
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            {t('management.verification.verified')}
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            {t('management.verification.pending')}
          </Badge>
        );
      case 'unverified':
        return (
          <Badge variant="secondary" className="bg-gray-100 text-gray-800">
            {t('management.verification.unverified')}
          </Badge>
        );
      case 'expired':
        return (
          <Badge variant="secondary" className="bg-red-100 text-red-800">
            {t('management.verification.expired')}
          </Badge>
        );
      default:
        return <Badge variant="secondary">{t('management.verification.unknown')}</Badge>;
    }
  };

  const handleDisableUser = (userId: string) => {
    toggleUserStatus.mutate({ userId, disable: true });
  };

  const handleEnableUser = (userId: string) => {
    toggleUserStatus.mutate({ userId, disable: false });
  };

  const handleDeleteInvitation = (invitationId: string) => {
    deleteInvitation.mutate(invitationId);
  };

  const handleResendInvitation = (user: (typeof users)[number]) => {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
    if (window.confirm(t('management.confirm.resend', { name: fullName, email: user.email }))) {
      resendInvitation.mutate(user);
    }
  };

  const handleChangeRole = (userId: string, newRole: string) => {
    changeUserRole.mutate({ userId, newRole });
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('management.title')}
        description={t('management.description')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invite User Form */}
        {canInviteUsers && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                {t('management.invite.title')}
              </CardTitle>
              <CardDescription>
                {t('management.invite.description')}
                {seatUsage && seatUsage.seats > 0 && (
                  <span className="mt-1 block font-medium text-foreground">
                    {t('management.invite.seatsUsed', {
                      used: seatUsage.used,
                      seats: seatUsage.seats,
                    })}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInviteUser} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t('invite.firstName')}</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={t('invite.firstNamePlaceholder')}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t('invite.lastName')}</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={t('invite.lastNamePlaceholder')}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t('invite.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john.doe@example.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">{t('common:fields.role')}</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('invite.selectRole')} />
                    </SelectTrigger>
                    <SelectContent>
                      {roles
                        .filter(
                          (r) =>
                            userRole?.role === 'superadmin' ||
                            (r.role !== 'superadmin' && r.role_name !== 'superadmin')
                        )
                        .map((r) => (
                          <SelectItem key={r.role || r.role_name} value={r.role || r.role_name}>
                            {roleLabel(r.role || r.role_name, r.display_name || r.role_name || r.role)}
                            {r.source === 'custom' && t('roles.customSuffix')}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">{t('invite.departmentOptional')}</Label>
                  <Input
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder={t('management.invite.departmentPlaceholder')}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={inviteUser.isPending || seatsFull}
                >
                  {inviteUser.isPending ? t('management.invite.submitting') : t('invite.trigger')}
                </Button>
                {seatsFull && (
                  <p className="text-center text-xs text-muted-foreground">
                    {t('management.invite.seatsFull', { seats: seatUsage?.seats })}
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        {/* Organization Members */}
        <Card className={`shadow-card ${canInviteUsers ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {t('management.list.title', { count: users.length })}
            </CardTitle>
            <CardDescription>
              {t('management.list.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={
                [
                  {
                    id: 'user',
                    header: t('management.columns.user'),
                    accessorFn: (user) => `${user.first_name || ''} ${user.last_name || ''}`.trim(),
                    minWidth: '200px',
                    cell: (user) => {
                      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
                      const initials = getInitials(user.first_name || 'U', user.last_name || 'U');
                      const isDisabled = user.status === 'disabled';

                      return (
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback
                              className={`bg-primary/10 text-primary font-medium ${isDisabled ? 'opacity-50' : ''}`}
                            >
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{fullName || t('management.list.noName')}</div>
                            {isDisabled && (
                              <div className="text-xs text-muted-foreground">
                                {t('management.list.disabled')}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    },
                  },
                  {
                    id: 'email',
                    header: t('common:fields.email'),
                    accessorKey: 'email',
                    minWidth: '220px',
                  },
                  {
                    id: 'role',
                    header: t('common:fields.role'),
                    accessorKey: 'role',
                    minWidth: '180px',
                    cell: (user) => {
                      const isPendingInvitation = user.user_type === 'invitation';
                      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();

                      return canManageRoles && !isPendingInvitation ? (
                        <Select
                          value={user.role}
                          onValueChange={(newRole) => {
                            if (
                              window.confirm(
                                t('management.confirm.changeRole', {
                                  name: fullName,
                                  role: roleLabel(newRole),
                                })
                              )
                            ) {
                              handleChangeRole(user.user_id!, newRole);
                            }
                          }}
                          disabled={changeUserRole.isPending}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue>
                              <Badge className={getRoleColor(user.role)} variant="secondary">
                                <div className="flex items-center gap-1">
                                  {getRoleIcon(user.role)}
                                  {roleLabel(user.role)}
                                </div>
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {roles
                              .filter(
                                (r) =>
                                  userRole?.role === 'superadmin' ||
                                  (r.role !== 'superadmin' && r.role_name !== 'superadmin')
                              )
                              .map((r) => (
                                <SelectItem
                                  key={r.role || r.role_name}
                                  value={r.role || r.role_name}
                                >
                                  {roleLabel(
                                    r.role || r.role_name,
                                    r.display_name || r.role_name || r.role
                                  )}
                                  {r.source === 'custom' && t('roles.customSuffix')}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={getRoleColor(user.role)} variant="secondary">
                          <div className="flex items-center gap-1">
                            {getRoleIcon(user.role)}
                            {roleLabel(user.role)}
                          </div>
                        </Badge>
                      );
                    },
                  },
                  {
                    id: 'department',
                    header: t('common:fields.department'),
                    accessorKey: 'department',
                    minWidth: '150px',
                    cell: (user) => user.department || t('management.list.notSpecified'),
                  },
                  {
                    id: 'status',
                    header: t('common:fields.status'),
                    accessorKey: 'verification_status',
                    minWidth: '200px',
                    cell: (user) => {
                      const isPendingInvitation = user.user_type === 'invitation';
                      const isPending =
                        user.verification_status === 'pending' ||
                        user.verification_status === 'expired';

                      return (
                        <div className="flex items-center gap-2">
                          {getVerificationBadge(user.verification_status)}
                          {isPendingInvitation && isPending && canInviteUsers && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResendInvitation(user)}
                              disabled={resendInvitation.isPending}
                              className="h-7 text-xs"
                            >
                              <Mail className="mr-1 h-3 w-3" />
                              {resendInvitation.isPending
                                ? t('management.list.sending')
                                : t('management.list.resend')}
                            </Button>
                          )}
                        </div>
                      );
                    },
                  },
                  {
                    id: 'type',
                    header: t('common:fields.type'),
                    accessorKey: 'user_type',
                    minWidth: '120px',
                    cell: (user) => (
                      <Badge variant="outline">
                        {user.user_type === 'invitation'
                          ? t('management.list.typeInvitation')
                          : t('management.list.typeUser')}
                      </Badge>
                    ),
                  },
                  {
                    id: 'added',
                    header: t('management.columns.added'),
                    accessorKey: 'created_at',
                    minWidth: '130px',
                    cell: (user) => formatDate(user.created_at, 'PP'),
                  },
                  ...(isSuperAdmin
                    ? [
                        {
                          id: 'actions',
                          header: t('management.columns.actions'),
                          sortable: false,
                          minWidth: '80px',
                          cell: (user: (typeof users)[number]) => {
                            const isDisabled = user.status === 'disabled';
                            const isPendingInvitation = user.user_type === 'invitation';

                            return (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">{t('management.list.openMenu')}</span>
                                    <Users className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {isPendingInvitation ? (
                                    <>
                                      <DropdownMenuItem
                                        onClick={() => handleResendInvitation(user)}
                                      >
                                        <Mail className="mr-2 h-4 w-4" />
                                        {t('management.list.resendInvitation')}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => handleDeleteInvitation(user.id)}
                                        className="text-destructive"
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        {t('management.list.deleteInvitation')}
                                      </DropdownMenuItem>
                                    </>
                                  ) : (
                                    <>
                                      {isDisabled ? (
                                        <DropdownMenuItem
                                          onClick={() => handleEnableUser(user.user_id!)}
                                        >
                                          <UserCheck className="mr-2 h-4 w-4" />
                                          {t('management.list.enableUser')}
                                        </DropdownMenuItem>
                                      ) : (
                                        <DropdownMenuItem
                                          onClick={() => handleDisableUser(user.user_id!)}
                                          className="text-destructive"
                                        >
                                          <UserMinus className="mr-2 h-4 w-4" />
                                          {t('management.list.disableUser')}
                                        </DropdownMenuItem>
                                      )}
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            );
                          },
                        } as ColumnDef<(typeof users)[number]>,
                      ]
                    : []),
                ] as ColumnDef<(typeof users)[number]>[]
              }
              data={users}
              emptyMessage={t('management.list.empty')}
              getRowKey={(row) => row.id}
              rowClassName={(user) => (user.status === 'disabled' ? 'opacity-60' : '')}
            />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
