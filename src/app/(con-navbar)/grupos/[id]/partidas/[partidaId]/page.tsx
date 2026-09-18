import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  obtenerPartidaConEquipos,
  esAnotadorDePartida,
  esParticipanteDePartida,
  obtenerParejasPicaPica,
  obtenerParejasYaJugadasEnBloqueActual,
} from "@/domain/partidas";
import { obtenerGrupoPorId, esMiembroDeGrupo } from "@/domain/grupos";
import { nombresDeEquipo, inicialesDeParticipante, type ParticipanteBasico } from "@/domain/participantes";
import { cancelarPartidaAction } from "./actions";
import { BotonRevancha } from "./boton-revancha";
import { MarcadorEnVivo } from "./marcador-en-vivo";
import { MarcadorSoloLectura } from "./marcador-solo-lectura";
import { PromptAnotador } from "./prompt-anotador";
import { FosforosTally } from "@/components/fosforos-tally";
import { ROL_DE_EQUIPO, CORTE_MALAS_BUENAS } from "@/components/marcador-equipo";

export default async function PartidaDetallePage({
  params,
}: {
  params: Promise<{ id: string; partidaId: string }>;
}) {
  const { id: grupoId, partidaId } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Cualquier miembro del Grupo puede abrir esta pantalla (ver ticket #33,
  // CONTEXT.md/Anotador) — antes esto salía gratis de exigir ser el
  // Anotador (que siempre era miembro del Grupo, ver crearPartida), pero
  // ahora hace falta un chequeo propio: alguien de otro Grupo no tiene que
  // poder entrar solo por conocer el link. Los dos fetches son
  // independientes (grupoId sale del route param, no de partida) — en
  // paralelo, mismo criterio que ya usa grupos/[id]/page.tsx.
  const [partida, esMiembroDelGrupo] = await Promise.all([
    obtenerPartidaConEquipos(partidaId),
    esMiembroDeGrupo(grupoId, session.user.id),
  ]);
  if (!partida || partida.grupoId !== grupoId) {
    notFound();
  }
  if (!esMiembroDelGrupo) {
    notFound();
  }

  // Determina qué ve cada quien más abajo: el Anotador tiene los controles
  // de siempre; el resto del Grupo, el marcador de solo lectura (o la
  // pregunta de reclamo, ver árbol más abajo) — también gatilla si se
  // muestran los botones exclusivos del Anotador para una Partida ya
  // finalizada (Revancha, Siguiente equipo, Cancelar), que antes quedaban
  // implícitamente ocultos para cualquier otro por el 404 de arriba.
  const esAnotador = esAnotadorDePartida(partida, session.user.id);

  // ventanaInactividadSegundos (ver CONTEXT.md/Grupo) se lee en vivo acá,
  // en cada render server-side — un cambio del admin aplica a la próxima
  // vez que se carga esta pantalla, sin polling (ver ADR 0005).
  const grupo = partida.estado === "en_curso" ? await obtenerGrupoPorId(grupoId) : null;
  // Solo hace falta para el marcador en vivo, y ahí solo cuando el Bloque
  // vigente es Pica-pica — pero pedirlas siempre es más simple que agregar
  // un caso especial, y son 3 filas nomás (ver ticket #30).
  const parejasPicaPica = partida.estado === "en_curso" ? await obtenerParejasPicaPica(partida.id) : [];
  // Qué parejas ya jugaron su Mano en el Bloque de Pica-pica todavía
  // abierto (ver corrección de UI sobre el ticket #30) — se persiste
  // server-side para no perderla en un reload a mitad de Bloque.
  const parejasYaJugadas =
    partida.estado === "en_curso" ? await obtenerParejasYaJugadasEnBloqueActual(partida) : [];

  // Árbol de acceso al marcador de una Partida en_curso (ver ticket #33):
  // el Anotador tiene el tanteador interactivo de siempre; sin Anotador
  // asignado (ver ticket #32) y siendo de los 6 que juegan, la pregunta de
  // reclamo; cualquier otro caso (ya hay Anotador y no sos vos, o no jugás
  // esta Partida en particular) cae al marcador de solo lectura.
  let contenidoEnCurso: ReactNode = null;
  if (partida.estado === "en_curso" && grupo) {
    if (esAnotador) {
      contenidoEnCurso = (
        <MarcadorEnVivo
          partidaId={partida.id}
          grupoId={grupoId}
          ventanaInactividadSegundos={grupo.ventanaInactividadSegundos}
          tipoDeBloqueActual={partida.tipoDeBloqueActual}
          equipo1={{ miembros: partida.equipo1, puntosConfirmados: partida.equipo1Puntos }}
          equipo2={{ miembros: partida.equipo2, puntosConfirmados: partida.equipo2Puntos }}
          parejasPicaPica={parejasPicaPica}
          parejasYaJugadasInicial={parejasYaJugadas}
        />
      );
    } else {
      const marcadorSoloLectura = (
        <MarcadorSoloLectura
          partidaId={partida.id}
          tipoDeBloqueActual={partida.tipoDeBloqueActual}
          equipo1={{ miembros: partida.equipo1, puntos: partida.equipo1Puntos }}
          equipo2={{ miembros: partida.equipo2, puntos: partida.equipo2Puntos }}
          parejasPicaPica={parejasPicaPica}
          parejasYaJugadas={parejasYaJugadas}
        />
      );

      contenidoEnCurso =
        partida.anotadorParticipanteId === null && esParticipanteDePartida(partida, session.user.id) ? (
          <PromptAnotador
            grupoId={grupoId}
            partidaId={partida.id}
            tipoDeBloqueActual={partida.tipoDeBloqueActual}
            equipo1={{ miembros: partida.equipo1, puntos: partida.equipo1Puntos }}
            equipo2={{ miembros: partida.equipo2, puntos: partida.equipo2Puntos }}
            parejasPicaPica={parejasPicaPica}
            parejasYaJugadas={parejasYaJugadas}
          />
        ) : (
          marcadorSoloLectura
        );
    }
  }

  return (
    <main className="mx-auto flex h-[100dvh] max-w-md flex-col gap-4 p-6">
      <a
        href={`/grupos/${grupoId}`}
        className="shrink-0 text-sm font-bold text-accent no-underline hover:text-accent-dark"
      >
        ← Volver al Grupo
      </a>

      {partida.estado === "finalizada" && (
        <div className="flex shrink-0 flex-col gap-4">
          <p className="rounded-2xl border-2 border-success-border bg-success-soft p-3.5 text-sm font-bold text-success">
            Partida finalizada — ganó el Equipo {partida.equipoGanador} (
            {partida.equipoGanador === 1 ? nombresDeEquipo(partida.equipo1) : nombresDeEquipo(partida.equipo2)}
            ).
          </p>
          {/* Revancha y Siguiente equipo son acciones exclusivas del
              Anotador (ver domain/partidas.ts) — antes quedaban ocultas
              gratis para cualquier otro por el 404 de la pantalla entera;
              ahora que cualquier miembro del Grupo puede llegar hasta acá
              (ver ticket #33), hace falta este chequeo explícito. */}
          {esAnotador && (
            <>
              <BotonRevancha grupoId={grupoId} partidaId={partida.id} />
              <a
                href={`/grupos/${grupoId}/partidas/${partida.id}/siguiente-equipo`}
                className="block rounded-2xl border-2 border-line bg-surface p-3 text-center text-sm font-display font-bold text-ink no-underline shadow-pop"
              >
                Siguiente equipo
              </a>
            </>
          )}
        </div>
      )}
      {partida.estado === "cancelada" && (
        <p className="shrink-0 rounded-2xl border-2 border-line bg-surface p-3.5 text-sm font-bold text-muted">
          Partida cancelada.
        </p>
      )}

      {partida.estado === "en_curso" && grupo ? (
        contenidoEnCurso
      ) : (
        <div className="flex min-h-0 flex-1 justify-around gap-4">
          <MarcadorFinal miembros={partida.equipo1} puntos={partida.equipo1Puntos} equipo={1} />
          <MarcadorFinal miembros={partida.equipo2} puntos={partida.equipo2Puntos} equipo={2} />
        </div>
      )}

      {partida.estado === "en_curso" && esAnotador && (
        <form action={cancelarPartidaAction} className="shrink-0">
          <input type="hidden" name="grupoId" value={grupoId} />
          <input type="hidden" name="partidaId" value={partida.id} />
          <button
            type="submit"
            className="w-full rounded-2xl border-2 border-danger-border bg-danger-soft p-3 text-sm font-display font-bold text-danger"
          >
            Cancelar Partida
          </button>
        </form>
      )}
    </main>
  );
}

// Marcador de solo lectura para una Partida finalizada/cancelada — sin
// botones de "+"/"-" (ver MarcadorEnVivo para el tanteador interactivo de
// una Partida en_curso, con su propio debounce).
function MarcadorFinal({
  miembros,
  puntos,
  equipo,
}: {
  miembros: ParticipanteBasico[];
  puntos: number;
  equipo: 1 | 2;
}) {
  const malasOBuenas = puntos > CORTE_MALAS_BUENAS ? "buenas" : "malas";
  const esBuenas = malasOBuenas === "buenas";
  const puntosDeLaFase = esBuenas ? puntos - CORTE_MALAS_BUENAS : puntos;
  const rol = ROL_DE_EQUIPO[equipo];

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-2 rounded-2xl border-2 border-line bg-surface p-4 shadow-pop">
      <span
        className={`flex h-9 min-w-[4.5rem] shrink-0 items-center justify-center rounded-full border-2 px-3 font-bold ${rol.colorClase}`}
      >
        {rol.texto}
      </span>
      <div className="flex shrink-0 flex-wrap justify-center gap-1">
        {miembros.map((miembro) => (
          <span
            key={miembro.participanteId}
            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${
              equipo === 1 ? "border-accent bg-accent-soft text-accent" : "border-accent2 bg-accent2-soft text-accent2"
            }`}
          >
            {inicialesDeParticipante(miembro)}
          </span>
        ))}
      </div>
      <p
        className={`shrink-0 rounded-full px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ${
          esBuenas ? "bg-accent2" : "bg-muted"
        }`}
      >
        {malasOBuenas}
      </p>
      <p className={`my-1 shrink-0 font-display text-5xl font-extrabold ${esBuenas ? "text-accent" : "text-ink"}`}>
        {puntos}
      </p>
      <div className="flex min-h-0 flex-1 flex-col items-center">
        <FosforosTally puntos={puntosDeLaFase} colorClase={esBuenas ? "bg-accent2" : "bg-ink"} />
      </div>
    </div>
  );
}
