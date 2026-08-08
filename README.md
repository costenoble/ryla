# Ryla

Questionnaires médicaux, consentements éclairés et devis conformes, avec le
dossier de preuve qui va avec.

Le questionnaire numérique est devenu une commodité — Doctolib le distribue
gratuitement depuis fin 2025. Ce qui ne l'est pas : prouver, deux ans plus tard,
*quel texte exact* un patient a lu, combien de temps il l'a lu, ce qu'il a
coché et à quelle seconde. C'est ce que Ryla produit, sur les deux verticales où
l'enjeu juridique est le plus fort : **chirurgie dentaire / implantologie** et
**médecine et chirurgie esthétique**.

---

## Démarrer

Prérequis : Node ≥ 20.11 et les binaires PostgreSQL (`brew install postgresql@16`).
Pas de Docker.

```bash
npm install
cp .env.example .env
npm run setup        # cluster local + migrations + jeu de démonstration
npm run dev
```

`npm run setup` affiche les identifiants de connexion et les liens patients à
ouvrir directement.

| Commande | Effet |
| --- | --- |
| `npm run db:up` / `db:down` | Démarre / arrête le cluster local (`./.pgdata`, port 54329) |
| `npm run db:psql` | Ouvre `psql` sur la base |
| `npm run db:reset` | Détruit le schéma et rejoue les migrations |
| `npm run db:destroy` | Supprime le cluster — la machine revient à son état initial |
| `npm test` | Suite de tests, dont l'isolation multi-tenant (nécessite la base) |
| `npm run smoke` | Parcours patient de bout en bout contre un serveur qui tourne |

Le cluster vit dans le répertoire du projet et n'est enregistré auprès d'aucun
service système. Pour utiliser un PostgreSQL existant, ignorez `scripts/pg.sh`
et pointez `DATABASE_URL` dessus.

---

## Direction artistique

Palette tirée du logo : l'**indigo** `#1a0844` comme surface de marque (colonne
latérale, panneaux), l'**orange** `#EA580C` du mot-clé en accent, et du blanc
pour tout le reste. Le **bleu** `#2563EB` s'intercale et porte les actions.

Deux règles tenues partout :

- **L'orange est un signal, pas une commodité.** Il porte les appels à l'action
  et les points de vigilance, jamais du texte courant sur fond clair — son
  contraste ne passe pas le 4,5:1 requis.
- **L'indigo ne sert jamais de couleur de donnée.** Le validateur de palette le
  recale hors de la bande de clarté admise pour une marque de graphique : il
  reste une surface, le bleu porte la courbe.

Typographie **Figtree**, jetons dans [`src/app/globals.css`](src/app/globals.css),
primitives dans [`src/components/ui.tsx`](src/components/ui.tsx). Une seule
échelle de rayons — trois valeurs proches choisies au hasard, c'est ce qui fait
« bricolé » avant même qu'on sache pourquoi.

**Animations** (framer-motion, [`src/components/motion.tsx`](src/components/motion.tsx)) :
150 à 320 ms, une seule courbe, et `prefers-reduced-motion` respecté — les
composants rendent alors l'état final sans transition.

Le **graphique** du tableau de bord est monosérie, donc sans légende (le titre
nomme la série), avec repère et infobulle au survol et un tableau équivalent
pour les lecteurs d'écran.

### Relire le rendu

```bash
npm run build:clean && npm start          # dans un terminal
npm run screenshots                        # dans un autre
```

Écrit huit captures dans `./screenshots` — espace praticien en 1440 px, portail
patient en 390 et 1280 px. Une classe mal orthographiée ne fait échouer aucun
test ; elle fait juste une interface fade.

⚠️ Lancer `next build` pendant que le serveur tourne corrompt `.next` : Tailwind
sert alors une feuille de styles périmée où les nouvelles valeurs arbitraires
manquent, sans le moindre message d'erreur. D'où `build:clean`.

---

## Les trois décisions structurantes

### 1. L'isolation est dans la base, pas dans le code

Chaque table porte `tenant_id`, chaque table a une politique RLS. L'application
n'écrit **jamais** `where tenant_id = …` : elle ouvre une transaction, pose
`SET LOCAL app.tenant_id`, et PostgreSQL fait le reste.

```ts
await withTenant({ tenantId, actorId }, async (tx) => {
  const patients = await tx`select * from patients`;   // filtré par le RLS
});
```

Conséquences :

- Un `where` oublié dans une requête ne peut pas provoquer de fuite entre
  cabinets. C'est le seul modèle qui résiste à une erreur d'inattention.
