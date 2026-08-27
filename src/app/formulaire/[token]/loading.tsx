import { Splash } from "@/components/Splash";

/**
 * Le patient ouvre ce lien depuis son téléphone, souvent en 4G : c'est là que
 * l'attente est la plus longue, et la page blanche la plus décourageante.
 */
export default function Loading() {
  return <Splash label="Ouverture de votre document…" />;
}
