-- ===========================================================================
-- Ryla — isolation multi-tenant par Row Level Security
--
-- Principe : l'application ne filtre JAMAIS par tenant dans ses requêtes.
-- Elle ouvre une transaction, pose `SET LOCAL app.tenant_id = '<uuid>'`, et
-- Postgres se charge du reste. Un oubli de `where tenant_id = …` dans le code
-- applicatif ne peut donc pas provoquer de fuite inter-cabinets.
--
-- Le rôle applicatif `ryla_app` n'est ni superuser ni BYPASSRLS. Le rôle
-- propriétaire (`ryla`) contourne le RLS et sert uniquement aux migrations
-- et au seed.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Rôle applicatif
--
-- ⚠️  Le mot de passe ci-dessous est un défaut de développement.
--     En production, créez le rôle hors migration et faites-le tourner.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ryla_app') then
    create role ryla_app login password 'ryla_app'
      nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end;
$$;

-- Durcissement des attributs, en meilleur effort.
--
-- Sur une base managée (Supabase, base mutualisée), le rôle qui joue les
-- migrations n'est pas superuser et ne peut pas modifier BYPASSRLS. Ce n'est
-- pas grave : le rôle vient d'être créé sans cet attribut, et le contrôle de
-- démarrage `assertRlsEnforced()` refuse de toute façon de fonctionner avec un
-- rôle qui contourne le RLS. On ne fait donc pas échouer la migration ici.
do $$
begin
  alter role ryla_app nosuperuser nocreatedb nocreaterole nobypassrls;
exception when insufficient_privilege then
  raise notice
    'Attributs de ryla_app non modifiables (hébergement managé) : %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contexte de la transaction courante
--
-- `current_setting(..., true)` renvoie NULL si le paramètre n'est pas posé.
-- Toute comparaison `tenant_id = NULL` vaut NULL, donc faux : les politiques
-- échouent fermées. Oublier de poser le contexte ne donne pas « tout voir »,
-- ça donne « ne rien voir ».
-- ---------------------------------------------------------------------------
create or replace function app.current_tenant() returns uuid
language sql stable
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid;
$$;

create or replace function app.current_actor() returns uuid
language sql stable
as $$
  select nullif(current_setting('app.actor_id', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------------
-- Politiques
-- ---------------------------------------------------------------------------

-- Le cabinet ne voit que sa propre fiche. Aucune politique d'INSERT : la
-- création d'un cabinet passe obligatoirement par app.provision_tenant().
alter table tenants enable row level security;
create policy tenants_self_select on tenants
  for select using (id = app.current_tenant());
create policy tenants_self_update on tenants
  for update using (id = app.current_tenant())
          with check (id = app.current_tenant());

-- Tables métier : isolation uniforme sur tenant_id.
-- La boucle garantit qu'aucune table n'est oubliée aujourd'hui ; le contrôle
-- final de ce fichier garantit qu'aucune ne le sera demain.
do $$
declare t text;
begin
  foreach t in array array[
    'users', 'sessions', 'patients', 'form_templates', 'form_versions',
    'submissions', 'access_tokens', 'signatures', 'otp_challenges',
    'documents', 'quotes', 'quote_lines', 'image_rights_consents', 'reminders'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_tenant_isolation on %I
         for all
         using (tenant_id = app.current_tenant())
         with check (tenant_id = app.current_tenant())', t, t);
  end loop;
end;
$$;

-- Journal d'audit : lecture et écriture, jamais de modification ni de
-- suppression. L'absence de politique UPDATE/DELETE double le REVOKE plus bas.
alter table audit_log enable row level security;
create policy audit_log_select on audit_log
  for select using (tenant_id = app.current_tenant());
create policy audit_log_insert on audit_log
  for insert with check (tenant_id = app.current_tenant());

-- ---------------------------------------------------------------------------
-- Résolveurs privilégiés
--
-- Deux lectures doivent avoir lieu *avant* de connaître le tenant : trouver le
-- cabinet depuis son sous-domaine, et trouver le dossier depuis un lien
-- magique. Elles passent par des fonctions SECURITY DEFINER à surface
-- minimale — exactement ces deux requêtes, sur clé exacte, sans champ sensible.
-- ---------------------------------------------------------------------------
create or replace function app.resolve_tenant_by_slug(p_slug text)
returns table (
  id uuid, slug text, name text, specialty text,
  branding jsonb, legal_notice text
)
language sql stable security definer
set search_path = public, app
as $$
  select t.id, t.slug, t.name, t.specialty, t.branding, t.legal_notice
  from tenants t
  where t.slug = p_slug
    and t.deleted_at is null;
$$;

create or replace function app.resolve_access_token(p_token_hash text)
returns table (
  token_id uuid, tenant_id uuid, submission_id uuid, audience text,
  expires_at timestamptz, revoked_at timestamptz,
  used_count integer, max_uses integer
)
language sql stable security definer
set search_path = public, app
as $$
  select a.id, a.tenant_id, a.submission_id, a.audience,
         a.expires_at, a.revoked_at, a.used_count, a.max_uses
  from access_tokens a
  where a.token_hash = p_token_hash;
$$;

-- Création d'un cabinet : opération privilégiée, hors politique RLS.
create or replace function app.provision_tenant(
  p_slug text,
  p_name text,
  p_specialty text,
  p_dek_wrapped bytea
) returns uuid
language plpgsql security definer
set search_path = public, app
as $$
declare
  v_id uuid;
begin
  insert into tenants (slug, name, specialty, dek_wrapped)
  values (p_slug, p_name, p_specialty, p_dek_wrapped)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilèges
-- ---------------------------------------------------------------------------
grant usage on schema public, app to ryla_app;
grant select, insert, update, delete on all tables in schema public to ryla_app;
grant usage, select on all sequences in schema public to ryla_app;

-- Append-only, au niveau des privilèges cette fois.
revoke update, delete on audit_log from ryla_app;

-- Un cabinet ne se crée ni ne se supprime depuis l'application : le seul
-- chemin est app.provision_tenant(), qui s'exécute avec les droits du
-- propriétaire. Retirer le privilège rend la politique manquante inatteignable
-- plutôt que simplement bloquante.
revoke insert, delete on tenants from ryla_app;

revoke all on function app.resolve_tenant_by_slug(text) from public;
revoke all on function app.resolve_access_token(text) from public;
revoke all on function app.provision_tenant(text, text, text, bytea) from public;
grant execute on function app.resolve_tenant_by_slug(text) to ryla_app;
grant execute on function app.resolve_access_token(text) to ryla_app;
grant execute on function app.provision_tenant(text, text, text, bytea) to ryla_app;
grant execute on function app.current_tenant() to ryla_app;
grant execute on function app.current_actor() to ryla_app;

alter default privileges in schema public
  grant select, insert, update, delete on tables to ryla_app;
alter default privileges in schema public
  grant usage, select on sequences to ryla_app;

-- ---------------------------------------------------------------------------
-- Garde-fou : toute table de `public` doit avoir le RLS activé.
-- Une table ajoutée sans politique fait échouer la migration, pas la prod.
-- ---------------------------------------------------------------------------
do $$
declare missing text;
begin
  select string_agg(c.relname, ', ')
    into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname <> '_migrations'
    and not c.relrowsecurity;

  if missing is not null then
    raise exception 'RLS absent sur : %', missing;
  end if;
end;
$$;