- Sans contexte, `app.current_tenant()` vaut `NULL`, toute comparaison échoue,
  et la requête ne renvoie **rien**. Échec fermé.
- Le rôle applicatif n'est ni superuser ni `BYPASSRLS`, et `assertRlsEnforced()`
  refuse de démarrer si `DATABASE_URL` pointe sur un rôle qui contourne le RLS.
- Deux exceptions, et deux seulement : `app.resolve_tenant_by_slug` et
  `app.resolve_access_token`, fonctions `SECURITY DEFINER` à surface minimale
  (recherche sur clé exacte, aucun champ sensible). Ce sont les deux lectures
  qui doivent avoir lieu *avant* de connaître le cabinet.

Testé dans [`src/lib/rls.test.ts`](src/lib/rls.test.ts) : lecture croisée,
écriture au nom d'un autre cabinet, déplacement d'une ligne, libération du
contexte en fin de transaction.

### 2. Les données de santé sont chiffrées par cabinet

Chiffrement en enveloppe : une KEK maître, une DEK par cabinet stockée chiffrée,
et les réponses en AES-256-GCM. Révoquer un cabinet, c'est détruire sa clé ; une
fuite de la base seule ne donne aucune réponse lisible.

L'identité des patients reste en clair — protégée par le RLS et le chiffrement
au repos de l'hébergeur. Compromis assumé : sans identité requêtable, la
recherche et l'agenda du cabinet deviennent inutilisables.

En liste, seuls le **compteur** d'alertes et le **niveau maximal** sont en clair.
Le détail est dans le blob chiffré : il faut ouvrir le dossier, et l'ouverture
est journalisée.

### 3. L'email ne transporte jamais de donnée de santé

Un questionnaire rempli ou un devis médical envoyé par email ordinaire est un
manquement à l'article 32 du RGPD. Les canaux admis sont MSSanté ou un portail
sécurisé — Ryla est le portail, l'email ne transporte que le lien.

L'objet compte autant que le corps : « Dr Martin — votre questionnaire
pré-opératoire » révèle par inférence qu'une intervention est prévue. Les
gabarits de [`src/lib/notifications.ts`](src/lib/notifications.ts) disent
« Vous avez un document à compléter ». Vers le praticien : « un document est
prêt », jamais le PDF en pièce jointe.

C'est une contrainte, et c'est l'argument commercial : zéro donnée de santé dans
les emails du cabinet.

---

## Le dossier de preuve

L'article L1111-2 du CSP met la charge de la preuve de l'information sur le
praticien. Un paraphe au bas d'un PDF ne prouve pas grand-chose. Ce que Ryla
assemble à chaque signature :

| Élément | Ce qu'il établit |
| --- | --- |
| Empreinte de la version du formulaire | Le texte exact affiché, non modifiable a posteriori |
| Empreinte des réponses | L'intégrité du contenu, sans le divulguer |
| Horodatages envoi / ouverture / saisie / signature | La chronologie réelle |
| Temps d'affichage par section | Le parcours de lecture — une signature obtenue en quatre secondes se voit |
| Déclarations cochées, horodatées une par une | Ce qui a été accepté, et quand |
| IP, user-agent, langue | Les circonstances de la signature |
| Tête de la chaîne d'audit | Le rattachement à un journal infalsifiable |

Le tout scellé par une empreinte, annexé au PDF, et vérifiable par
`verifyProofBundle()`.

**Le journal d'audit est append-only et chaîné par hash.** Le rôle applicatif n'a
ni `UPDATE` ni `DELETE` dessus, et chaque entrée intègre l'empreinte de la
précédente. Une falsification faite en contournant l'application — quelqu'un
avec un accès base direct qui antidate un consentement — casse la chaîne de
façon détectable. C'est testé.

**Le PDF ne contient pas sa propre empreinte** : ce serait circulaire, puisqu'il
embarque le dossier de preuve en annexe. Les deux scellements sont indépendants
— `proof.hash` scelle la preuve, `signatures.document_hash` scelle le PDF, et
les deux sont consignés au journal.

Niveau de signature : **simple** (eIDAS) en v1. C'est le faisceau qui lui donne
sa valeur probante. Le passage au niveau avancé via un prestataire de confiance
français (Yousign, Universign/Docaposte) est prévu pour les actes à fort enjeu,
facturable à l'acte.

---

## Le périmètre à ne pas franchir

Les messages de vigilance **décrivent une déclaration du patient** :

> Le patient déclare prendre un traitement anticoagulant ou antiagrégant.

Ils ne recommandent jamais une conduite à tenir (« reporter l'intervention »,
« contre-indiqué »). Une aide à la décision clinique ferait basculer Ryla dans
la catégorie **dispositif médical** au sens du règlement (UE) 2017/745 —
marquage CE, organisme notifié, autre métier.

