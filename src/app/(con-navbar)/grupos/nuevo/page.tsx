import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FormularioNuevoGrupo } from "./formulario";

export default async function NuevoGrupoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 p-6">
      <h1 className="font-display text-3xl font-bold text-ink">Crear Grupo</h1>

      <FormularioNuevoGrupo />

      <a href="/grupos" className="text-center text-sm font-bold text-accent no-underline hover:text-accent-dark">
        Volver a mis Grupos
      </a>
    </main>
  );
}
