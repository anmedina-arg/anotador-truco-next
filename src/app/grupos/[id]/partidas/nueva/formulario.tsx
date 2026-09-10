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

      <p className="text-sm text-gray-500">
        Elegí 3 Participantes para el Equipo 1 y 3 para el Equipo 2. Vos, como quien carga la
        Partida, quedás de Anotador — tenés que estar jugando en alguno de los dos.
      </p>

      <ul className="flex flex-col gap-2">
        {miembros.map((miembro) => (
          <li
            key={miembro.participanteId}
            className="flex items-center justify-between rounded border p-2"
          >
            <span>{miembro.nombre || miembro.email}</span>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input type="radio" name={`equipo-${miembro.participanteId}`} value="1" />
                Equipo 1
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name={`equipo-${miembro.participanteId}`} value="2" />
                Equipo 2
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={`equipo-${miembro.participanteId}`}
                  value=""
                  defaultChecked
                />
                No juega
              </label>
            </div>
          </li>
        ))}
      </ul>

      {estado?.message && <p className="text-sm text-red-600">{estado.message}</p>}

      <button
        type="submit"
        disabled={pendiente}
        className="rounded bg-black p-2 text-white disabled:opacity-50"
      >
        Crear Partida
      </button>
    </form>
  );
}