`checkDescriptivePhrasing()` signale les formulations qui glissent vers la
prescription, et l'écran Modèles les affiche. Non bloquant : c'est un
garde-fou, pas un censeur.

---

## Contraintes légales implémentées

| Obligation | Où |
| --- | --- |
| Devis dentaire CERFA S3404 (arrêté du 31 oct. 2020) — CCAM, base de remboursement, RAC, panier de soins | [`src/lib/cerfa.ts`](src/lib/cerfa.ts) |
| Reste à charge nul garanti dans le panier 100 % santé | invariant testé |
| Information sur l'alternative sans reste à charge | `requiresZeroCostAlternative()` |
| Délai de réflexion de 15 jours en chirurgie esthétique (art. D6322-30 CSP), non dérogeable | [`src/lib/reflection.ts`](src/lib/reflection.ts) |
| Charge de la preuve de l'information (art. L1111-2 CSP) | [`src/lib/proof.ts`](src/lib/proof.ts) |
| Traçabilité des accès aux données de santé | [`src/lib/audit.ts`](src/lib/audit.ts) |
| Droit à l'image granulaire et révocable, usage par usage | table `image_rights_consents` |
| Représentant légal (mineurs, majeurs protégés) | `patients.needs_legal_representative`, audience `legal_representative` |

Le délai de réflexion démarre à la **remise du devis**, horodatée par la base
(`now()`), pas par le client. Il n'est pas pilotable depuis l'interface :
`acceptQuote()` refuse côté serveur tant qu'il n'est pas écoulé. L'encart de
l'écran Devis informe, il ne protège pas.

---

## Hébergement

**Ce projet n'a aucune adhérence à un fournisseur.** Pas de SDK Supabase, pas
d'ORM : du PostgreSQL standard, `postgres.js`, et des politiques RLS en SQL. Il
tourne sur n'importe quel PostgreSQL ≥ 14. Ce qui change d'un hébergeur à
l'autre, c'est la conformité — pas le code.

Après tout changement de `DATABASE_URL` :

```bash
npm run db:check
```

Ce diagnostic vérifie ce qui, mal configuré, ne produit **aucune erreur
visible** mais fait disparaître l'isolation entre cabinets.

### Étape actuelle — Vercel + Supabase, données fictives

Environnement de démonstration, le temps de valider le rendu et le parcours.
Ni Vercel ni Supabase ne sont certifiés HDS : **données fictives uniquement**,
la bascule OVH est prévue avant tout patient réel.

#### Base — Supabase

1. **Migrations** avec le rôle `postgres` (Session pooler, port 5432) :
   ```
   DATABASE_ADMIN_URL=postgres://postgres.<ref>:<mdp>@aws-0-<region>.pooler.supabase.com:5432/postgres
   npm run db:migrate
   ```
   La migration `0002_rls.sql` crée le rôle applicatif `ryla_app`.
2. **Changez immédiatement son mot de passe** — celui de la migration est un
   défaut de développement :
   ```sql
   alter role ryla_app with password '<mot de passe fort>';
   ```
3. **Application** avec `ryla_app`, sur le Transaction pooler (port 6543) :
   ```
   DATABASE_URL=postgres://ryla_app.<ref>:<mdp>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```
4. **Le seed n'est pas optionnel.** Sans lui il n'existe aucun cabinet ni aucun
   compte, et la connexion répond « Identifiants incorrects » — le schéma seul
   ne suffit pas :
   ```
   npm run db:seed
   npm run db:check
   ```

Si vous avez joué les fichiers `.sql` à la main dans l'éditeur SQL Supabase, le
suivi des migrations n'existe pas encore côté base. Enregistrez-le avant tout
autre `db:migrate`, sinon la prochaine exécution tentera de recréer des tables
existantes :

```bash
npm run db:baseline
```

#### Quand la base n'est pas joignable en PostgreSQL

Beaucoup de réseaux filtrent les ports 5432 et 6543, et Supabase a retiré
l'IPv4 des connexions directes : sans route IPv6, le poste ne peut tout
simplement pas ouvrir de session PostgreSQL. Le développement reste alors sur
le cluster local, et Supabase ne sert qu'au déploiement.

Pour créer un cabinet dans ce cas, générez le SQL et collez-le dans l'éditeur :

```bash
npm run cabinet:sql -- --slug=mon-cabinet --name="Mon Cabinet" \
  --email=praticien@exemple.fr --password='…' --specialty=dentaire \
  --app-password='…' > cabinet.sql
```

