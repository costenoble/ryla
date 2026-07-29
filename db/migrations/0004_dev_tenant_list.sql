-- ===========================================================================
-- Liste des cabinets, pour l'écran de connexion en développement
--
-- En production, le cabinet vient du sous-domaine et cette fonction n'est
-- jamais appelée : l'application ne l'invoque que lorsque l'hôte ne porte pas
-- de sous-domaine, c'est-à-dire en local.
--
-- Elle ne renvoie que le slug et le nom — aucun identifiant, aucune clé,
-- aucune donnée de santé. Même appelée, elle n'expose rien de plus que ce
-- qu'un sous-domaine public révèle déjà.
-- ===========================================================================

create or replace function app.list_tenants()
returns table (slug text, name text)
language sql stable security definer
set search_path = public, app
as $$
  select t.slug, t.name
  from tenants t
  where t.deleted_at is null
  order by t.name;
$$;

revoke all on function app.list_tenants() from public;
grant execute on function app.list_tenants() to ryla_app;
