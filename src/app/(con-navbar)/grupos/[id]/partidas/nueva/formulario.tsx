"use client";

import { useState } from "react";
import { useActionState } from "react";
import type { ParticipanteBasico } from "@/domain/participantes";
import {
  ArmadoDeParejasPicaPica,
  InputsOcultosDeParejas,
  usePicaPicaParejas,
} from "@/components/armado-parejas-pica-pica";
import { crearPartidaAction } from "./actions";

export function FormularioNuevaPartida({
  grupoId,
  miembros,
}: {
  grupoId: string;
  miembros: ParticipanteBasico[];
}) {
  const [estado, accion, pendiente] = useActionState(crearPartidaAction, undefined);
  // Estado de cliente para saber en vivo cuándo los dos Equipos ya tienen
  // sus 3 Participantes cada uno — recién ahí tiene sentido mostrar el
  // armado de parejas de Pica-pica (ver ADR 0006). Los radios siguen
  // mandando "equipo-<id>" en el FormData como antes (controlados acá para
  // poder reaccionar, no solo para el submit final).
  const [equipos, setEquipos] = useState<Record<string, 1 | 2>>({});

  const equipo1 = miembros.filter((m) => equipos[m.participanteId] === 1);
  const equipo2 = miembros.filter((m) => equipos[m.participanteId] === 2);
  const equiposCompletos = equipo1.length === 3 && equipo2.length === 3;

  const { parejas, seleccionado, tocar, completas } = usePicaPicaParejas(equipo1, equipo2);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="grupoId" value={grupoId} />
      <InputsOcultosDeParejas parejas={parejas} />

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
                  checked={equipos[miembro.participanteId] === 1}
                  onChange={() => setEquipos((anterior) => ({ ...anterior, [miembro.participanteId]: 1 }))}
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
                  checked={equipos[miembro.participanteId] === 2}
                  onChange={() => setEquipos((anterior) => ({ ...anterior, [miembro.participanteId]: 2 }))}
                  className="sr-only"
                />
                Ellos
              </label>
            </div>
          </li>
        ))}
      </ul>

      {equiposCompletos && (
        <ArmadoDeParejasPicaPica
          equipo1={equipo1}
          equipo2={equipo2}
          parejas={parejas}
          seleccionado={seleccionado}
          onTocar={tocar}
        />
      )}

      {estado?.message && <p className="text-sm font-bold text-danger">{estado.message}</p>}

      <button
        type="submit"
        disabled={pendiente || !equiposCompletos || !completas}
        className="rounded-2xl bg-accent p-3 font-display font-bold text-white shadow-pop-accent disabled:opacity-50"
      >
        Crear Partida
      </button>
    </form>
  );
}