Tout ce qui doit être calculé hors base l'est côté script : la clé de
chiffrement du cabinet, l'empreinte scrypt du mot de passe, les empreintes des
modèles. Le mot de passe en clair n'apparaît jamais dans le fichier produit.

⚠️ **La clé `RYLA_KEK` doit être identique partout.** La clé du cabinet est
scellée avec elle au moment de la génération. Si l'application tourne ensuite
avec une autre KEK, la première lecture ou écriture de données de santé échoue
sur un message déroutant — « Unsupported state or unable to authenticate
data » — alors que tout le reste de l'application fonctionne.

Tant que l'ancienne KEK est connue, ce n'est pas perdu : `rewrap-dek.mjs`
re-scelle la clé du cabinet sans la changer, donc sans rendre illisible ce qui
a déjà été chiffré.

```bash
node scripts/rewrap-dek.mjs <dek_wrapped_hex> <ancienne_kek> <nouvelle_kek> <slug>
```

Si l'ancienne KEK est perdue, en revanche, les données de ce cabinet le sont
aussi — c'est le principe même du chiffrement.

Quand la connexion PostgreSQL est possible, la même opération tient en une
commande :

```bash
npm run cabinet:create -- --slug=mon-cabinet --name="Mon Cabinet" \
  --email=praticien@exemple.fr --password='…' --specialty=dentaire
```

Deux détails qui coûtent une soirée si on les découvre en production :

- Le pooler impose le suffixe `.<ref>` dans le nom d'utilisateur, y compris pour
  un rôle personnalisé.
- Un pooler en mode transaction ne rejoue pas les instructions préparées.
  `usesTransactionPooler()` le détecte (port 6543, hôte `pooler.`) et les
  désactive. `withTenant()` reste correct : le `SET LOCAL` est posé dans une
  transaction explicite, que le pooler épingle sur une connexion — c'est
  précisément pourquoi le contexte est transactionnel et pas attaché à la session.

Ne connectez **jamais** l'application avec le rôle `postgres` de Supabase. Il est
propriétaire des tables, et PostgreSQL exempte le propriétaire de ses propres
politiques : tous les cabinets deviendraient visibles les uns des autres, en
silence. `assertRlsEnforced()` refuse de démarrer dans ce cas.

Rien du SDK Supabase n'est utilisé — ni Auth, ni Storage, ni PostgREST. Seule la
chaîne de connexion PostgreSQL compte, donc la bascule vers OVH est un
changement de variable d'environnement.

#### Application — Vercel

Le système de fichiers y est éphémère et en lecture seule : un PDF écrit sur le
disque disparaît au déploiement suivant. C'est pourquoi `STORAGE_DRIVER` vaut
`postgres` par défaut — les documents signés vivent en base, soumis au même RLS
que le reste, et suivent la sauvegarde. [`vercel.json`](vercel.json) épingle la
région sur `cdg1` (Paris).

Variables à déclarer dans le projet Vercel :

| Variable | Valeur |
| --- | --- |
| `DATABASE_URL` | Transaction pooler Supabase, rôle `ryla_app` |
| `RYLA_KEK` | 32 octets en base64 — `openssl rand -base64 32` |
| `RYLA_TOKEN_SECRET` | `openssl rand -base64 48` |
| `APP_BASE_URL` | l'URL du déploiement — c'est elle qui construit les liens patients |
| `APP_TENANT_DOMAIN` | même domaine, sans protocole |
| `STORAGE_DRIVER` | `postgres` |

`DATABASE_ADMIN_URL` n'a rien à faire sur Vercel : les migrations se jouent
depuis votre poste.

Générez des clés propres même pour la démonstration. Celles du `.env.example`
sont publiques, et repartir d'une base chiffrée avec une clé connue au moment de
la bascule OVH n'aurait aucun sens.

### Étape suivante — OVHcloud, sous périmètre HDS

⚠️ **La commande « Hébergement Pro + Web Cloud Databases » ne convient pas.**
Deux raisons, indépendantes l'une de l'autre :

- L'**hébergement web mutualisé** d'OVHcloud exécute du PHP. Ryla est une
  application Next.js qui a besoin d'un runtime Node. Elle ne démarrera pas.
- **Web Cloud Databases** n'est pas le produit certifié : le périmètre HDS
  couvre **Managed Relational Database**, qui relève de Public Cloud Databases.
  Ce sont deux gammes différentes.

L'architecture qui tient :

