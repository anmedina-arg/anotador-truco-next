import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerPartidaConEquipos, esAnotadorDePartida, type TipoDeBloque } from "@/domain/partidas";
import { nombresDeEquipo, inicialesDeParticipante, type ParticipanteBasico } from "@/domain/participantes";
import { anotarPuntoAction, cancelarPartidaAction } from "./actions";
import { BotonRevancha } from "./boton-revancha";
import { FosforosTally } from "@/components/fosforos-tally";

const CORTE_MALAS_BUENAS = 15;

// Bloque (ver CONTEXT.md): tipo de la Mano que corresponde jugar a
// continuación, calculado server-side en cada render — sin timer ni
// polling en el cliente (ver ticket #20).
const NOMBRE_DE_BLOQUE: Record<TipoDeBloque, string> = {
  ronda: "Ronda",
  pica_pica: "Pica-pica",
};

// Mismo rótulo/color que la selección de equipos en Nueva Partida — ver
// formulario.tsx: Equipo 1 siempre es "Nosotros" (accent), Equipo 2 siempre
// es "Ellos" (accent2).
const ROL_DE_EQUIPO: Record<1 | 2, { texto: string; colorClase: string }> = {
  1: { texto: "Nosotros", colorClase: "border-accent bg-accent text-white" },
  2: { texto: "Ellos", colorClase: "border-accent2 bg-accent2 text-white" },
};

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

  const partida = await obtenerPartidaConEquipos(partidaId);
  if (!partida || partida.grupoId !== grupoId) {
    notFound();
  }

  // El marcador en vivo es solo para quien anota esta Partida — ver
  // CONTEXT.md / historia de usuario 26 del ticket #1 (fuera de alcance para
  // el resto de los Participantes en esta versión).
  if (!esAnotadorDePartida(partida, session.user.id)) {
    notFound();
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
          <BotonRevancha grupoId={grupoId} partidaId={partida.id} />
          <a
            href={`/grupos/${grupoId}/partidas/${partida.id}/siguiente-equipo`}
            className="block rounded-2xl border-2 border-line bg-surface p-3 text-center text-sm font-display font-bold text-ink no-underline shadow-pop"
          >
            Siguiente equipo
          </a>
        </div>
      )}
      {partida.estado === "cancelada" && (
        <p className="shrink-0 rounded-2xl border-2 border-line bg-surface p-3.5 text-sm font-bold text-muted">
          Partida cancelada.
        </p>
      )}

      {partida.estado === "en_curso" && (
        <p className="shrink-0 text-center text-sm font-display font-bold text-ink">
          Mano actual:{" "}
          <span className={partida.tipoDeBloqueActual === "pica_pica" ? "text-accent2" : "text-accent"}>
            {NOMBRE_DE_BLOQUE[partida.tipoDeBloqueActual]}
          </span>
        </p>
      )}

      <div className="flex min-h-0 flex-1 justify-around gap-4">
        <Marcador
          miembros={partida.equipo1}
          puntos={partida.equipo1Puntos}
          equipo={1}
          grupoId={grupoId}
          partidaId={partida.id}
          activo={partida.estado === "en_curso"}
        />
        <Marcador
          miembros={partida.equipo2}
          puntos={partida.equipo2Puntos}
          equipo={2}
          grupoId={grupoId}
          partidaId={partida.id}
          activo={partida.estado === "en_curso"}
        />
      </div>

      {partida.estado === "en_curso" && (
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

function Marcador({
  miembros,
  puntos,
  equipo,
  grupoId,
  partidaId,
  activo,
}: {
  miembros: ParticipanteBasico[];
  puntos: number;
  equipo: 1 | 2;
  grupoId: string;
  partidaId: string;
  activo: boolean;
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
      {activo && (
        <div className="flex shrink-0 gap-2">
          <FormAnotar grupoId={grupoId} partidaId={partidaId} equipo={equipo} delta={-1} label="−" />
          <FormAnotar grupoId={grupoId} partidaId={partidaId} equipo={equipo} delta={1} label="+" />
        </div>
      )}
    </div>
  );
}

function FormAnotar({
  grupoId,
  partidaId,
  equipo,
  delta,
  label,
}: {
  grupoId: string;
  partidaId: string;
  equipo: 1 | 2;
  delta: 1 | -1;
  label: string;
}) {
  const esSumar = delta === 1;

  return (
    <form action={anotarPuntoAction}>
      <input type="hidden" name="grupoId" value={grupoId} />
      <input type="hidden" name="partidaId" value={partidaId} />
      <input type="hidden" name="equipo" value={equipo} />
      <input type="hidden" name="delta" value={delta} />
      <button
        type="submit"
        className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl font-bold ${
          esSumar
            ? "bg-accent text-white shadow-pop-accent-sm"
            : "border-2 border-line bg-surface text-ink shadow-pop-sm"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
