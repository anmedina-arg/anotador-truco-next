import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listarGruposDeParticipante } from "@/domain/grupos";

export default async function GruposPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const grupos = await listarGruposDeParticipante(session.user.id);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6 pt-16">
      {/* pt-16: el link "Crear Grupo" de abajo queda pegado arriba a la
          derecha, justo donde flota el círculo de perfil. */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis Grupos</h1>
        <a href="/grupos/nuevo" className="underline">
          Crear Grupo
        </a>
      </div>

      {grupos.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no sos parte de ningún Grupo.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {grupos.map((grupo) => (
            <li key={grupo.id} className="rounded border p-3">
              <a href={`/grupos/${grupo.id}`} className="underline">
                {grupo.nombre}
              </a>
              {grupo.adminParticipanteId === session.user.id && (
                <span className="ml-2 text-xs text-gray-500">(admin)</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
