import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  listarGruposDeParticipantePorActividad,
  listarMiembrosDeGrupo,
  ordenarPorRanking,
} from "@/domain/grupos";
import { listarPartidasEnCursoDeGrupo } from "@/domain/partidas";
import { nombreDeParticipante } from "@/domain/participantes";
import { PerfilFlotante } from "@/components/perfil-flotante";

const TOP_RANKING = 3;

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [grupo, grupoSecundario] = await listarGruposDeParticipantePorActividad(session.user.id, 2);

  let partidaEnCursoId: string | null = null;
  let ranking: Awaited<ReturnType<typeof listarMiembrosDeGrupo>> = [];

  if (grupo) {
    const [partidasEnCurso, miembros] = await Promise.all([
      listarPartidasEnCursoDeGrupo(grupo.id),
      listarMiembrosDeGrupo(grupo.id),
    ]);

    // Cualquier miembro del Grupo puede entrar a ver el marcador de una
    // Partida en curso, sea o no su Anotador (ver ticket #33,
    // CONTEXT.md/Anotador) — el atajo apunta a la primera que haya.
    partidaEnCursoId = partidasEnCurso[0]?.id ?? null;
    ranking = ordenarPorRanking(miembros).slice(0, TOP_RANKING);
  }

  return (
    <>
      <PerfilFlotante nombre={session.user.name} email={session.user.email} />

      <main className="mx-auto flex max-w-md flex-col gap-7 p-6 pt-16">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">Mis Grupos</h2>
            <a href="/grupos" className="text-sm font-bold text-accent no-underline hover:text-accent-dark">
              Ver todos los grupos
            </a>
          </div>
          {grupo ? (
            <div
              className={`relative overflow-hidden rounded-2xl border-2 border-line bg-surface shadow-pop ${
                grupoSecundario ? "h-[90px]" : ""
              }`}
            >
              <div className="flex flex-col divide-y divide-line">
                <a
                  href={`/grupos/${grupo.id}`}
                  className="block w-full p-4 text-sm font-bold text-ink no-underline hover:text-accent"
                >
                  {grupo.nombre}
                </a>
                {grupoSecundario && (
                  <a
                    href={`/grupos/${grupoSecundario.id}`}
                    className="block w-full p-4 text-sm font-bold text-ink no-underline hover:text-accent"
                  >
                    {grupoSecundario.nombre}
                  </a>
                )}
              </div>
              {/* El segundo Grupo se corta a propósito contra el borde de esta
                  caja: el degradé + la sombra interior simulan que se pierde
                  dentro de la apertura, insinuando que hay más sin mostrarlo
                  entero (ver "Ventana con corte" acordado con Andrés). */}
              {grupoSecundario && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-surface shadow-[inset_0_-10px_10px_-8px_rgba(28,27,46,0.25)]"
                />
              )}
            </div>
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
              Crear Partida nueva en {grupo.nombre}
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
