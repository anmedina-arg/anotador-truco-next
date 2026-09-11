import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerGrupoPorId, listarMiembrosDeGrupo, ordenarPorFrecuencia } from "@/domain/grupos";
import { FormularioNuevaPartida } from "./formulario";

export default async function NuevaPartidaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [grupo, miembros] = await Promise.all([
    obtenerGrupoPorId(id),
    listarMiembrosDeGrupo(id),
  ]);
  if (!grupo) {
    notFound();
  }

  const esMiembro = miembros.some((m) => m.participanteId === session.user.id);
  if (!esMiembro) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <a href={`/grupos/${grupo.id}`} className="text-sm underline">
        ← {grupo.nombre}
      </a>
      <h1 className="text-2xl font-bold">Nueva Partida</h1>

      <FormularioNuevaPartida grupoId={grupo.id} miembros={ordenarPorFrecuencia(miembros)} />
    </main>
  );
}
