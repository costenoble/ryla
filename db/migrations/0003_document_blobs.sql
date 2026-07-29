-- ===========================================================================
-- Stockage des documents en base
--
-- Motivation : les plateformes serverless (Vercel, conteneurs managés) n'ont
-- pas de système de fichiers persistant. Écrire un PDF de consentement sur le
-- disque local revient à le perdre au prochain déploiement.
--
-- Les mettre en base a trois avantages ici : ils héritent du RLS comme le
-- reste, ils suivent la sauvegarde de la base, et le projet reste portable
-- d'un hébergeur à l'autre sans dépendre d'un service de stockage objet.
--
-- Limite assumée : ça ne passe pas à l'échelle indéfiniment. Un consentement
-- pèse une dizaine de kilo-octets ; au-delà de quelques gigaoctets cumulés,
-- basculez sur le pilote objet (`STORAGE_DRIVER=s3`) vers un bucket certifié
-- HDS. Le contrat `DocumentStore` est identique, seule la variable change.
-- ===========================================================================

create table document_blobs (
  storage_key       text primary key,
  tenant_id         uuid not null references tenants(id) on delete cascade,
  content           bytea not null,
  byte_size         integer not null,
  created_at        timestamptz not null default now()
);

create index document_blobs_tenant_idx on document_blobs (tenant_id, created_at desc);

alter table document_blobs enable row level security;
create policy document_blobs_tenant_isolation on document_blobs
  for all
  using (tenant_id = app.current_tenant())
  with check (tenant_id = app.current_tenant());

grant select, insert, update, delete on document_blobs to ryla_app;

-- Même garde-fou qu'en 0002 : toute table de `public` doit porter le RLS.
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
