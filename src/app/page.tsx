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

      <main className="mx-auto flex max-w-md flex-col gap-6 p-6 pt-16">
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Mis Grupos</h2>
          {grupo ? (
            <a href={`/grupos/${grupo.id}`} className="rounded border p-3 text-sm underline">
              {grupo.nombre}
            </a>
          ) : (
            <p className="text-sm text-gray-500">
              Todavía no sos parte de ningún Grupo.{" "}
              <a href="/grupos/nuevo" className="underline">
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
              className="block rounded border p-3 text-sm underline"
            >
              Ver el tanteador de tu Partida en curso
            </a>
          </section>
        )}

        {grupo && (
          <section>
            <a
              href={`/grupos/${grupo.id}/partidas/nueva`}
              className="block rounded border p-3 text-sm underline"
            >
              Nueva Partida
            </a>
          </section>
        )}

        {grupo && ranking.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Ranking</h2>
            <ul className="flex flex-col gap-2">
              {ranking.map((miembro) => (
                <li
                  key={miembro.participanteId}
                  className="flex items-center justify-between rounded border p-3 text-sm"
                >
                  <span>{nombreDeParticipante(miembro)}</span>
                  <span>{miembro.puntos} pts</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
