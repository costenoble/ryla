-- ===========================================================================
-- Suivi des règlements sur les devis
--
-- Saisie manuelle pour l'instant : aucun encaissement en ligne n'est branché.
-- Le cabinet note ce qu'il a reçu, comme il le ferait sur un carnet — mais au
-- moins l'information vit à côté du devis plutôt que dans un tableur séparé.
--
-- Les montants restent en centimes entiers, comme partout ailleurs : mélanger
-- des flottants et des montants dus finit toujours par coûter un centime à
-- quelqu'un.
-- ===========================================================================

alter table quotes
  add column payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partial', 'paid', 'waived')),
  add column paid_amount_cents bigint not null default 0
    check (paid_amount_cents >= 0),
  add column paid_at timestamptz,
  add column payment_note text;

-- Retrouver « ce qui reste à encaisser » est la question posée en permanence :
-- elle mérite un index plutôt qu'un parcours complet à chaque affichage.
create index quotes_payment_idx
  on quotes (tenant_id, payment_status, created_at desc);

comment on column quotes.payment_status is
  'Saisi par le cabinet. « waived » couvre les gestes commerciaux et les prises en charge intégrales.';
