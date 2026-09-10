import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerPartidaConEquipos } from "@/domain/partidas";
import { nombresDeEquipo } from "@/domain/participantes";
import { anotarPuntoAction, cancelarPartidaAction } from "./actions";

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
  if (partida.anotadorParticipanteId !== session.user.id) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <a href={`/grupos/${grupoId}`} className="text-sm underline">
        ← Volver al Grupo
      </a>

      {partida.estado === "finalizada" && (
        <p className="rounded border border-green-600 bg-green-50 p-3 text-sm text-green-800">
          Partida finalizada — ganó el Equipo {partida.equipoGanador} (
          {partida.equipoGanador === 1 ? nombresDeEquipo(partida.equipo1) : nombresDeEquipo(partida.equipo2)}
          ).
        </p>
      )}
      {partida.estado === "cancelada" && (
        <p className="rounded border border-gray-400 bg-gray-50 p-3 text-sm text-gray-600">
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
            className="w-full rounded border border-red-600 p-2 text-sm text-red-600"
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

  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <p className="text-center text-sm font-medium">{titulo}</p>
      <p className="text-xs text-gray-500">{malasOBuenas}</p>
      <p className="text-4xl font-bold">{puntos}</p>
      {activo && (
        <div className="flex gap-2">
          <FormAnotar grupoId={grupoId} partidaId={partidaId} equipo={equipo} delta={-1} label="-" />
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
  return (
    <form action={anotarPuntoAction}>
      <input type="hidden" name="grupoId" value={grupoId} />
      <input type="hidden" name="partidaId" value={partidaId} />
      <input type="hidden" name="equipo" value={equipo} />
      <input type="hidden" name="delta" value={delta} />
      <button type="submit" className="h-10 w-10 rounded border text-xl">
        {label}
      </button>
    </form>
  );
}
