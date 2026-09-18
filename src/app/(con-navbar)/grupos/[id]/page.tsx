import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  obtenerGrupoPorId,
  listarMiembrosDeGrupo,
  ordenarPorRanking,
  ordenarAlfabeticamente,
  calcularRatio,
  calcularPartidasGanadasSimples,
} from "@/domain/grupos";
import { listarPartidasEnCursoDeGrupo } from "@/domain/partidas";
import { nombresDeEquipo, inicialesDeParticipante } from "@/domain/participantes";
import { sacarMiembroAction } from "./actions";
import { Invitar } from "./invitar";
import { EditarEstadisticas } from "./editar-estadisticas";
import { EditarVentanaInactividad } from "./editar-ventana-inactividad";

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
  const miembrosAlfabetico = ordenarAlfabeticamente(miembros);
  const formatearRatio = (puntos: number, partidasJugadas: number) => {
    const ratio = calcularRatio(puntos, partidasJugadas);
    return ratio === null ? "—" : ratio.toFixed(2);
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-7 p-6">
      <div className="flex flex-col gap-1">
        <a href="/grupos" className="text-sm font-bold text-accent no-underline hover:text-accent-dark">
          ← Mis Grupos
        </a>
        <h1 className="font-display text-2xl font-bold text-ink">{grupo.nombre}</h1>
      </div>

      {esAdmin && <Invitar grupoId={grupo.id} codigo={grupo.codigoInvitacion} />}
      {esAdmin && (
        <EditarVentanaInactividad
          grupoId={grupo.id}
          ventanaInactividadSegundos={grupo.ventanaInactividadSegundos}
        />
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Partidas en curso</h2>
          <a
            href={`/grupos/${grupo.id}/partidas/nueva`}
            className="text-sm font-bold text-accent no-underline hover:text-accent-dark"
          >
            Nueva Partida
          </a>
        </div>
        {partidasEnCurso.length === 0 ? (
          <p className="text-sm text-muted">No hay Partidas en curso.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {/* Cualquier miembro del Grupo puede entrar a ver el marcador
                de una Partida en curso, sea o no su Anotador (ver ticket
                #33, CONTEXT.md/Anotador) — la fila es un link para todos. */}
            {partidasEnCurso.map((partida) => (
              <li
                key={partida.id}
                className="rounded-2xl border-2 border-line bg-surface p-3.5 text-sm font-bold shadow-pop"
              >
                <a
                  href={`/grupos/${grupo.id}/partidas/${partida.id}`}
                  className="text-ink no-underline hover:text-accent"
                >
                  <p>
                    {nombresDeEquipo(partida.equipo1)}
                    {" vs. "}
                    {nombresDeEquipo(partida.equipo2)}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold text-ink">Ranking</h2>
        <div className="overflow-x-auto rounded-2xl border-2 border-line bg-surface shadow-pop">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b-2 border-line text-[10px] font-bold uppercase tracking-wide text-muted">
                <th className="w-16 p-2 text-center font-bold">Participante</th>
                <th className="p-2 text-right font-bold">Pts</th>
                <th className="p-2 text-right font-bold">PJ</th>
                <th className="p-2 text-right font-bold">PG</th>
                <th className="p-2 text-right font-bold" title="Victorias simples">
                  VS
                </th>
                <th className="p-2 text-right font-bold" title="Victorias dobles">
                  VD
                </th>
                <th className="p-2 text-right font-bold" title="Victorias triples">
                  VT
                </th>
                <th className="p-2 text-right font-bold">PP</th>
                <th className="p-2 text-right font-bold">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((miembro) => (
                <tr key={miembro.participanteId} className="border-b border-line font-bold last:border-0">
                  <td className="p-2">
                    <div className="flex flex-col items-center gap-1">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-accent-soft text-xs font-bold text-accent">
                        {inicialesDeParticipante(miembro)}
                      </span>
                      <span className="break-words text-center text-[10px] font-bold leading-tight text-ink">
                        {miembro.nombre || miembro.email}
                      </span>
                    </div>
                  </td>
                  <td className="p-2 text-right text-accent">{miembro.puntos}</td>
                  <td className="p-2 text-right text-muted">{miembro.partidasJugadas}</td>
                  <td className="p-2 text-right text-muted">{miembro.partidasGanadas}</td>
                  <td className="p-2 text-right text-muted">
                    {calcularPartidasGanadasSimples(miembro)}
                  </td>
                  <td className="p-2 text-right text-muted">{miembro.partidasGanadasDobles}</td>
                  <td className="p-2 text-right text-muted">{miembro.partidasGanadasTriples}</td>
                  <td className="p-2 text-right text-muted">{miembro.partidasPerdidas}</td>
                  <td className="p-2 text-right text-muted">
                    {formatearRatio(miembro.puntos, miembro.partidasJugadas)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold text-ink">Miembros</h2>
        <ul className="flex flex-col gap-2.5">
          {miembrosAlfabetico.map((miembro) => (
            <li
              key={miembro.participanteId}
              className="flex flex-col gap-2 rounded-2xl border-2 border-line bg-surface p-3.5 font-bold text-ink shadow-pop"
            >
              <div className="flex items-center justify-between">
                <span>
                  {miembro.nombre || miembro.email}
                  {miembro.participanteId === grupo.adminParticipanteId && (
                    <span className="ml-2 text-xs font-bold text-muted">(admin)</span>
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
                    <button type="submit" className="text-sm font-bold text-danger hover:text-danger/80">
                      Sacar
                    </button>
                  </form>
                )}
              </div>
              {esAdmin && (
                <EditarEstadisticas
                  grupoId={grupo.id}
                  participanteId={miembro.participanteId}
                  partidasJugadas={miembro.partidasJugadas}
                  partidasGanadas={miembro.partidasGanadas}
                  partidasGanadasDobles={miembro.partidasGanadasDobles}
                  partidasGanadasTriples={miembro.partidasGanadasTriples}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