| Composant | Produit OVHcloud | Remarque |
| --- | --- | --- |
| PostgreSQL | **Public Cloud Databases** (Managed Relational Database) | Sauvegardes et correctifs opérés par OVH |
| Application Next.js | **Managed Containers** ou Public Cloud Instances | Runtime Node |
| PDF signés | **Object Storage** | `STORAGE_DRIVER=s3` — le pilote reste à écrire dans [`src/lib/storage.ts`](src/lib/storage.ts) |
| KEK maître | **OVHcloud KMS** | C'est là que doit vivre `RYLA_KEK`, pas dans une variable d'environnement |

Le nom de domaine `ryla.fr`, le DNS Anycast et DNSSEC, eux, sont à garder : ils
ne posent aucun problème et servent dès maintenant.

Ce que la bascule demandera côté code : écrire le pilote `s3` (le contrat
`DocumentStore` fait quatre lignes), lire `RYLA_KEK` depuis le KMS plutôt que
d'une variable d'environnement, et migrer le contenu de `document_blobs` vers le
bucket. Le reste ne bouge pas.

Trois points à ne pas manquer :

1. **Un abonnement support Business ou Enterprise est obligatoire** pour utiliser
   les produits sous périmètre HDS, et l'option HDS doit être activée dans
   l'espace client. Coût fixe à intégrer au business plan — c'est la vraie
   différence de prix, pas la base de données.
2. Faites signer l'**avenant Healthcare** OVHcloud. Sans lui, la certification de
   l'hébergeur ne vous couvre pas contractuellement.
3. Le référentiel **HDS 2.0 est pleinement en vigueur depuis le 16 mai 2026** :
   vérifiez la version du certificat de votre prestataire.

Point à trancher avec un conseil : administrer vous-mêmes le système contenant
les données de santé relève de l'**activité 5** du référentiel (administration et
exploitation) et peut vous imposer votre propre certification. Rester sur des
services **managés** plutôt que sur des VM que vous administrez est ce qui réduit
le plus cette exposition.

---

## Ce qui n'est pas fait

Honnêteté sur le périmètre, pour éviter les mauvaises surprises :

- **Éditeur de formulaires visuel** — la bibliothèque est en TypeScript,
  versionnée et relue ([`src/lib/library/`](src/lib/library/)). Le moteur de
  publication de versions existe (`publishVersion()`), l'interface d'édition
  non.
- **Import PDF → formulaire** par LLM. C'est le meilleur levier d'onboarding du
  produit et il reste à construire.
- **Import de devis** par email dédié ou imprimante virtuelle.
- **Envoi réel** — `consoleNotifier` écrit dans la console. Brancher un
  transactionnel et un SMS.
- **Pilote de stockage objet** (`STORAGE_DRIVER=s3`), nécessaire à la bascule
  OVH. En attendant, les PDF vivent dans `document_blobs`.
- **OTP par SMS** — la table `otp_challenges` et le champ `requireOtp` existent,
  la vérification n'est pas câblée.
- **Limitation de débit sur la connexion** — les échecs sont journalisés, mais
  il manque un compteur (Redis ou table dédiée).
- **Relances automatiques** — la table `reminders` existe, pas l'ordonnanceur.
- **Paiement d'acompte**, mode kiosque, multilingue (le schéma prévoit `i18n` et
  `availableLocales`, les traductions ne sont pas écrites), Pro Santé Connect.
- **Rotation des clés** — `dek_version` est en place, la procédure de rotation
  n'est pas écrite.

Le mot de passe du rôle `ryla_app` est en clair dans
[`db/migrations/0002_rls.sql`](db/migrations/0002_rls.sql) — défaut de
développement. **À créer hors migration et à faire tourner en production.**

---

## Organisation du code

```
db/migrations/     Schéma et politiques RLS, en SQL brut — c'est ce qu'on relit en audit
src/lib/           Logique métier, sans dépendance à Next.js
  db.ts            withTenant() : le seul chemin d'accès aux données
  crypto.ts        Enveloppe, empreintes canoniques, jetons, mots de passe
  branching.ts     Moteur conditionnel — partagé client et serveur
  vigilance.ts     Alertes descriptives + garde-fou rédactionnel
  proof.ts         Faisceau de preuves
  audit.ts         Journal chaîné
  cerfa.ts         Calculs du devis conventionnel
  reflection.ts    Délai de réflexion
  library/         Bibliothèque de modèles — l'actif difficile à copier
  repos/           Requêtes, sans filtrage par tenant (c'est le rôle du RLS)
src/app/p/[token]/ Portail patient
src/app/(praticien)/ Espace cabinet
```

Le moteur de branching est **le même** côté client et côté serveur. Ce qui
s'affiche est ce qui est validé, et une réponse à une question masquée est
écartée avant d'entrer au dossier — sinon une donnée que le patient n'a jamais
vue finirait dans un document signé.
