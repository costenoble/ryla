"use server";

import { cookies } from "next/headers";
import { recordAudit } from "@/lib/audit";
import { requestContext } from "@/lib/auth";
import { generateDek, hashPassword, wrapDek } from "@/lib/crypto";
import { withPrivileged, withTenant } from "@/lib/db";
import { DPA_VERSION } from "@/lib/dpa";
import { env } from "@/lib/env";
import { parseFormDefinition } from "@/lib/form-schema";
import { librarySelection } from "@/lib/library";
import { createSession, SESSION_COOKIE, SESSION_TTL_DAYS } from "@/lib/session";
import { createTemplate, getTemplateByKey } from "@/lib/repos/forms";
import { resolveTenantBySlug } from "@/lib/tenant";

/**
 * Création d'un cabinet depuis l'application.
 *
 * Jusqu'ici, ouvrir un cabinet demandait un script et un accès à la base. C'est
 * tenable pour une démonstration, pas pour un produit.
 *
 * L'inscription est ouverte, et restreignable de deux façons :
 * `RYLA_SIGNUP_CODE` exige un code d'invitation, `RYLA_SIGNUP=closed` referme
 * entièrement la porte.
 *
 * Elle était fermée par défaut en production. L'intention était bonne — un
 * formulaire créant des espaces destinés à des données de santé n'a rien
 * d'anodin — mais le résultat était une vitrine dont le bouton principal
 * renvoyait un 404. Une porte d'entrée cassée coûte plus cher que le risque
 * qu'elle évitait.
 *
 * Le mot de passe du praticien est haché en scrypt, et la clé de chiffrement du
 * cabinet est scellée avec la KEK du serveur. Si celle-ci change ensuite, les
 * données du cabinet deviennent illisibles : c'est le principe même du
 * chiffrement en enveloppe, et c'est documenté dans le README.
 */

export type SignupState =
  | { status: "idle" }
  | { status: "error"; message: string; field?: string }
  | { status: "created"; slug: string };

