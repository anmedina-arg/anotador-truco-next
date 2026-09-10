import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  obtenerGrupoPorId,
  listarMiembrosDeGrupo,
  ordenarPorRanking,
  calcularRatio,
} from "@/domain/grupos";
import { listarPartidasEnCursoDeGrupo } from "@/domain/partidas";
import { nombresDeEquipo } from "@/domain/participantes";
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

  const [grupo, miembros, partidasEnCurso] = await Promise.all([
    obtenerGrupoPorId(id),
    listarMiembrosDeGrupo(id),
    listarPartidasEnCursoDeGrupo(id),
  ]);
  if (!grupo) {
    notFound();
  }

  const esMiembro = miembros.some((m) => m.participanteId === session.user.id);
  if (!esMiembro) {
    notFound();
  }

  const esAdmin = grupo.adminParticipanteId === session.user.id;
  const ranking = ordenarPorRanking(miembros);
  const formatearRatio = (puntos: number, partidasJugadas: number) => {
    const ratio = calcularRatio(puntos, partidasJugadas);
    return ratio === null ? "—" : ratio.toFixed(2);
  };

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
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Partidas en curso</h2>
          <a href={`/grupos/${grupo.id}/partidas/nueva`} className="text-sm underline">
            Nueva Partida
          </a>
        </div>
        {partidasEnCurso.length === 0 ? (
          <p className="text-sm text-gray-500">No hay Partidas en curso.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {partidasEnCurso.map((partida) => {
              const detalle = (
                <p>
                  {nombresDeEquipo(partida.equipo1)}
                  {" vs. "}
                  {nombresDeEquipo(partida.equipo2)}
                </p>
              );
              const esAnotador = partida.anotadorParticipanteId === session.user.id;

              return (
                <li key={partida.id} className="rounded border p-3 text-sm">
                  {esAnotador ? (
                    <a href={`/grupos/${grupo.id}/partidas/${partida.id}`} className="underline">
                      {detalle}
                    </a>
                  ) : (
                    detalle
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Ranking</h2>
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="p-2 text-left font-normal">Participante</th>
                <th className="p-2 text-right font-normal">Pts</th>
                <th className="p-2 text-right font-normal">PJ</th>
                <th className="p-2 text-right font-normal">PG</th>
                <th className="p-2 text-right font-normal">PP</th>
                <th className="p-2 text-right font-normal">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((miembro) => (
                <tr key={miembro.participanteId} className="border-b last:border-0">
                  <td className="p-2">{miembro.nombre || miembro.email}</td>
                  <td className="p-2 text-right">{miembro.puntos}</td>
                  <td className="p-2 text-right">{miembro.partidasJugadas}</td>
                  <td className="p-2 text-right">{miembro.partidasGanadas}</td>
                  <td className="p-2 text-right">{miembro.partidasPerdidas}</td>
                  <td className="p-2 text-right">
                    {formatearRatio(miembro.puntos, miembro.partidasJugadas)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
