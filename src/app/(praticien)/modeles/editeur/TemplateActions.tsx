"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import {
  archiveTemplate,
  duplicateTemplate,
  type ArchiveState,
  type DuplicateState,
} from "@/lib/actions/templates";

/**
 * Dupliquer / archiver un modèle.
 *
 * Il n'y a volontairement pas de suppression : un modèle porte les versions
 * qu'ont affichées des dossiers signés. L'archivage le retire de la liste
 * d'envoi, sans rompre ce lien.
 */
export function TemplateActions({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [duplicateState, duplicate, duplicating] = useActionState<
    DuplicateState,
    FormData
  >(duplicateTemplate, { status: "idle" });
  const [archiveState, archive, archiving] = useActionState<ArchiveState, FormData>(
    archiveTemplate,
    { status: "idle" },
  );
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    if (duplicateState.status === "duplicated") {
      router.push(`/modeles/${duplicateState.templateId}`);
    }
  }, [duplicateState, router]);

  useEffect(() => {
    if (archiveState.status === "archived") router.push("/modeles");
  }, [archiveState, router]);

  const error =
    duplicateState.status === "error"
      ? duplicateState.message
      : archiveState.status === "error"
        ? archiveState.message
        : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={duplicate}>
        <input type="hidden" name="templateId" value={templateId} />
        <Button type="submit" variant="outline" size="sm" disabled={duplicating}>
          {duplicating ? "Duplication…" : "Dupliquer"}
        </Button>
      </form>

      {confirmArchive ? (
        <form action={archive} className="flex items-center gap-2">
          <input type="hidden" name="templateId" value={templateId} />
          <span className="text-xs text-muted">Retirer de la liste d'envoi ?</span>
          <Button type="submit" variant="accent" size="sm" disabled={archiving}>
            {archiving ? "…" : "Confirmer"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmArchive(false)}
          >
            Annuler
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmArchive(true)}
        >
          Archiver
        </Button>
      )}

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
