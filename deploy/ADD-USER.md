# Adding a user directly in the database

Normally a firm administrator adds colleagues from **User Management → Invite**
(they receive an email link and choose their own password). Use the methods
below only when that is not possible — no working email yet, a locked-out
administrator, or bulk creation by the operator.

Every account created here:

- belongs to the firm (organization) and uses one licensed seat;
- is already email-verified;
- has **email 2FA on** (a 6-digit code is emailed at each sign-in) unless you turn it off;
- must **change the temporary password** at first sign-in.

## Option A — `kourtictl` (recommended)

```sh
sudo kourtictl orgs                      # firm id, members, seats
sudo kourtictl create-user \
  --email jean.martin@dupont.be --first Jean --last Martin --role user
```

Output:

```
User created.
  Sign in at:          https://10.0.0.20
  Email:               jean.martin@dupont.be
  Temporary password:  q7Rk2mWfXb9TzLp4HcNs
  Role:                user
  Email 2FA:           true
  Must change password on first sign-in: true
```

| Option | Meaning |
|---|---|
| `--role admin` | Firm administrator: manages users, invites, settings. `user` = regular staff (default). `superadmin` = admin who can also create other superadmins. Custom roles created in **Settings → Roles** can be used by name. |
| `--password <pw>` | Set the password yourself (min. 12 characters) instead of a generated one |
| `--no-email-otp` | No email 2FA for this user (only if SMTP is unavailable) |
| `--no-force-change` | Do not force a password change at first sign-in |
| `--org <id>` | Needed only when the install holds more than one firm |
| `--platform-admin` | Also grant the platform super-admin panel (`/thanos`) — for the operator account only |

Related commands:

```sh
sudo kourtictl users                                   # list users, 2FA status, last sign-in
sudo kourtictl reset-password --email jean.martin@dupont.be
sudo kourtictl email-otp --email jean.martin@dupont.be off   # e.g. mailbox unavailable
sudo kourtictl disable-user --email jean.martin@dupont.be   # block sign-in (keeps the seat)
sudo kourtictl delete-user --email jean.martin@dupont.be    # permanent; frees the seat
sudo kourtictl set-seats 15                            # if "seats full" blocks new users
```

Note: the app enforces the seat limit on invitations only. `create-user` always
adds the user, even past the limit, and the user still counts as a seat — so
afterwards the firm may be unable to invite until you raise `set-seats`. Keep
seats in line with what the firm pays for.

## Option B — plain SQL (when `kourtictl` is not available)

1. Open a SQL shell:

   ```sh
   cd /opt/kourti
   sudo docker compose --project-directory /opt/kourti -f src/deploy/docker-compose.yml \
     exec postgres psql -U kourti -d kourti
   ```

2. Find the firm id:

   ```sql
   select id, name from public.organizations;
   ```

3. Create the user — replace the four values in the first lines. The password
   is hashed with bcrypt by Postgres' `pgcrypto` extension, which the app accepts.

   ```sql
   \set email     'jean.martin@dupont.be'
   \set firstname 'Jean'
   \set lastname  'Martin'
   \set role      'user'                                  -- user | admin | superadmin
   \set org       '11111111-2222-3333-4444-555555555555'  -- from step 2
   \set password  'Temporary-Pass-2026'                   -- at least 12 characters

   begin;
   with u as (
     insert into public.auth_users
       (email, encrypted_password, is_active, email_confirmed_at, email_otp_enabled)
     values (lower(:'email'), crypt(:'password', gen_salt('bf', 12)), true, now(), true)
     returning id
   ), p as (
     insert into public.profiles
       (user_id, email, first_name, last_name, role, organization_id, must_change_password, status)
     select id, lower(:'email'), :'firstname', :'lastname', :'role', :'org'::uuid, true, 'active' from u
     returning user_id
   )
   insert into public.user_role_assignments (user_id, role_name, organization_id, assigned_by)
   select user_id, :'role', :'org'::uuid, user_id from p;
   commit;
   ```

4. Check it:

   ```sql
   select p.email, p.role, au.email_otp_enabled, au.is_active
     from public.profiles p join public.auth_users au on au.id = p.user_id
    where p.email = lower(:'email');
   ```

What the three tables hold:

| Table | Purpose |
|---|---|
| `auth_users` | Login: email, bcrypt password hash, active flag, 2FA settings |
| `profiles` | Person in the firm: name, firm (`organization_id`), display role, forced password change |
| `user_role_assignments` | Permissions: the role the app checks for access (one row per role) |

Platform super-admin (operator only) is one more row:
`insert into public.user_role_assignments (user_id, role_name, organization_id) values ('<user id>', 'platform_admin', '<org id>');`

## Clients (portal users)

Clients are **not** created here. From a client or matter in the app, use
**Client portal → Invite**; the client receives an email and sets up their
portal access at `https://<host>/portal`.

## Deleting a user

Prefer `sudo kourtictl delete-user --email …` (see
[USER-GUIDE.md §3.1](../USER-GUIDE.md#31-removing-a-user)): it runs the
application's GDPR erasure routine, which also anonymises the email log and
audit trail. The plain-SQL equivalent of the essential part, for when
`kourtictl` is unavailable — take a backup first, it cannot be undone:

```sql
\set email 'jean.martin@dupont.be'
begin;
-- refuse to remove the firm owner
select email, is_organization_creator from profiles where lower(email) = lower(:'email');
with u as (select id from auth_users where lower(email) = lower(:'email'))
delete from user_role_assignments where user_id in (select id from u);
with u as (select id from auth_users where lower(email) = lower(:'email'))
delete from email_otp_codes where user_id in (select id from u);
with u as (select id from auth_users where lower(email) = lower(:'email'))
delete from ai_conversation_messages where conversation_id in
  (select id from ai_conversations where user_id in (select id from u));
with u as (select id from auth_users where lower(email) = lower(:'email'))
delete from ai_conversations where user_id in (select id from u);
delete from profiles   where lower(email) = lower(:'email');
delete from auth_users where lower(email) = lower(:'email');
delete from invitations where lower(email) = lower(:'email') and status = 'pending';
commit;   -- or: rollback;  if the owner check above showed 't'
```

Firm data (cases, documents, time entries) is not touched; records the user
created or was assigned keep a dangling user id and show no author/assignee.

