-- ===========================================================================
-- Nomenclature officielle des actes — CCAM et NGAP
--
-- Table de référence, partagée par tous les cabinets et en lecture seule pour
-- l'application. Elle n'est pas cloisonnée par cabinet, et c'est voulu : la
-- CCAM est un texte réglementaire, pas une donnée de cabinet. Le RLS est tout
-- de même activé — avec une politique de lecture ouverte — pour que le
-- garde-fou « toute table de public porte le RLS » reste vrai sans exception à
-- retenir.
--
-- Deux systèmes cohabitent réellement dans un cabinet dentaire :
--   • CCAM — actes techniques, code alphanumérique (HBLD038…). C'est ce que le
--     devis CERFA S3404 exige.
--   • NGAP — lettres-clés historiques encore en vigueur pour une partie des
--     actes (SC, SPR, TO, ORT…), tarifées par un coefficient.
--
-- ⚠️  Les montants sont ceux de la convention en vigueur à la date indiquée
--     par `effective_from`, et ils changent par avenant. `source` et
--     `needs_review` existent pour qu'on sache toujours d'où vient un chiffre
--     et lesquels n'ont pas encore été confrontés à la base officielle. Un
--     devis est un document opposable : un tarif inventé n'y a pas sa place.
-- ===========================================================================

create table nomenclature (
  id                    uuid primary key default gen_random_uuid(),
  system                text not null check (system in ('CCAM', 'NGAP', 'HORS_NOMENCLATURE')),
  code                  text not null,
  label                 text not null,
  short_label           text,
  -- 'dentaire' | 'esthetique' | 'commun' : filtre la recherche selon la
  -- spécialité du cabinet, pour ne pas noyer un dentiste sous la dermatologie.
  specialty             text not null default 'commun'
                          check (specialty in ('dentaire', 'esthetique', 'commun')),
  category              text,

  -- Base de remboursement de la sécurité sociale, en centimes. NULL quand
  -- l'acte n'est pas remboursable (chirurgie esthétique pure, par exemple) —
  -- distinct de 0, qui voudrait dire « remboursé à hauteur de zéro ».
  base_reimbursement_cents integer check (base_reimbursement_cents >= 0),
  reimbursement_rate    numeric(4, 3) not null default 0.700
                          check (reimbursement_rate >= 0 and reimbursement_rate <= 1),
  reimbursable          boolean not null default true,

  -- Honoraire limite de facturation : plafond opposable dans les paniers
  -- 100 % santé et « tarifs maîtrisés ». NULL = honoraires libres.
  ceiling_cents         integer check (ceiling_cents >= 0),
  care_basket           text check (care_basket in
                          ('panier_100_sante', 'panier_maitrise', 'panier_libre')),

  -- NGAP : la lettre-clé et son coefficient (SPR 50, SC 33…).
  ngap_key              text,
  ngap_coefficient      numeric(6, 2),

  notes                 text,
  -- D'où vient le chiffre, et depuis quand il s'applique.
  source                text,
  effective_from        date,
  -- Marque les lignes du jeu de départ qui n'ont pas encore été confrontées à
  -- la base officielle. L'interface le signale plutôt que de laisser croire
  -- qu'un tarif fait foi.
  needs_review          boolean not null default true,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index nomenclature_system_code_idx on nomenclature (system, code);
create index nomenclature_specialty_idx on nomenclature (specialty, system, code);

-- Recherche par code ou par libellé, insensible à la casse et aux accents.
-- `unaccent` n'est pas garanti disponible sur toutes les bases managées : on
-- retombe sur une recherche simple plutôt que de faire échouer la migration.
create index nomenclature_label_idx on nomenclature (lower(label));

alter table nomenclature enable row level security;

-- Lecture ouverte : un texte réglementaire n'a rien de confidentiel, et le
-- cloisonner obligerait à en dupliquer une copie par cabinet.
create policy nomenclature_read on nomenclature for select using (true);

grant select on nomenclature to ryla_app;
-- Écriture réservée aux migrations et au script d'import : un cabinet ne
-- réécrit pas la CCAM. Ses tarifs à lui vivent sur les lignes de devis.
revoke insert, update, delete on nomenclature from ryla_app;

comment on table nomenclature is
  'Référentiel CCAM / NGAP. Alimenté par scripts/import-nomenclature.ts depuis les fichiers officiels.';
comment on column nomenclature.needs_review is
  'true tant que la ligne vient du jeu de départ et n''a pas été confrontée à la base officielle.';

-- Même garde-fou qu'en 0002, 0003 et 0006.
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
