import { redirect } from "next/navigation";

/**
 * La liste à plat des dossiers a été remplacée par la liste des patients.
 *
 * Un cabinet pense « Julien Bertrand », pas « dossier 58dffb6c » : les
 * documents se lisent depuis la fiche du patient. La redirection reste pour
 * les liens déjà en circulation et les signets.
 */
export default function DossiersRedirect() {
  redirect("/patients");
}
