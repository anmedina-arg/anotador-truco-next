"use client";

import { useActionState, useState } from "react";
import type { ParticipanteBasico } from "@/domain/participantes";
import { nombreDeParticipante, nombresDeEquipo } from "@/domain/participantes";
import { crearSiguienteEquipoAction } from "../actions";

export function FormularioSiguienteEquipo({
  grupoId,
  partidaId,
  equipoGanador,
  candidatos,
  necesitaElegirAnotador,
}: {
  grupoId: string;
  partidaId: string;
  equipoGanador: ParticipanteBasico[];
  candidatos: ParticipanteBasico[];
  necesitaElegirAnotador: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(crearSiguienteEquipoAction, undefined);
  const [seleccionados, setSeleccionados] = useState<string[]>([]);

  function alternar(participanteId: string) {
    setSeleccionados((actual) =>
      actual.includes(participanteId)
        ? actual.filter((id) => id !== participanteId)
        : [...actual, participanteId],
    );
  }

  // El pool para elegir nuevo Anotador incluye a los 3 desafiantes recién
  // elegidos, así que se recalcula en vivo a medida que se tildan — ver
  // decisión del ticket #13.
  const candidatosAAnotador = [
    ...equipoGanador,
    ...candidatos.filter((c) => seleccionados.includes(c.participanteId)),
  ];

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="grupoId" value={grupoId} />
      <input type="hidden" name="partidaId" value={partidaId} />

      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Equipo ganador (sigue)</h2>
        <p className="text-sm text-gray-500">{nombresDeEquipo(equipoGanador)}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">Elegí a los 3 desafiantes</h2>
        <ul className="flex flex-col gap-2">
          {candidatos.map((candidato) => (
            <li
              key={candidato.participanteId}
              className="flex items-center justify-between rounded border p-2"
            >
              <span>{nombreDeParticipante(candidato)}</span>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  name="equipoDesafiante"
                  value={candidato.participanteId}
                  checked={seleccionados.includes(candidato.participanteId)}
                  onChange={() => alternar(candidato.participanteId)}
                />
                Desafiante
              </label>
            </li>
          ))}
        </ul>
      </div>

      {necesitaElegirAnotador && (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-sm">
            Vos ya no jugás esta Partida — ¿quién queda de Anotador?
            <select name="nuevoAnotadorParticipanteId" className="rounded border p-2" required>
              <option value="">Elegí a alguien</option>
              {candidatosAAnotador.map((candidato) => (
                <option key={candidato.participanteId} value={candidato.participanteId}>
                  {nombreDeParticipante(candidato)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {estado?.message && <p className="text-sm text-red-600">{estado.message}</p>}

      <button
        type="submit"
        disabled={pendiente}
        className="rounded bg-black p-2 text-white disabled:opacity-50"
      >
        Confirmar Siguiente equipo
      </button>
    </form>
  );
}
