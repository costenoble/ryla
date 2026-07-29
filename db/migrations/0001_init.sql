-- ===========================================================================
-- Ryla — schéma initial
--
-- Règles structurantes :
--  * Chaque table métier porte `tenant_id`. Aucun filtrage applicatif : c'est
--    le RLS (migration 0002) qui garantit l'isolation.
--  * Les réponses de santé ne sont jamais stockées en clair : `answers_enc`
--    contient un blob AES-256-GCM chiffré avec la clé du cabinet (enveloppe).
--  * `audit_log` est append-only et chaîné par hash : c'est la matière
--    première du dossier de preuve.
-- ===========================================================================

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Cabinets (tenants)
-- ---------------------------------------------------------------------------
create table tenants (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique
                      check (slug ~ '^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$'),
  name              text not null,
  -- 'dentaire' | 'esthetique' | 'mixte' : pilote la bibliothèque de modèles
  -- et le type de devis proposé.
  specialty         text not null default 'mixte'
                      check (specialty in ('dentaire', 'esthetique', 'mixte')),
  legal_name        text,
  siret             text,
  finess            text,
  address           jsonb not null default '{}'::jsonb,
  -- logo_url, primary_color, accent_color, email_sender_name…
  branding          jsonb not null default '{}'::jsonb,
  -- Mentions légales et DPO propres au cabinet : c'est lui le responsable de
  -- traitement, Ryla n'est que sous-traitant.
  dpo_contact       jsonb not null default '{}'::jsonb,
  legal_notice      text,
  -- Clé de chiffrement du cabinet, elle-même chiffrée par la KEK maître.
  dek_wrapped       bytea not null,
  dek_version       integer not null default 1,
  settings          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- ---------------------------------------------------------------------------
-- Utilisateurs du cabinet
-- ---------------------------------------------------------------------------
create table users (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  email             text not null,
  password_hash     text,
  full_name         text not null,
  role              text not null default 'practitioner'
                      check (role in ('owner', 'practitioner', 'assistant')),
  -- Identifiant RPPS / ADELI, repris sur les devis et les documents signés.
  rpps              text,
  speciality_label  text,
  -- Pro Santé Connect (e-CPS) : prévu en v2, prérequis d'un référencement Ségur.
  psc_subject       text unique,
  is_active         boolean not null default true,
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index users_tenant_email_idx on users (tenant_id, lower(email));

create table sessions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  token_hash        text not null unique,
  ip                inet,
  user_agent        text,
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index sessions_user_idx on sessions (tenant_id, user_id);

-- ---------------------------------------------------------------------------
-- Patients
--
-- L'identité reste en clair (protégée par RLS + chiffrement au repos de
-- l'hébergeur HDS) ; ce sont les *réponses de santé* qui sont chiffrées côté
-- application. Compromis assumé : sans identité requêtable, l'agenda et la
-- recherche cabinet deviennent inutilisables.
-- ---------------------------------------------------------------------------
create table patients (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  first_name        text not null,
  last_name         text not null,
  birth_date        date,
  email             text,
  phone             text,
  -- Mineur ou majeur protégé : la signature revient au représentant légal.
  needs_legal_representative boolean not null default false,
  legal_representative jsonb,
  external_ref      text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index patients_tenant_name_idx on patients (tenant_id, lower(last_name), lower(first_name));
create index patients_tenant_ref_idx on patients (tenant_id, external_ref);

-- ---------------------------------------------------------------------------
-- Formulaires : modèle + versions immuables
--
-- Une version publiée n'est jamais modifiée. Toute édition crée une version
-- suivante. `content_hash` scelle la définition exacte présentée au patient :
-- c'est ce qui permet de prouver *quel* texte a été signé.
-- ---------------------------------------------------------------------------
create table form_templates (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  key               text not null,
  title             text not null,
  description       text,
  kind              text not null
                      check (kind in ('questionnaire', 'consentement',
                                      'devis', 'droit_image')),
  specialty         text check (specialty in ('dentaire', 'esthetique', 'commun')),
  current_version_id uuid,
  -- Modèle issu de la bibliothèque Ryla (non éditable tant que non dupliqué).
  library_ref       text,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index form_templates_tenant_key_idx on form_templates (tenant_id, key);

create table form_versions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  template_id       uuid not null references form_templates(id) on delete cascade,
  version           integer not null,
  definition        jsonb not null,
  content_hash      text not null,
  published_at      timestamptz,
  created_by        uuid references users(id),
  created_at        timestamptz not null default now()
);
create unique index form_versions_template_version_idx on form_versions (template_id, version);

alter table form_templates
  add constraint form_templates_current_version_fk
  foreign key (current_version_id) references form_versions(id)
  deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- Envois / dossiers
-- ---------------------------------------------------------------------------
create table submissions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  template_id       uuid not null references form_templates(id) on delete restrict,
  form_version_id   uuid not null references form_versions(id) on delete restrict,
  patient_id        uuid references patients(id) on delete set null,
  status            text not null default 'draft'
                      check (status in ('draft', 'sent', 'in_progress',
                                        'completed', 'signed', 'expired',
                                        'revoked')),
  channel           text not null default 'link'
                      check (channel in ('link', 'kiosk', 'import')),
  locale            text not null default 'fr',
  -- Réponses chiffrées (AES-256-GCM, clé du cabinet). Contient également les
  -- détails de vigilance, qui sont eux aussi des données de santé.
  answers_enc       bytea,
  answers_iv        bytea,
  answers_tag       bytea,
  dek_version       integer,
  -- Empreinte des réponses en clair : preuve d'intégrité sans divulgation.
  answers_hash      text,
  -- Compteur en clair pour l'affichage en liste (« 3 alertes ») sans déchiffrer.
  vigilance_count   integer not null default 0,
  vigilance_max_level text check (vigilance_max_level in ('info', 'warning', 'critical')),
  assigned_to       uuid references users(id) on delete set null,
  created_by        uuid references users(id) on delete set null,
  sent_at           timestamptz,
  first_opened_at   timestamptz,
  completed_at      timestamptz,
  signed_at         timestamptz,
  expires_at        timestamptz,
  -- Anamnèse versionnée : dossier précédent du même patient, pour le diff.
  supersedes_id     uuid references submissions(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index submissions_tenant_status_idx on submissions (tenant_id, status, created_at desc);
create index submissions_tenant_patient_idx on submissions (tenant_id, patient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Liens magiques
--
-- Le jeton en clair n'est jamais stocké : seul son SHA-256 l'est. Un lien
-- perdu ne peut donc pas être rejoué depuis une fuite de base.
-- ---------------------------------------------------------------------------
create table access_tokens (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  submission_id     uuid not null references submissions(id) on delete cascade,
  token_hash        text not null unique,
  audience          text not null default 'patient'
                      check (audience in ('patient', 'legal_representative', 'practitioner')),
  max_uses          integer not null default 0,   -- 0 = illimité jusqu'à expiration
  used_count        integer not null default 0,
  expires_at        timestamptz not null,
  first_used_at     timestamptz,
  last_used_at      timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index access_tokens_submission_idx on access_tokens (tenant_id, submission_id);

-- ---------------------------------------------------------------------------
-- Signatures et faisceau de preuves
-- ---------------------------------------------------------------------------
create table signatures (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  submission_id     uuid not null references submissions(id) on delete cascade,
  signer_role       text not null
                      check (signer_role in ('patient', 'legal_representative',
                                             'practitioner', 'witness')),
  signer_name       text not null,
  signer_email      text,
  -- eIDAS : 'simple' en v1 (OTP + faisceau de preuves), 'advanced'/'qualified'
  -- délégués à un PSCE français en v2.
  level             text not null default 'simple'
                      check (level in ('simple', 'advanced', 'qualified')),
  otp_channel       text check (otp_channel in ('sms', 'email')),
  otp_verified_at   timestamptz,
  -- SHA-256 du PDF exact au moment de la signature.
  document_hash     text not null,
  document_id       uuid,
  signature_image   bytea,
  -- ip, user_agent, temps passé par section, cases de consentement cochées,
  -- version du document, horodatage serveur…
  proof             jsonb not null default '{}'::jsonb,
  signed_at         timestamptz not null default now()
);
create index signatures_submission_idx on signatures (tenant_id, submission_id);

create table otp_challenges (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  submission_id     uuid not null references submissions(id) on delete cascade,
  channel           text not null check (channel in ('sms', 'email')),
  destination_hint  text not null,           -- « ••••••ate89 », jamais en clair
  code_hash         text not null,
  attempts          integer not null default 0,
  max_attempts      integer not null default 5,
  expires_at        timestamptz not null,
  verified_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index otp_challenges_submission_idx on otp_challenges (tenant_id, submission_id);

-- ---------------------------------------------------------------------------
-- Documents générés (PDF horodatés)
-- ---------------------------------------------------------------------------
create table documents (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  submission_id     uuid references submissions(id) on delete cascade,
  quote_id          uuid,
  kind              text not null
                      check (kind in ('questionnaire', 'consentement', 'devis',
                                      'droit_image', 'dossier_preuve')),
  filename          text not null,
  storage_key       text not null,
  content_type      text not null default 'application/pdf',
  sha256            text not null,
  byte_size         integer,
  created_at        timestamptz not null default now()
);
create index documents_submission_idx on documents (tenant_id, submission_id);

alter table signatures
  add constraint signatures_document_fk
  foreign key (document_id) references documents(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Devis
--
-- `dentaire_cerfa_s3404` : devis conventionnel obligatoire (arrêté du
-- 31 oct. 2020) — codes CCAM, base de remboursement, RAC, panier de soins.
-- `esthetique` : devis obligatoire + délai de réflexion de 15 jours
-- (art. D6322-30 CSP), auquel on ne peut pas déroger.
-- ---------------------------------------------------------------------------
create table quotes (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  patient_id        uuid references patients(id) on delete set null,
  submission_id     uuid references submissions(id) on delete set null,
  practitioner_id   uuid references users(id) on delete set null,
  kind              text not null
                      check (kind in ('dentaire_cerfa_s3404', 'esthetique')),
  reference         text not null,
  status            text not null default 'draft'
                      check (status in ('draft', 'sent', 'accepted',
                                        'refused', 'expired', 'cancelled')),
  currency          text not null default 'EUR',
  total_amount_cents          bigint not null default 0,
  total_amo_cents             bigint not null default 0,
  total_amc_cents             bigint not null default 0,
  remaining_charge_cents      bigint not null default 0,
  validity_days     integer not null default 30,
  -- Délai de réflexion : nul pour le dentaire, 15 jours pour l'esthétique.
  reflection_period_days      integer not null default 0,
  reflection_starts_at        timestamptz,
  reflection_ends_at          timestamptz,
  accepted_at       timestamptz,
  refused_at        timestamptz,
  -- Champs bruts du CERFA / du devis esthétique, plus la trace d'import.
  payload           jsonb not null default '{}'::jsonb,
  import_source     text check (import_source in ('manual', 'email', 'print', 'api')),
  import_raw_document_id uuid references documents(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index quotes_tenant_reference_idx on quotes (tenant_id, reference);
create index quotes_tenant_status_idx on quotes (tenant_id, status, created_at desc);

alter table documents
  add constraint documents_quote_fk
  foreign key (quote_id) references quotes(id) on delete cascade;

create table quote_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  quote_id          uuid not null references quotes(id) on delete cascade,
  position          integer not null default 0,
  ccam_code         text,
  tooth_numbers     text[],
  description       text not null,
  -- Panier de soins (réforme 100 % santé) : mention obligatoire sur le CERFA.
  care_basket       text check (care_basket in ('panier_100_sante',
                                                'panier_maitrise',
                                                'panier_libre')),
  material          text,
  quantity          integer not null default 1,
  unit_price_cents  bigint not null default 0,
  base_reimbursement_cents bigint not null default 0,
  reimbursement_rate numeric(5,4) not null default 0.70,
  amo_cents         bigint not null default 0,
  amc_cents         bigint not null default 0,
  patient_cents     bigint not null default 0
);
create index quote_lines_quote_idx on quote_lines (tenant_id, quote_id, position);

-- ---------------------------------------------------------------------------
-- Droit à l'image (esthétique) — consentement granulaire et révocable
-- ---------------------------------------------------------------------------
create table image_rights_consents (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  patient_id        uuid references patients(id) on delete cascade,
  submission_id     uuid references submissions(id) on delete set null,
  scope             text not null
                      check (scope in ('dossier_medical', 'site_web',
                                       'reseaux_sociaux', 'publication_scientifique',
                                       'formation')),
  granted           boolean not null,
  granted_at        timestamptz,
  revoked_at        timestamptz,
  proof             jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create unique index image_rights_unique_idx
  on image_rights_consents (tenant_id, patient_id, scope, submission_id);

-- ---------------------------------------------------------------------------
-- Relances
-- ---------------------------------------------------------------------------
create table reminders (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  submission_id     uuid not null references submissions(id) on delete cascade,
  channel           text not null check (channel in ('email', 'sms')),
  scheduled_for     timestamptz not null,
  sent_at           timestamptz,
  status            text not null default 'pending'
                      check (status in ('pending', 'sent', 'cancelled', 'failed')),
  failure_reason    text,
  created_at        timestamptz not null default now()
);
create index reminders_due_idx on reminders (status, scheduled_for);

-- ---------------------------------------------------------------------------
-- Journal d'audit — append-only, chaîné par hash
--
-- Exigence RGPD (traçabilité des accès) *et* pièce maîtresse du dossier de
-- preuve : `prev_hash`/`hash` rendent toute suppression ou réécriture
-- détectable a posteriori.
-- ---------------------------------------------------------------------------
create table audit_log (
  id                bigint generated always as identity primary key,
  tenant_id         uuid not null references tenants(id) on delete cascade,
  occurred_at       timestamptz not null default now(),
  actor_type        text not null
                      check (actor_type in ('user', 'patient', 'system', 'anonymous')),
  actor_id          uuid,
  actor_label       text,
  action            text not null,
  object_type       text,
  object_id         uuid,
  ip                inet,
  user_agent        text,
  metadata          jsonb not null default '{}'::jsonb,
  prev_hash         text,
  hash              text not null
);
create index audit_log_tenant_time_idx on audit_log (tenant_id, occurred_at desc);
create index audit_log_object_idx on audit_log (tenant_id, object_type, object_id);

-- ---------------------------------------------------------------------------
-- updated_at automatique
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['tenants', 'users', 'patients', 'form_templates',
                           'submissions', 'quotes']
  loop
    execute format(
      'create trigger %I_touch_updated_at before update on %I
         for each row execute function app.touch_updated_at()', t, t);
  end loop;
end;
$$;
