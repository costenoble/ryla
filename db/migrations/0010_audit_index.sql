-- ===========================================================================
-- Index de chaînage du journal d'audit
--
-- Chaque écriture au journal lit d'abord l'empreinte de l'entrée précédente
-- du cabinet : `order by id desc limit 1`. Les index existants portent sur
-- `(tenant_id, occurred_at)` et sur l'objet, aucun sur `(tenant_id, id)`.
-- PostgreSQL parcourait donc la clé primaire — globale, tous cabinets
-- confondus — à rebours, en filtrant sur `tenant_id`.
--
-- Vérifié au plan : `Index Scan Backward using audit_log_pkey, Filter:
-- (tenant_id = $0)`. Tant qu'il n'y a qu'un cabinet actif, la première ligne
-- lue est la bonne et personne ne voit rien. Avec deux cents cabinets,
-- retrouver la dernière entrée d'un cabinet peu actif oblige à remonter
-- toutes celles des autres — sur chaque écriture, donc sur chaque signature.
--
-- L'ordre décroissant est explicite : c'est le seul sens dans lequel cette
-- requête lit l'index.
-- ===========================================================================

create index audit_log_tenant_seq_idx on audit_log (tenant_id, id desc);

comment on index audit_log_tenant_seq_idx is
  'Lecture du prev_hash à chaque écriture, et vérification bornée de la chaîne.';
