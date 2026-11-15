/**
 * Schema completion for self-hosted installs.
 *
 * Upstream Kourti ran on Supabase and its full schema lived in
 * supabase/migrations, which were deleted from the repository on 2026-05-02
 * (commit f093706). The replacement bootstrap (bootstrap.ts and
 * docker/postgres/init) only re-creates part of it, so on a fresh install
 * several screens fail with "relation/column does not exist" (creating a
 * client, invoices, document search, matter activity, Disable User, ...).
 *
 * These statements were derived by replaying the deleted migrations into a
 * scratch database and diffing it against a fresh install, restricted to the
 * tables the backend code actually uses. Supabase-only parts (RLS policies,
 * auth.users foreign keys, auth.uid()-based checks, realtime triggers) are left
 * out: the Node backend does authentication and authorisation itself.
 *
 * Every statement is idempotent and only ADDS objects/columns (all new columns
 * are nullable), so it is safe on every boot and on databases that already
 * hold data. Each statement runs on its own; ensureDatabaseSchema() logs a
 * failure and carries on. Re-adding an existing constraint fails with
 * "already exists", which ensureDatabaseSchema() ignores.
 */
export const schemaCompletionStatements: string[] = [
  // pgvector: document search (RAG) stores embeddings in vector columns.
  // Requires the postgres image built from deploy/postgres (alpine + pgvector).
  `create extension if not exists vector`,

  // ── Missing tables ─────────────────────────────────────────────────────────
  `
  create table if not exists public.case_activities (
    id uuid primary key default gen_random_uuid(),
    case_id uuid not null,
    title text not null,
    description text,
    activity_type text not null,
    assigned_to uuid,
    due_date date,
    status text default 'pending',
    created_at timestamptz default now(),
    created_by uuid,
    organization_id uuid not null
  )
  `,
  `create index if not exists idx_case_activities_case_id on public.case_activities (case_id)`,
  `create index if not exists idx_case_activities_organization_id on public.case_activities (organization_id)`,
  `do $c$ begin alter table public.case_activities add constraint case_activities_case_id_fkey foreign key (case_id) references public.cases(id) on delete cascade; exception when duplicate_object or duplicate_table then null; end $c$`,

  `
  create table if not exists public.case_issues (
    id uuid primary key default gen_random_uuid(),
    case_type_id uuid not null,
    name text not null,
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    is_global boolean default false
  )
  `,
  `create index if not exists case_issues_case_type_id_idx on public.case_issues (case_type_id)`,
  `do $c$ begin alter table public.case_issues add constraint case_issues_case_type_id_fkey foreign key (case_type_id) references public.case_types(id) on delete cascade; exception when duplicate_object or duplicate_table then null; end $c$`,

  `
  create table if not exists public.communication_logs (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null,
    user_id uuid not null,
    type text not null,
    content text not null,
    created_at timestamptz default now()
  )
  `,
  `create index if not exists idx_communication_logs_client_id on public.communication_logs (client_id)`,
  `do $c$ begin alter table public.communication_logs add constraint communication_logs_client_id_fkey foreign key (client_id) references public.clients(id) on delete cascade; exception when duplicate_object or duplicate_table then null; end $c$`,

  `
  create table if not exists public.contract_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    template_content text not null,
    contract_type text not null,
    organization_id uuid,
    created_by uuid,
    is_public boolean default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  )
  `,
  `create index if not exists idx_contract_templates_organization_id on public.contract_templates (organization_id)`,

  `
  create table if not exists public.invoices (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    client_id uuid,
    case_id uuid,
    invoice_number text not null,
    title text not null,
    description text,
    status text default 'draft' check (status in ('draft', 'sent', 'paid', 'cancelled', 'overdue')),
    issue_date date not null default current_date,
    due_date date not null,
    subtotal numeric(10,2) not null default 0,
    tax_rate numeric(5,2) default 0,
    tax_amount numeric(10,2) default 0,
    total_amount numeric(10,2) not null default 0,
    currency text default 'USD',
    notes text,
    terms_conditions text,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, invoice_number)
  )
  `,
  `create index if not exists idx_invoices_client_id on public.invoices (client_id)`,
  `create index if not exists idx_invoices_case_id on public.invoices (case_id)`,
  `do $c$ begin alter table public.invoices add constraint invoices_client_id_fkey foreign key (client_id) references public.clients(id) on delete set null; exception when duplicate_object or duplicate_table then null; end $c$`,
  `do $c$ begin alter table public.invoices add constraint invoices_case_id_fkey foreign key (case_id) references public.cases(id) on delete set null; exception when duplicate_object or duplicate_table then null; end $c$`,

  `
  create table if not exists public.invoice_items (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid not null references public.invoices(id) on delete cascade,
    description text not null,
    quantity numeric(10,2) not null default 1,
    rate numeric(10,2) not null default 0,
    amount numeric(10,2) not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_invoice_items_invoice_id on public.invoice_items (invoice_id)`,

  `
  create table if not exists public.document_chunks (
    id uuid primary key default gen_random_uuid(),
    document_id uuid,
    contract_id uuid,
    organization_id uuid not null,
    chunk_index integer not null,
    content text not null,
    token_count integer,
    embedding vector(1536),
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint check_single_parent check (
      (document_id is not null and contract_id is null) or (document_id is null and contract_id is not null)
    )
  )
  `,
  `create index if not exists idx_document_chunks_document_id on public.document_chunks (document_id)`,
  `create index if not exists idx_document_chunks_contract_id on public.document_chunks (contract_id)`,
  `create index if not exists idx_document_chunks_organization_id on public.document_chunks (organization_id)`,
  `create index if not exists idx_document_chunks_embedding on public.document_chunks using hnsw (embedding vector_cosine_ops)`,
  `do $c$ begin alter table public.document_chunks add constraint document_chunks_document_id_fkey foreign key (document_id) references public.documents(id) on delete cascade; exception when duplicate_object or duplicate_table then null; end $c$`,
  `do $c$ begin alter table public.document_chunks add constraint document_chunks_contract_id_fkey foreign key (contract_id) references public.contracts(id) on delete cascade; exception when duplicate_object or duplicate_table then null; end $c$`,

  `
  create table if not exists public.organization_sso_configs (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    provider text not null check (provider in ('google', 'microsoft', 'okta', 'saml')),
    client_id text not null,
    client_secret text,
    tenant_id text,
    domain text not null check (length(trim(domain)) > 0),
    metadata_url text,
    is_enabled boolean not null default true,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    domain_hint text,
    redirect_uri text,
    updated_by uuid,
    unique (organization_id, provider)
  )
  `,

  // Not in the old migrations either; shaped after routes/api/misc.ts.
  `
  create table if not exists public.dashboard_prefs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    organization_id uuid not null,
    show_upcoming_cases boolean default true,
    show_upcoming_contracts boolean default true,
    reminder_window_days integer default 90,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, organization_id)
  )
  `,
  `
  create table if not exists public.saved_searches (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    created_by uuid,
    name text not null,
    query text,
    filters jsonb default '{}'::jsonb,
    resource_type text,
    created_at timestamptz not null default now()
  )
  `,
  `create index if not exists idx_saved_searches_org on public.saved_searches (organization_id, created_at desc)`,

  // ── Missing columns on existing tables (all nullable) ─────────────────────
  `alter table public.calendar_events add column if not exists activity_id uuid`,
  `alter table public.calendar_events add column if not exists recurrence_days_of_week integer[]`,
  `alter table public.calendar_events add column if not exists recurrence_week_of_month integer`,
  `alter table public.calendar_events add column if not exists recurrence_day_of_month integer`,
  `alter table public.calendar_events add column if not exists recurrence_month_of_year integer`,
  `alter table public.calendar_events add column if not exists recurrence_end_after_count integer`,
  `alter table public.case_fields add column if not exists label text`,
  `alter table public.case_fields add column if not exists field_key text`,
  `alter table public.case_fields add column if not exists data_type text default 'text'::text`,
  `alter table public.case_fields add column if not exists is_required boolean default false`,
  `alter table public.case_fields add column if not exists field_order integer default 0`,
  `alter table public.case_fields add column if not exists created_by uuid`,
  `alter table public.cases add column if not exists current_status text default 'in_progress'::text`,
  `alter table public.cases add column if not exists case_type_name text`,
  `alter table public.cases add column if not exists case_type_description text`,
  `alter table public.cases add column if not exists user_id uuid`,
  `alter table public.clients add column if not exists address text`,
  `alter table public.clients add column if not exists notes text`,
  `alter table public.clients add column if not exists status text default 'active'::text`,
  `alter table public.clients add column if not exists created_by uuid`,
  `alter table public.clients add column if not exists user_id uuid`,
  `alter table public.documents add column if not exists case_id uuid`,
  `alter table public.documents add column if not exists title text`,
  `alter table public.documents add column if not exists description text`,
  `alter table public.documents add column if not exists file_type text`,
  `alter table public.documents add column if not exists category text`,
  `alter table public.documents add column if not exists tags text[]`,
  `alter table public.documents add column if not exists uploaded_by uuid`,
  `alter table public.documents add column if not exists version integer default 1`,
  `alter table public.documents add column if not exists previous_version_id uuid`,
  `alter table public.documents add column if not exists template_id uuid`,
  `alter table public.documents add column if not exists embedding vector(1536)`,
  `alter table public.contracts add column if not exists embedding vector(1536)`,
  `alter table public.payment_transactions add column if not exists flutterwave_tx_ref character varying(100)`,
  `alter table public.payment_transactions add column if not exists flutterwave_tx_id character varying(50)`,
  `alter table public.profiles add column if not exists phone text`,
  `alter table public.profiles add column if not exists avatar_url text`,
  `alter table public.profiles add column if not exists last_login_at timestamp with time zone`,
  `alter table public.profiles add column if not exists title text`,
  `alter table public.profiles add column if not exists verified_at timestamp with time zone`,
  `alter table public.profiles add column if not exists calendar_ics_token text`,
  `alter table public.user_calendar_integrations add column if not exists access_token text`,
  `alter table public.user_calendar_integrations add column if not exists refresh_token text`,
  `alter table public.user_calendar_integrations add column if not exists token_type text`,
  `alter table public.user_calendar_integrations add column if not exists scope text`,
  `alter table public.user_calendar_integrations add column if not exists expires_at timestamp with time zone`,
  `alter table public.user_plans add column if not exists flutterwave_plan_id_monthly character varying(50)`,
  `alter table public.user_plans add column if not exists flutterwave_plan_id_yearly character varying(50)`,
  `alter table public.user_role_assignments add column if not exists updated_at timestamp with time zone default now()`,
  `alter table public.voice_transcriptions add column if not exists metadata jsonb default '{}'::jsonb`,
  `alter table public.voice_transcriptions add column if not exists audio_file_url text`,

  // Columns the current code writes that were added upstream after the
  // Supabase migrations stopped (not in the old schema either).
  `alter table public.case_activities add column if not exists user_id uuid`,
  `alter table public.case_activities add column if not exists date timestamptz`,
  `alter table public.case_activities add column if not exists duration_minutes integer`,
  `alter table public.case_activities add column if not exists billable boolean default false`,
  `alter table public.case_activities add column if not exists updated_at timestamptz default now()`,
  `alter table public.communication_logs add column if not exists organization_id uuid`,
  `alter table public.invoice_items add column if not exists organization_id uuid`,
  `alter table public.invoices add column if not exists amount numeric(10,2)`,
  `alter table public.impersonation_sessions add column if not exists target_email text`,
  // Firm-specific issues (null = global, shared by every firm).
  `alter table public.case_issues add column if not exists organization_id uuid`,
  `create index if not exists idx_case_issues_org on public.case_issues (organization_id)`,

  // ── Default matter issues for the global matter types (bootstrap.ts seeds
  // the types). The New Matter form requires an issue, so every type gets a
  // practical list plus "Other". Inserted only when missing (by type + name).
  `
  insert into public.case_issues (case_type_id, name, is_global)
  select ct.id, v.issue, true
    from (values
      ('Litigation', 'Commercial dispute'), ('Litigation', 'Contract claim'),
      ('Litigation', 'Liability / damages claim'), ('Litigation', 'Interim / urgent proceedings'),
      ('Litigation', 'Appeal'), ('Litigation', 'Enforcement of judgment'),
      ('Corporate & Commercial', 'Company formation'), ('Corporate & Commercial', 'Shareholder agreement'),
      ('Corporate & Commercial', 'Corporate governance'), ('Corporate & Commercial', 'Commercial contract'),
      ('Corporate & Commercial', 'Distribution / agency'), ('Corporate & Commercial', 'Restructuring'),
      ('Mergers & Acquisitions', 'Share purchase'), ('Mergers & Acquisitions', 'Asset purchase'),
      ('Mergers & Acquisitions', 'Due diligence'), ('Mergers & Acquisitions', 'Joint venture'),
      ('Mergers & Acquisitions', 'Merger / demerger'),
      ('Banking & Finance', 'Loan agreement'), ('Banking & Finance', 'Security / guarantees'),
      ('Banking & Finance', 'Refinancing'), ('Banking & Finance', 'Financial regulation'),
      ('Real Estate & Property', 'Purchase / sale'), ('Real Estate & Property', 'Commercial lease'),
      ('Real Estate & Property', 'Residential lease'), ('Real Estate & Property', 'Construction dispute'),
      ('Real Estate & Property', 'Co-ownership'), ('Real Estate & Property', 'Zoning / building permit'),
      ('Employment & Labour', 'Dismissal'), ('Employment & Labour', 'Employment contract'),
      ('Employment & Labour', 'Discrimination / harassment'), ('Employment & Labour', 'Collective dispute'),
      ('Employment & Labour', 'Social security'),
      ('Contract Drafting & Review', 'Drafting'), ('Contract Drafting & Review', 'Review'),
      ('Contract Drafting & Review', 'Negotiation'), ('Contract Drafting & Review', 'Terms and conditions'),
      ('Criminal Defence', 'Investigation / questioning'), ('Criminal Defence', 'Trial defence'),
      ('Criminal Defence', 'Appeal'), ('Criminal Defence', 'Victim representation'),
      ('Criminal Defence', 'Economic / financial crime'),
      ('Debt Recovery', 'Amicable recovery'), ('Debt Recovery', 'Payment order'),
      ('Debt Recovery', 'Court recovery'), ('Debt Recovery', 'Insolvency claim'),
      ('Estate Planning & Probate', 'Will'), ('Estate Planning & Probate', 'Estate settlement'),
      ('Estate Planning & Probate', 'Gift / donation'), ('Estate Planning & Probate', 'Inheritance dispute'),
      ('Estate Planning & Probate', 'Power of attorney / protection'),
      ('Family Law', 'Divorce'), ('Family Law', 'Child custody / residence'), ('Family Law', 'Maintenance'),
      ('Family Law', 'Marital property'), ('Family Law', 'Adoption'), ('Family Law', 'Domestic violence'),
      ('Immigration', 'Residence permit'), ('Immigration', 'Work permit'),
      ('Immigration', 'Family reunification'), ('Immigration', 'Nationality'), ('Immigration', 'Asylum / appeal'),
      ('Intellectual Property', 'Trademark'), ('Intellectual Property', 'Patent'),
      ('Intellectual Property', 'Copyright'), ('Intellectual Property', 'Infringement dispute'),
      ('Intellectual Property', 'Licensing'),
      ('Regulatory & Compliance', 'Data protection (GDPR)'), ('Regulatory & Compliance', 'Anti-money laundering'),
      ('Regulatory & Compliance', 'Competition law'), ('Regulatory & Compliance', 'Regulatory investigation'),
      ('Regulatory & Compliance', 'Licences / permits'),
      ('Tax', 'Tax audit / dispute'), ('Tax', 'Tax structuring'), ('Tax', 'VAT'),
      ('Tax', 'International tax'), ('Tax', 'Tax advice / returns')
    ) as v(type_name, issue)
    join public.case_types ct on ct.is_global = true and lower(ct.name) = lower(v.type_name)
   where not exists (
     select 1 from public.case_issues ci where ci.case_type_id = ct.id and lower(ci.name) = lower(v.issue)
   )
  `,
  // "Other" under every global type, including types added later by the
  // platform admin, so a matter can always be created.
  `
  insert into public.case_issues (case_type_id, name, description, is_global)
  select ct.id, 'Other', 'Anything not listed', true
    from public.case_types ct
   where ct.is_global = true
     and not exists (select 1 from public.case_issues ci where ci.case_type_id = ct.id and lower(ci.name) = 'other')
  `,

  // ── Functions called by the backend ───────────────────────────────────────
  // The Supabase versions checked permissions with auth.uid(), which does not
  // exist here; every caller checks permissions in Node before calling.
  `
  create or replace function public.generate_invoice_number(org_id uuid)
  returns text language plpgsql as $fn$
  declare
    v_year text := extract(year from current_date)::text;
    v_next integer;
  begin
    select coalesce(max(cast(substring(i.invoice_number from 'INV-' || v_year || '-([0-9]+)$') as integer)), 0) + 1
      into v_next
      from public.invoices i
     where i.organization_id = org_id
       and i.invoice_number like 'INV-' || v_year || '-%';
    return 'INV-' || v_year || '-' || lpad(v_next::text, 4, '0');
  end;
  $fn$
  `,
  // Disable/enable a staff account. Sign-in checks auth_users.is_active, so
  // that flag is set too and existing sessions are revoked on disable.
  `
  create or replace function public.toggle_user_status(target_user_id uuid, disable boolean default true)
  returns json language plpgsql as $fn$
  begin
    if not exists (select 1 from public.profiles where user_id = target_user_id) then
      return json_build_object('error', 'User not found');
    end if;
    if disable then
      update public.profiles
         set status = 'disabled', disabled_at = now(), updated_at = now()
       where user_id = target_user_id;
      update public.auth_users
         set is_active = false, refresh_token = null, refresh_token_expires_at = null,
             token_version = coalesce(token_version, 0) + 1, updated_at = now()
       where id = target_user_id;
    else
      update public.profiles
         set status = 'active', disabled_at = null, disabled_by = null, updated_at = now()
       where user_id = target_user_id;
      update public.auth_users set is_active = true, updated_at = now() where id = target_user_id;
    end if;
    return json_build_object('success', true, 'message',
      case when disable then 'User disabled successfully' else 'User enabled successfully' end);
  end;
  $fn$
  `,
  // Replace the user's firm role (the route already checked the actor's level,
  // the target's organisation and the role name). Platform roles are kept.
  `
  create or replace function public.change_user_role(p_target_user_id uuid, p_new_role_name text)
  returns json language plpgsql as $fn$
  declare
    v_org uuid;
  begin
    if p_new_role_name in ('platform_admin', 'platform_support', 'platform_billing') then
      return json_build_object('error', 'Platform roles cannot be assigned through the application');
    end if;
    select organization_id into v_org from public.profiles where user_id = p_target_user_id;
    if v_org is null then
      return json_build_object('error', 'User not found');
    end if;
    delete from public.user_role_assignments
     where user_id = p_target_user_id and organization_id = v_org
       and role_name not in ('platform_admin', 'platform_support', 'platform_billing');
    insert into public.user_role_assignments (user_id, role_name, organization_id, created_at)
    values (p_target_user_id, p_new_role_name, v_org, now());
    update public.profiles set role = p_new_role_name, updated_at = now() where user_id = p_target_user_id;
    return json_build_object('success', true, 'message', 'User role changed successfully');
  end;
  $fn$
  `,
  `
  create or replace function public.get_organization_users(org_id uuid)
  returns table(id uuid, user_id uuid, email text, first_name text, last_name text, role text,
                department text, status text, disabled_at timestamptz, disabled_by uuid,
                verified_at timestamptz, last_login_at timestamptz, created_at timestamptz,
                organization_id uuid, user_type text, verification_status text)
  language sql stable as $fn$
    select p.id, p.user_id, p.email, p.first_name, p.last_name,
           coalesce((select ura.role_name from public.user_role_assignments ura
                      where ura.user_id = p.user_id and ura.organization_id = p.organization_id
                      order by case ura.role_name when 'superadmin' then 1 when 'admin' then 2 else 3 end
                      limit 1), 'user'),
           p.department, p.status, p.disabled_at, p.disabled_by, p.verified_at,
           coalesce(p.last_login_at, au.last_sign_in_at), p.created_at, p.organization_id,
           'user'::text,
           case when p.verified_at is not null or au.email_confirmed_at is not null then 'verified' else 'unverified' end
      from public.profiles p
      left join public.auth_users au on au.id = p.user_id
     where p.organization_id = org_id
    union all
    select i.id, null::uuid, i.email, i.first_name, i.last_name, coalesce(i.role, 'user'), i.department,
           i.status, null::timestamptz, null::uuid, null::timestamptz, null::timestamptz, i.created_at,
           i.organization_id, 'invitation'::text, 'pending'::text
      from public.invitations i
     where i.organization_id = org_id and i.status = 'pending' and i.expires_at > now()
  $fn$
  `,
  `
  create or replace function public.toggle_organization_status(p_org_id uuid, p_is_active boolean)
  returns json language plpgsql as $fn$
  begin
    update public.organizations set is_active = p_is_active, updated_at = now() where id = p_org_id;
    if not found then
      return json_build_object('error', 'Organization not found');
    end if;
    return json_build_object('success', true, 'message',
      case when p_is_active then 'Organization enabled successfully' else 'Organization disabled successfully' end);
  end;
  $fn$
  `,
  `
  create or replace function public.delete_organization_safe(p_org_id uuid, p_reason text default null)
  returns boolean language plpgsql as $fn$
  begin
    delete from public.organizations where id = p_org_id;
    if not found then
      raise exception 'Organization not found';
    end if;
    return true;
  end;
  $fn$
  `,
];
