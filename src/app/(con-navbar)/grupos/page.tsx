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
    <main className="mx-auto flex max-w-md flex-col gap-5 p-6 pt-16">
      {/* pt-16: el link "Crear Grupo" de abajo queda pegado arriba a la
          derecha, justo donde flota el círculo de perfil. */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Mis Grupos</h1>
        <a href="/grupos/nuevo" className="text-sm font-bold text-accent no-underline hover:text-accent-dark">
          Crear Grupo
        </a>
      </div>

      {grupos.length === 0 ? (
        <p className="text-sm text-muted">Todavía no sos parte de ningún Grupo.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {grupos.map((grupo) => (
            <li key={grupo.id} className="rounded-2xl border-2 border-line bg-surface p-3.5 shadow-pop">
              <a href={`/grupos/${grupo.id}`} className="font-bold text-ink no-underline hover:text-accent">
                {grupo.nombre}
              </a>
              {grupo.adminParticipanteId === session.user.id && (
                <span className="ml-2 text-xs font-bold text-muted">(admin)</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
