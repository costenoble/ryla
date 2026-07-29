import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await currentSession();
  redirect(session ? "/tableau-de-bord" : "/connexion");
}
