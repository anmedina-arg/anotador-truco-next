import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerGrupoPorId, listarMiembrosDeGrupo } from "@/domain/grupos";
import { regenerarCodigoInvitacionAction, sacarMiembroAction } from "./actions";
import { LinkInvitacion } from "./link-invitacion";

export default async function GrupoDetallePage({
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

  const esAdmin = grupo.adminParticipanteId === session.user.id;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <div>
        <a href="/grupos" className="text-sm underline">
          ← Mis Grupos
        </a>
        <h1 className="text-2xl font-bold">{grupo.nombre}</h1>
      </div>

      {esAdmin && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Invitar</h2>
          <LinkInvitacion codigo={grupo.codigoInvitacion} />
          <form action={regenerarCodigoInvitacionAction}>
            <input type="hidden" name="grupoId" value={grupo.id} />
            <button type="submit" className="text-sm underline">
              Generar un código nuevo (invalida el anterior)
            </button>
          </form>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Miembros</h2>
        <ul className="flex flex-col gap-2">
          {miembros.map((miembro) => (
            <li
              key={miembro.participanteId}
              className="flex items-center justify-between rounded border p-3"
            >
              <span>
                {miembro.nombre || miembro.email}
                {miembro.participanteId === grupo.adminParticipanteId && (
                  <span className="ml-2 text-xs text-gray-500">(admin)</span>
                )}
              </span>
              {esAdmin && miembro.participanteId !== grupo.adminParticipanteId && (
                <form action={sacarMiembroAction}>
                  <input type="hidden" name="grupoId" value={grupo.id} />
                  <input
                    type="hidden"
                    name="participanteId"
                    value={miembro.participanteId}
                  />
                  <button type="submit" className="text-sm text-red-600 underline">
                    Sacar
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
