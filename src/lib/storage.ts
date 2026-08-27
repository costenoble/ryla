import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Tx } from "./db";
import { env } from "./env";

/**
 * Stockage des documents générés.
 *
 * Un PDF de consentement signé est une donnée de santé, au même titre que les
 * réponses. Le magasin est donc toujours ouvert depuis une transaction déjà
 * placée dans le contexte d'un cabinet : impossible d'écrire ou de lire un
 * document sans savoir à qui il appartient.
 *
 * Trois pilotes :
 *   postgres — par défaut. Portable, soumis au RLS, suit la sauvegarde de la
 *              base. Seul choix viable sur une plateforme serverless, dont le
 *              système de fichiers est éphémère.
 *   local    — développement, écrit dans ./storage.
 *   s3       — cible de production : bucket sous périmètre HDS (Object Storage
 *              OVHcloud). À brancher au moment de la migration.
 */

export type StoredObject = {
  key: string;
  byteSize: number;
};

export interface DocumentStore {
  put(key: string, data: Uint8Array): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
}

export function buildStorageKey(params: {
  tenantId: string;
  submissionId: string;
  kind: string;
  filename: string;
}): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${params.tenantId}/${date}/${params.submissionId}/${params.kind}-${params.filename}`;
}

// ---------------------------------------------------------------------------
// Pilote PostgreSQL
// ---------------------------------------------------------------------------

function postgresStore(tx: Tx, tenantId: string): DocumentStore {
  return {
    async put(key, data) {
      const content = Buffer.from(data);
      await tx`
        insert into document_blobs (storage_key, tenant_id, content, byte_size)
        values (${key}, ${tenantId}, ${content}, ${content.byteLength})
        on conflict (storage_key) do update
          set content = excluded.content, byte_size = excluded.byte_size
      `;
      return { key, byteSize: content.byteLength };
    },

    async get(key) {
      // Pas de `where tenant_id` : le RLS s'en charge. Une clé appartenant à
      // un autre cabinet ne renvoie simplement aucune ligne.
      const [row] = await tx<{ content: Uint8Array }[]>`
        select content from document_blobs where storage_key = ${key}
      `;
      if (!row) throw new Error(`Document introuvable : ${key}`);
      return Buffer.from(row.content);
    },
  };
}

// ---------------------------------------------------------------------------
// Pilote local
// ---------------------------------------------------------------------------

function localPath(key: string): string {
  // `turbopackIgnore` : ce chemin est construit à l'exécution, et l'analyse
  // statique de Next en conclut qu'il faut embarquer tout le projet — sources
  // et dossier public compris — dans le paquet serveur. Le pilote local ne sert
  // qu'en développement : en production `STORAGE_DRIVER` vaut `postgres`, et
  // demain `s3`. Le signaler évite de déployer des mégaoctets inutiles.
  const root = resolve(/* turbopackIgnore: true */ process.cwd(), env.storageLocalDir);
  const target = resolve(root, key);
  // Un `..` dans une clé sortirait du répertoire de stockage.
  if (!target.startsWith(root)) throw new Error("Clé de stockage invalide.");
  return target;
}

const localStore: DocumentStore = {
  async put(key, data) {
    const path = localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return { key, byteSize: data.byteLength };
  },

  async get(key) {
    return readFile(localPath(key));
  },
};

// ---------------------------------------------------------------------------

/**
 * Ouvre le magasin de documents pour le cabinet en contexte.
 *
 * `tx` est exigé même par les pilotes qui ne s'en servent pas : ça garantit
 * que tout accès document se fait dans une transaction dont le contexte de
 * tenant est déjà posé.
 */
export function documentStore(tx: Tx, tenantId: string): DocumentStore {
  switch (env.storageDriver) {
    case "postgres":
      return postgresStore(tx, tenantId);
    case "local":
      return localStore;
    case "s3":
      throw new Error(
        "Pilote de stockage « s3 » non implémenté. Branchez ici le client S3 " +
          "du bucket Object Storage sous périmètre HDS.",
      );
    default:
      throw new Error(`Pilote de stockage inconnu : ${env.storageDriver}`);
  }
}