/** Slug technique du cabinet, dérivé du nom mais corrigeable à la saisie. */
export async function slugify(input: string): Promise<string> {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function signupOpen(): Promise<boolean> {
  return !env.signupClosed;
}

export async function createCabinet(
  _previous: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const client = await requestContext();

  if (!(await signupOpen())) {
    return {
      status: "error",
      message:
        "L'inscription en ligne est fermée. Contactez Ryla pour faire créer votre cabinet.",
    };
  }

  // Le code est vérifié avant tout le reste : inutile de hacher un mot de passe
  // pour quelqu'un qui n'a pas d'invitation.
  const expected = env.signupCode;
  if (expected) {
    const provided = String(formData.get("invitation") ?? "").trim();
    if (provided !== expected) {
      return {
        status: "error",
        field: "invitation",
        message: "Code d'invitation incorrect.",
      };
    }
  }

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const specialty = String(formData.get("specialty") ?? "mixte");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const rpps = String(formData.get("rpps") ?? "").trim();

  if (!name) return { status: "error", field: "name", message: "Nom du cabinet manquant." };
  if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(slug)) {
    return {
      status: "error",
      field: "slug",
      message: "L'identifiant ne peut contenir que des minuscules, des chiffres et des tirets.",
    };
  }
  if (!["dentaire", "esthetique", "mixte"].includes(specialty)) {
    return { status: "error", field: "specialty", message: "Spécialité inconnue." };
  }
  if (!fullName) {
    return { status: "error", field: "fullName", message: "Votre nom est manquant." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { status: "error", field: "email", message: "Adresse email invalide." };
  }
  // Ce compte ouvre des dossiers médicaux : le refus est volontairement sec.
  if (password.length < 10) {
    return {
      status: "error",
      field: "password",
      message: "Le mot de passe doit faire au moins 10 caractères.",
    };
  }
  if (rpps && !/^\d{9}$|^\d{11}$/.test(rpps.replace(/\s/g, ""))) {
    return {
      status: "error",
      field: "rpps",
      message: "L'identifiant doit comporter 11 chiffres (RPPS) ou 9 (ADELI).",
    };
  }
  // Article 28.3 du RGPD : la relation responsable de traitement / sous-traitant
  // doit être régie par un contrat écrit. Sans lui, le cabinet est en
  // infraction dès la première donnée saisie — et Ryla avec lui. On refuse donc
  // de créer l'espace, plutôt que de le créer non conforme.
  if (formData.get("dpa") !== "on") {
    return {
      status: "error",
      field: "dpa",
      message:
        "L'acceptation du contrat de sous-traitance est obligatoire : c'est lui qui " +
        "rend le traitement de données de santé licite.",
    };
  }

  if (await resolveTenantBySlug(slug)) {
    return {
      status: "error",
      field: "slug",
      message: `L'identifiant « ${slug} » est déjà pris. Choisissez-en un autre.`,
    };
  }

  try {
    const rows = await withPrivileged(
      (sql) => sql<{ provision_tenant: string }[]>`
        select app.provision_tenant(${slug}, ${name}, ${specialty}, ${wrapDek(generateDek())})
      `,
    );
    const tenantId = rows[0]?.provision_tenant;
    if (!tenantId) throw new Error("Création du cabinet impossible.");

    const cookieValue = await withTenant({ tenantId }, async (tx) => {
      // Horodatage serveur, jamais une date fournie par le client — c'est la
      // règle qu'on applique aux signatures des patients, il n'y avait aucune
      // raison d'être moins exigeant avec la nôtre.
      await tx`
        update tenants set
          dpa_version = ${DPA_VERSION},
          dpa_accepted_at = now(),
          dpa_accepted_by = ${`${fullName} <${email}>`},
          dpa_accepted_ip = ${client.ip}::inet
        where id = ${tenantId}
      `;

      const [user] = await tx<{ id: string }[]>`
        insert into users (tenant_id, email, password_hash, full_name, role, rpps)
        values (${tenantId}, ${email}, ${hashPassword(password)}, ${fullName}, 'owner',
                ${rpps.replace(/\s/g, "") || null})
        returning id
      `;
      if (!user) throw new Error("Création du compte impossible.");

      // La bibliothèque est installée d'emblée : un espace vide ne se prend pas
      // en main, et ces modèles sont l'essentiel de ce qu'on apporte le
      // premier jour.
      for (const entry of librarySelection(specialty as "dentaire" | "esthetique" | "mixte")) {
        if (await getTemplateByKey(tx, entry.key)) continue;
        const definition = parseFormDefinition(entry.definition);
        await createTemplate(tx, {
          tenantId,
          key: entry.key,
          title: definition.title,
          description: definition.intro ?? null,
          kind: entry.kind,
          specialty: entry.specialty,
          libraryRef: entry.libraryRef,
          definition,
          createdBy: user.id,
        });
      }

      await recordAudit(tx, tenantId, {
        actorType: "system",
        action: "tenant.created",
        objectType: "user",
        objectId: user.id,
        ip: client.ip,
        userAgent: client.userAgent,
        metadata: { slug, email, specialty, dpaVersion: DPA_VERSION },
      });

      const session = await createSession(tx, {
        tenantId,
        tenantSlug: slug,
        userId: user.id,
        ip: client.ip,
        userAgent: client.userAgent,
      });
      return session.cookieValue;
    });

    const store = await cookies();
    store.set(SESSION_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProduction,
      path: "/",
      maxAge: SESSION_TTL_DAYS * 86_400,
    });

    return { status: "created", slug };
  } catch (error) {
    const message = error instanceof Error ? error.message : "La création a échoué.";
    if (message.includes("users_tenant_email_idx")) {
      return { status: "error", field: "email", message: "Cette adresse est déjà utilisée." };
    }
    return { status: "error", message };
  }
}
