"use client";

import { useActionState } from "react";
import type { ParticipanteBasico } from "@/domain/participantes";
import { crearPartidaAction } from "./actions";

export function FormularioNuevaPartida({
  grupoId,
  miembros,
}: {
  grupoId: string;
  miembros: ParticipanteBasico[];
}) {
  const [estado, accion, pendiente] = useActionState(crearPartidaAction, undefined);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="grupoId" value={grupoId} />

      <p className="text-sm text-muted">
        Elegí 3 Participantes para Nosotros y 3 para Ellos. Vos, como quien carga la Partida,
        quedás de Anotador — tenés que estar jugando en alguno de los dos equipos. El resto queda
        afuera de esta Partida.
      </p>

      <ul className="flex flex-col gap-2.5">
        {miembros.map((miembro) => (
          <li
            key={miembro.participanteId}
            className="flex items-center justify-between rounded-2xl border-2 border-line bg-surface p-3"
          >
            <span className="font-bold text-ink">{miembro.nombre || miembro.email}</span>
            <div className="flex gap-2 text-sm">
              <label
                className="flex h-9 min-w-[4.5rem] cursor-pointer items-center justify-center rounded-full border-2 border-line px-3 font-bold text-muted transition-colors [&:has(:checked)]:border-accent [&:has(:checked)]:bg-accent [&:has(:checked)]:text-white [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-accent [&:has(:focus-visible)]:ring-offset-2"
              >
                <input
                  type="radio"
                  name={`equipo-${miembro.participanteId}`}
                  value="1"
                  className="sr-only"
                />
                Nosotros
              </label>
              <label
                className="flex h-9 min-w-[4.5rem] cursor-pointer items-center justify-center rounded-full border-2 border-line px-3 font-bold text-muted transition-colors [&:has(:checked)]:border-accent2 [&:has(:checked)]:bg-accent2 [&:has(:checked)]:text-white [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-accent2 [&:has(:focus-visible)]:ring-offset-2"
              >
                <input
                  type="radio"
                  name={`equipo-${miembro.participanteId}`}
                  value="2"
                  className="sr-only"
                />
                Ellos
              </label>
            </div>
          </li>
        ))}
      </ul>

      {estado?.message && <p className="text-sm font-bold text-danger">{estado.message}</p>}

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-2xl bg-accent p-3 font-display font-bold text-white shadow-pop-accent disabled:opacity-50"
      >
        Crear Partida
      </button>
    </form>
  );
}
