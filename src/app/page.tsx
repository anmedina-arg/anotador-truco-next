import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  obtenerGrupoMasAntiguoDeParticipante,
  listarMiembrosDeGrupo,
  ordenarPorRanking,
} from "@/domain/grupos";
import { listarPartidasEnCursoDeGrupo, esAnotadorDePartida } from "@/domain/partidas";
import { nombreDeParticipante } from "@/domain/participantes";
import { PerfilFlotante } from "@/components/perfil-flotante";

const TOP_RANKING = 3;

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const grupo = await obtenerGrupoMasAntiguoDeParticipante(session.user.id);

  let partidaEnCursoId: string | null = null;
  let ranking: Awaited<ReturnType<typeof listarMiembrosDeGrupo>> = [];

  if (grupo) {
    const [partidasEnCurso, miembros] = await Promise.all([
      listarPartidasEnCursoDeGrupo(grupo.id),
      listarMiembrosDeGrupo(grupo.id),
    ]);

    // Solo el Anotador de una Partida puede ver su tanteador en vivo — ver
    // CONTEXT.md / historia de usuario 26 del ticket #1.
    partidaEnCursoId =
      partidasEnCurso.find((p) => esAnotadorDePartida(p, session.user.id))?.id ?? null;
    ranking = ordenarPorRanking(miembros).slice(0, TOP_RANKING);
  }

  return (
    <>
      <PerfilFlotante nombre={session.user.name} email={session.user.email} />

      <main className="mx-auto flex max-w-md flex-col gap-7 p-6 pt-16">
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold text-ink">Mis Grupos</h2>
          {grupo ? (
            <a
              href={`/grupos/${grupo.id}`}
              className="rounded-2xl border-2 border-line bg-surface p-4 text-sm font-bold text-ink no-underline shadow-pop"
            >
              {grupo.nombre}
            </a>
          ) : (
            <p className="text-sm text-muted">
              Todavía no sos parte de ningún Grupo.{" "}
              <a href="/grupos/nuevo" className="font-bold text-accent no-underline hover:text-accent-dark">
                Creá uno
              </a>
              .
            </p>
          )}
        </section>

        {grupo && partidaEnCursoId && (
          <section>
            <a
              href={`/grupos/${grupo.id}/partidas/${partidaEnCursoId}`}
              className="block rounded-2xl bg-accent p-4 text-center text-sm font-display font-bold text-white no-underline shadow-pop-accent"
            >
              Ver el tanteador de tu Partida en curso
            </a>
          </section>
        )}

        {grupo && (
          <section>
            <a
              href={`/grupos/${grupo.id}/partidas/nueva`}
              className="block rounded-2xl bg-accent2 p-4 text-center text-sm font-display font-bold text-white no-underline shadow-pop-accent2"
            >
              Nueva Partida
            </a>
          </section>
        )}

        {grupo && ranking.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-bold text-ink">Ranking</h2>
            <ul className="flex flex-col gap-2.5">
              {ranking.map((miembro, indice) => (
                <li
                  key={miembro.participanteId}
                  className="flex items-center justify-between rounded-2xl border-2 border-line bg-surface p-3 text-sm font-bold"
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full font-display text-xs ${
                        indice === 0 ? "bg-accent2 text-white" : "bg-line text-muted"
                      }`}
                    >
                      {indice + 1}
                    </span>
                    {nombreDeParticipante(miembro)}
                  </span>
                  <span className="text-accent">{miembro.puntos} pts</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
