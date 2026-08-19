-- ===========================================================================
-- Devis produits par le logiciel métier du cabinet
--
-- Logos, VisioDent, Julie, Desmos… produisent déjà le devis. Le refaire dans
-- Ryla n'a aucun intérêt pour ces cabinets-là : ce qui leur manque, c'est de
-- le faire signer avec la même valeur probante que le reste.
--
-- D'où le parti pris : le PDF importé devient la *pièce* d'un dossier
-- ordinaire. Il réutilise tout ce qui existe déjà — lien magique, mesure du
-- temps de lecture, déclarations horodatées, journal chaîné, faisceau de
-- preuves — sans qu'aucune de ces mécaniques ait à connaître son origine.
--
-- Le document signé rendu au patient est alors le devis d'origine, page pour
-- page, suivi de l'annexe de preuve. On ne réécrit pas le document du cabinet :
-- on l'enveloppe.
-- ===========================================================================

alter table documents
  add column origin text not null default 'generated'
    check (origin in ('generated', 'imported'));

comment on column documents.origin is
  '« imported » : produit hors de Ryla (logiciel métier), scellé tel quel et jamais réécrit.';

-- Pièce à faire signer, quand le contenu ne vient pas d'un formulaire Ryla.
--
-- `on delete restrict` et pas `cascade` : supprimer la pièce d'un dossier signé
-- reviendrait à détruire ce qui fait preuve. La suppression doit être refusée,
-- bruyamment.
alter table submissions
  add column source_document_id uuid references documents(id) on delete restrict;

create index submissions_source_document_idx
  on submissions (tenant_id, source_document_id)
  where source_document_id is not null;

comment on column submissions.source_document_id is
  'PDF importé affiché au patient à la place du formulaire. NULL pour un dossier Ryla ordinaire.';
