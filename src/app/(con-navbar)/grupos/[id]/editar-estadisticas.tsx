"use client";

import { useActionState } from "react";
import { actualizarEstadisticasAction, type EstadoEditarEstadisticas } from "./actions";

export function EditarEstadisticas({
  grupoId,
  participanteId,
  partidasJugadas,
  partidasGanadas,
  partidasGanadasDobles,
  partidasGanadasTriples,
}: {
  grupoId: string;
  participanteId: string;
  partidasJugadas: number;
  partidasGanadas: number;
  partidasGanadasDobles: number;
  partidasGanadasTriples: number;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoEditarEstadisticas, FormData>(
    actualizarEstadisticasAction,
    undefined,
  );

  return (
    <details>
      <summary className="w-fit cursor-pointer list-none text-sm font-bold text-accent hover:text-accent-dark">
        Editar estadísticas
      </summary>
      <form action={accion} className="mt-2 flex flex-col gap-3 rounded-2xl border-2 border-line bg-bg p-3">
        <input type="hidden" name="grupoId" value={grupoId} />
        <input type="hidden" name="participanteId" value={participanteId} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-bold text-muted">
            Jugadas
            <input
              type="number"
              name="partidasJugadas"
              min={0}
              defaultValue={partidasJugadas}
              className="rounded-xl border-2 border-line p-2 text-sm font-bold text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-muted">
            Ganadas
            <input
              type="number"
              name="partidasGanadas"
              min={0}
              defaultValue={partidasGanadas}
              className="rounded-xl border-2 border-line p-2 text-sm font-bold text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-muted">
            Ganadas dobles
            <input
              type="number"
              name="partidasGanadasDobles"
              min={0}
              defaultValue={partidasGanadasDobles}
              className="rounded-xl border-2 border-line p-2 text-sm font-bold text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-muted">
            Ganadas triples
            <input
              type="number"
              name="partidasGanadasTriples"
              min={0}
              defaultValue={partidasGanadasTriples}
              className="rounded-xl border-2 border-line p-2 text-sm font-bold text-ink"
            />
          </label>
        </div>
        {estado?.message && <p className="text-sm font-bold text-danger">{estado.message}</p>}
        <button
          type="submit"
          disabled={pendiente}
          className="w-fit rounded-2xl bg-accent px-4 py-2 text-sm font-display font-bold text-white shadow-pop-accent-sm disabled:opacity-50"
        >
          Guardar
        </button>
      </form>
    </details>
  );
}
