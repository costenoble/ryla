-- ===========================================================================
-- Acceptation du contrat de sous-traitance (article 28 du RGPD)
--
-- Le cabinet est responsable de traitement, Ryla est sous-traitant. L'article
-- 28.3 impose que cette relation soit régie par un contrat écrit — sans lui, le
-- cabinet est en infraction, et Ryla avec lui. Ouvrir un espace destiné à
-- recevoir des données de santé sans avoir fait accepter ce contrat, c'est
-- livrer un produit non conforme dès la première minute.
--
-- On horodate donc l'acceptation, avec la version du texte accepté et
-- l'adresse IP. C'est exactement ce que Ryla fait pour les patients : la preuve
-- de ce qui a été accepté, quand, et par qui. Il n'y avait aucune raison de
-- s'appliquer à soi-même une exigence moindre.
--
-- La version est stockée en clair plutôt que par une référence : quand le
-- contrat évoluera, on doit pouvoir dire lequel un cabinet donné a signé, y
-- compris après que le texte courant a changé.
-- ===========================================================================

alter table tenants
  add column dpa_version text,
  add column dpa_accepted_at timestamptz,
  add column dpa_accepted_by text,
  add column dpa_accepted_ip inet;

comment on column tenants.dpa_version is
  'Version du contrat de sous-traitance acceptée. NULL pour les cabinets créés avant sa mise en place.';
comment on column tenants.dpa_accepted_at is
  'Horodatage serveur de l''acceptation — jamais une date fournie par le client.';
comment on column tenants.dpa_accepted_by is
  'Nom et adresse email de la personne ayant accepté, tels que saisis à l''inscription.';
