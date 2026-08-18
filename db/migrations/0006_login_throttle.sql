-- ===========================================================================
-- Limitation de débit sur la connexion
--
-- Un mot de passe scrypt devant des données de santé, sans compteur de
-- tentatives, se casse en force brute distribuée sans qu'aucune alarme ne
-- sonne : les échecs partaient bien au journal d'audit, mais personne ne lit
-- un journal en temps réel.
--
-- Deux compteurs plutôt qu'un, parce qu'ils couvrent deux attaques
-- différentes :
--   • par email — quelqu'un s'acharne sur un compte connu ;
--   • par adresse IP — quelqu'un essaie un même mot de passe sur tous les
--     comptes du cabinet (pulvérisation). Le compteur par email ne le voit
--     jamais, puisque chaque compte n'encaisse qu'un ou deux essais.
--
-- La table est volontairement dans le périmètre du RLS : la connexion résout
-- déjà le cabinet par son sous-domaine avant de vérifier quoi que ce soit,
-- donc le contexte est posé. Un cabinet ne peut pas voir les tentatives d'un
-- autre, et la fuite d'un compteur ne renseigne personne sur un voisin.
-- ===========================================================================

create table login_attempts (
  id                bigint generated always as identity primary key,
  tenant_id         uuid not null references tenants(id) on delete cascade,
  -- Normalisé en minuscules à l'écriture. On journalise l'email saisi, pas
  -- celui d'un compte existant : sinon le compteur ne se déclencherait que
  -- pour les comptes réels, et son silence révélerait les autres.
  email             text not null,
  ip                inet,
  attempted_at      timestamptz not null default now()
);

create index login_attempts_email_idx
  on login_attempts (tenant_id, email, attempted_at desc);
create index login_attempts_ip_idx
  on login_attempts (tenant_id, ip, attempted_at desc);

alter table login_attempts enable row level security;
create policy login_attempts_tenant_isolation on login_attempts
  for all
  using (tenant_id = app.current_tenant())
  with check (tenant_id = app.current_tenant());

grant select, insert, update, delete on login_attempts to ryla_app;

comment on table login_attempts is
  'Échecs de connexion récents. Purgée au fil de l''eau : ce n''est pas un journal, le journal c''est audit_log.';

-- Même garde-fou qu'en 0002 et 0003 : toute table de `public` porte le RLS.
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
