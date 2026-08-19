-- ===========================================================================
-- Actes propres au cabinet
--
-- Le référentiel livré ne couvrira jamais tout, et il ne doit pas prétendre le
-- contraire : la CCAM évolue par avenant, les tarifs aussi, et un praticien
-- connaît ses codes mieux que nous. Tant qu'il fallait passer par un script
-- pour corriger un libellé, la moindre erreur du référentiel se payait d'un
-- devis saisi à la main.
--
-- Une seule table, deux régimes, distingués par `tenant_id` :
--   NULL      → référence partagée. Lisible par tous, modifiable par personne
--               depuis l'application : c'est un texte réglementaire.
--   non NULL  → acte du cabinet. Il le crée, le modifie et le supprime.
--
-- Un cabinet qui veut corriger un acte partagé n'écrase donc rien : il s'en
-- fait une copie qui lui appartient, et c'est elle qui prime à la recherche.
-- La référence reste intacte pour les autres, ce qui est la seule façon de
-- pouvoir la mettre à jour plus tard sans détruire le travail de chacun.
-- ===========================================================================

alter table nomenclature
  add column tenant_id uuid references tenants(id) on delete cascade;

comment on column nomenclature.tenant_id is
  'NULL = référence partagée (CCAM/NGAP), en lecture seule. Sinon, acte propre au cabinet.';

-- L'unicité de `(system, code)` ne vaut plus globalement : deux cabinets
-- doivent pouvoir avoir chacun leur version de HBLD403.
drop index if exists nomenclature_system_code_idx;

create unique index nomenclature_shared_code_idx
  on nomenclature (system, code) where tenant_id is null;
create unique index nomenclature_tenant_code_idx
  on nomenclature (tenant_id, system, code) where tenant_id is not null;

create index nomenclature_tenant_idx on nomenclature (tenant_id, specialty);

-- ---------------------------------------------------------------------------
-- Politiques
--
-- Une politique par commande, et non un `for all` : la lecture doit accepter
-- les lignes partagées (`tenant_id is null`), l'écriture ne le doit surtout
-- pas. Un `for all` appliquerait le même prédicat aux deux et laisserait un
-- cabinet réécrire la CCAM pour tout le monde.
-- ---------------------------------------------------------------------------
drop policy if exists nomenclature_read on nomenclature;

create policy nomenclature_select on nomenclature
  for select using (tenant_id is null or tenant_id = app.current_tenant());

create policy nomenclature_insert on nomenclature
  for insert with check (tenant_id = app.current_tenant());

create policy nomenclature_update on nomenclature
  for update using (tenant_id = app.current_tenant())
          with check (tenant_id = app.current_tenant());

create policy nomenclature_delete on nomenclature
  for delete using (tenant_id = app.current_tenant());

-- Rendus après avoir été retirés en 0007 : l'écriture est désormais possible,
-- mais uniquement sur ses propres lignes — les politiques ci-dessus s'en
-- chargent.
grant insert, update, delete on nomenclature to ryla_app;
