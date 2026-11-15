import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PlusCircleIcon, TrashIcon, UserIcon } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useProfile } from '@/hooks/useProfile';
import { useUserRole } from '@/hooks/useUserManagement';
import {
  useUserRoles,
  useUsersWithRoles,
  useUpdateUserRole,
  useCreateUserRole,
  useDeleteUserRole,
} from '@/hooks/useUserRoles';
import { useInviteUser } from '@/hooks/useUserManagement';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { InviteUserDialog } from '@/components/InviteUserDialog';

// Built inside the component so validation messages follow the UI language.
const createRoleSchema = (t: TFunction) =>
  z.object({
    role_name: z.string().min(3, t('settings:roles.validation.roleNameMin')),
    description: z.string().optional(),
  });

type RoleFormData = z.infer<ReturnType<typeof createRoleSchema>>;

export default function RolesTab() {
  const { data: profile, isLoading: profileLoading, error: profileError } = useProfile();
  const { data: roles = [], isLoading: rolesLoading } = useUserRoles();
  const { data: users = [], isLoading: usersLoading, error: usersError } = useUsersWithRoles();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('roles');
  const { t } = useTranslation('settings');
  const roleSchema = useMemo(() => createRoleSchema(t), [t]);
  // Role codes are API values: translate known ones, show the stored name otherwise.
  const roleLabel = (code: string) => t(`users:roles.${code}`, { defaultValue: code });
  const form = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      role_name: '',
      description: '',
    },
  });

  const createRole = useCreateUserRole();
  const deleteRole = useDeleteUserRole();
  const updateUserRole = useUpdateUserRole();
  const inviteUser = useInviteUser();

  const handleSubmit = async (data: RoleFormData) => {
    try {
      await createRole.mutateAsync(data);
      form.reset();
      setDialogOpen(false);
    } catch (error) {
      console.error('Error creating role:', error);
    }
  };

  const handleDeleteRole = (roleId: string, roleName: string) => {
    if (confirm(t('roles.confirmDelete', { name: roleName }))) {
      deleteRole.mutateAsync(roleId);
    }
  };

  const handleRoleChange = (userId: string, role: string) => {
    updateUserRole.mutateAsync({ userId, role });
  };

  const systemRoles = [
    { id: '1', name: 'superadmin', description: t('roles.system.superadmin') },
    { id: '2', name: 'admin', description: t('roles.system.admin') },
    { id: '3', name: 'user', description: t('roles.system.user') },
  ];

  const allRoleOptions = [
    { value: 'superadmin', label: t('roles.options.superadmin') },
    { value: 'admin', label: t('roles.options.admin') },
    { value: 'user', label: t('roles.options.user') },
    ...roles.map((role) => ({ value: role.role_name, label: role.role_name })),
  ];

  // Check roles from user_role_assignments
  const { data: userRoleData } = useUserRole();
  const isCurrentUserSuperAdmin = userRoleData?.role === 'superadmin';
  const isCurrentUserAdmin = userRoleData?.role === 'admin' || isCurrentUserSuperAdmin;

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return 'U';
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`;
  };

  if (profileLoading || rolesLoading || usersLoading) {
    return (
      <div className="flex items-center justify-center p-8">{t('common:status.loading')}</div>
    );
  }

  if (profileError || usersError) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {t('roles.loadError')}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {!isCurrentUserAdmin && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('roles.adminOnly')}
          </AlertDescription>
        </Alert>
      )}

      {/* Section Toggle Buttons */}
      <div className="flex gap-2 border-b">
        <Button
          variant={activeSection === 'roles' ? 'default' : 'ghost'}
          onClick={() => setActiveSection('roles')}
          className="rounded-b-none"
        >
          {t('roles.sections.roles')}
        </Button>
        <Button
          variant={activeSection === 'users' ? 'default' : 'ghost'}
          onClick={() => setActiveSection('users')}
          className="rounded-b-none"
        >
          {t('roles.sections.users')}
        </Button>
      </div>

      {/* Roles Section */}
      {activeSection === 'roles' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('roles.system.title')}</CardTitle>
              <CardDescription>{t('roles.system.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('roles.roleName')}</TableHead>
                    <TableHead>{t('common:fields.description')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {systemRoles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4" />
                          <span>{roleLabel(role.name)}</span>
                          <Badge variant="default" className="ml-2">
                            {t('roles.system.badge')}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>{role.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t('roles.custom.title')}</CardTitle>
                <CardDescription>{t('roles.custom.description')}</CardDescription>
              </div>

              {isCurrentUserSuperAdmin && (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <PlusCircleIcon className="h-4 w-4 mr-2" />
                      {t('roles.custom.add')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('roles.create.title')}</DialogTitle>
                      <DialogDescription>{t('roles.create.description')}</DialogDescription>
                    </DialogHeader>

                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                        <FormField
                          control={form.control}
                          name="role_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('roles.roleName')}</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder={t('roles.create.namePlaceholder')} />
                              </FormControl>
                              <FormDescription>{t('roles.create.nameHelp')}</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('common:fields.description')}</FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  placeholder={t('roles.create.descriptionPlaceholder')}
                                  rows={3}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <DialogFooter>
                          <Button type="submit">{t('roles.create.submit')}</Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>

            <CardContent>
              {roles.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  {t('roles.custom.empty')}
                  {isCurrentUserSuperAdmin && <p className="mt-2">{t('roles.custom.emptyHint')}</p>}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('roles.roleName')}</TableHead>
                      <TableHead>{t('common:fields.description')}</TableHead>
                      {isCurrentUserSuperAdmin && <TableHead>{t('roles.actions')}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell className="font-medium">{role.role_name}</TableCell>
                        <TableCell>{role.description}</TableCell>
                        {isCurrentUserSuperAdmin && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteRole(role.id, role.role_name)}
                            >
                              <TrashIcon className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>

            <CardFooter>
              <p className="text-xs text-muted-foreground">
                {t('roles.custom.footer')}
              </p>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Users Section */}
      {activeSection === 'users' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t('roles.team.title')}</CardTitle>
              <CardDescription>{t('roles.team.description')}</CardDescription>
            </div>

            {isCurrentUserAdmin && (
              <InviteUserDialog onInvite={(data) => inviteUser.mutateAsync(data)} />
            )}
          </CardHeader>

          <CardContent>
            {users.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                {t('roles.team.empty')}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common:fields.name')}</TableHead>
                    <TableHead>{t('common:fields.email')}</TableHead>
                    <TableHead>{t('common:fields.department')}</TableHead>
                    <TableHead>{t('roles.team.jobTitle')}</TableHead>
                    {isCurrentUserAdmin && <TableHead>{t('common:fields.role')}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage
                              src={user.avatar_url || undefined}
                              alt={`${user.first_name} ${user.last_name}`}
                            />
                            <AvatarFallback>
                              {getInitials(user.first_name || '', user.last_name || '')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">
                              {user.first_name} {user.last_name}
                            </div>
                            {user.user_id === profile?.user_id && (
                              <Badge variant="outline" className="text-xs">
                                {t('roles.team.you')}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.department || '-'}</TableCell>
                      <TableCell>{user.title || '-'}</TableCell>
                      {isCurrentUserAdmin && (
                        <TableCell>
                          {isCurrentUserSuperAdmin || user.user_id !== profile?.user_id ? (
                            <Select
                              value={user.role}
                              onValueChange={(value) => handleRoleChange(user.user_id, value)}
                              disabled={!isCurrentUserSuperAdmin && user.role === 'superadmin'}
                            >
                              <SelectTrigger className="w-[130px]">
                                <SelectValue placeholder={t('roles.team.selectRole')} />
                              </SelectTrigger>
                              <SelectContent>
                                {allRoleOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div>{roleLabel(user.role)}</div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>

          <CardFooter>
            <p className="text-xs text-muted-foreground">
              {isCurrentUserAdmin
                ? t('roles.team.footerAdmin')
                : t('roles.team.footerUser')}
            </p>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
