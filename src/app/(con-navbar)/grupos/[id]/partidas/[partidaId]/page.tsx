import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerPartidaConEquipos, esAnotadorDePartida } from "@/domain/partidas";
import { nombresDeEquipo } from "@/domain/participantes";
import { anotarPuntoAction, cancelarPartidaAction } from "./actions";
import { BotonRevancha } from "./boton-revancha";

const CORTE_MALAS_BUENAS = 15;

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
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <a href={`/grupos/${grupoId}`} className="text-sm font-bold text-accent no-underline hover:text-accent-dark">
        ← Volver al Grupo
      </a>

      {partida.estado === "finalizada" && (
        <>
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
        </>
      )}
      {partida.estado === "cancelada" && (
        <p className="rounded-2xl border-2 border-line bg-surface p-3.5 text-sm font-bold text-muted">
          Partida cancelada.
        </p>
      )}

      <div className="flex justify-around gap-4">
        <Marcador
          titulo={nombresDeEquipo(partida.equipo1)}
          puntos={partida.equipo1Puntos}
          equipo={1}
          grupoId={grupoId}
          partidaId={partida.id}
          activo={partida.estado === "en_curso"}
        />
        <Marcador
          titulo={nombresDeEquipo(partida.equipo2)}
          puntos={partida.equipo2Puntos}
          equipo={2}
          grupoId={grupoId}
          partidaId={partida.id}
          activo={partida.estado === "en_curso"}
        />
      </div>

      {partida.estado === "en_curso" && (
        <form action={cancelarPartidaAction}>
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
  titulo,
  puntos,
  equipo,
  grupoId,
  partidaId,
  activo,
}: {
  titulo: string;
  puntos: number;
  equipo: 1 | 2;
  grupoId: string;
  partidaId: string;
  activo: boolean;
}) {
  const malasOBuenas = puntos > CORTE_MALAS_BUENAS ? "buenas" : "malas";
  const esBuenas = malasOBuenas === "buenas";

  return (
    <div className="flex flex-1 flex-col items-center gap-2 rounded-2xl border-2 border-line bg-surface p-4 shadow-pop">
      <p className="text-center text-sm font-bold text-ink">{titulo}</p>
      <p
        className={`rounded-full px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ${
          esBuenas ? "bg-accent2" : "bg-muted"
        }`}
      >
        {malasOBuenas}
      </p>
      <p className={`my-1 font-display text-5xl font-extrabold ${esBuenas ? "text-accent" : "text-ink"}`}>
        {puntos}
      </p>
      {activo && (
        <div className="flex gap-2">
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
