import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FormularioNuevoGrupo } from "./formulario";

export default async function NuevoGrupoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Crear Grupo</h1>

      <FormularioNuevoGrupo />

      <a href="/grupos" className="text-center text-sm underline">
        Volver a mis Grupos
      </a>
    </main>
  );
}
