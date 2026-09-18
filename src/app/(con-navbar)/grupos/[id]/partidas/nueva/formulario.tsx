"use client";

import { useState } from "react";
import { useActionState } from "react";
import type { ParticipanteBasico } from "@/domain/participantes";
import {
  InputsOcultosDeParejas,
  ModalDeParejasPicaPica,
  ResumenDeParejasPicaPica,
  usePicaPicaParejas,
  useModalDeParejas,
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
  // armado de parejas de Pica-pica (ver ADR 0006). Cada Participante manda
  // su "equipo-<id>" al FormData por un input oculto (1/2/vacío), sincronizado
  // con este estado — no son radios nativos porque hace falta poder
  // deseleccionar tocando de nuevo el mismo Equipo (ver elegirEquipo).
  const [equipos, setEquipos] = useState<Record<string, 1 | 2>>({});

  const equipo1 = miembros.filter((m) => equipos[m.participanteId] === 1);
  const equipo2 = miembros.filter((m) => equipos[m.participanteId] === 2);
  const equiposCompletos = equipo1.length === 3 && equipo2.length === 3;
  const equipo1Lleno = equipo1.length >= 3;
  const equipo2Lleno = equipo2.length >= 3;

  // Tocar el Equipo en el que ya está lo saca (deselecciona) en vez de no
  // hacer nada — antes, con radios nativos, una vez elegido no había forma
  // de deshacerlo sin elegir el otro Equipo.
  function elegirEquipo(participanteId: string, equipo: 1 | 2) {
    setEquipos((anterior) => {
      const copia = { ...anterior };
      if (copia[participanteId] === equipo) {
        delete copia[participanteId];
      } else {
        copia[participanteId] = equipo;
      }
      return copia;
    });
  }

  const { parejas, seleccionado, tocar, completas } = usePicaPicaParejas(equipo1, equipo2);
  const modal = useModalDeParejas(equiposCompletos);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="grupoId" value={grupoId} />
      <InputsOcultosDeParejas parejas={parejas} />

      <p className="text-sm text-muted">
        Elegí 3 Participantes para Nosotros y 3 para Ellos. Si quedás en alguno de los dos
        Equipos, vas a ser el Anotador. Si no jugás, la Partida se crea igual — más adelante,
        alguno de los que sí juegan se puede hacer cargo de anotar. El resto queda afuera de esta
        Partida.
      </p>

      <ul className="flex flex-col gap-2.5">
        {miembros.map((miembro) => {
          const equipoDeEste = equipos[miembro.participanteId];
          return (
            <li
              key={miembro.participanteId}
              className="flex items-center justify-between rounded-2xl border-2 border-line bg-surface p-3"
            >
              <span className="font-bold text-ink">{miembro.nombre || miembro.email}</span>
              <input type="hidden" name={`equipo-${miembro.participanteId}`} value={equipoDeEste ?? ""} />
              <div className="flex gap-2 text-sm">
                <button
                  type="button"
                  disabled={equipoDeEste !== 1 && equipo1Lleno}
                  onClick={() => elegirEquipo(miembro.participanteId, 1)}
                  className={`flex h-9 min-w-[4.5rem] items-center justify-center rounded-full border-2 px-3 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    equipoDeEste === 1
                      ? "border-accent bg-accent text-white"
                      : "border-line text-muted"
                  }`}
                >
                  Nosotros
                </button>
                <button
                  type="button"
                  disabled={equipoDeEste !== 2 && equipo2Lleno}
                  onClick={() => elegirEquipo(miembro.participanteId, 2)}
                  className={`flex h-9 min-w-[4.5rem] items-center justify-center rounded-full border-2 px-3 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    equipoDeEste === 2
                      ? "border-accent2 bg-accent2 text-white"
                      : "border-line text-muted"
                  }`}
                >
                  Ellos
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {equiposCompletos && <ResumenDeParejasPicaPica parejas={parejas} onAbrir={modal.abrir} />}

      <ModalDeParejasPicaPica
        abierto={modal.abierto}
        onCerrar={modal.cerrar}
        equipo1={equipo1}
        equipo2={equipo2}
        parejas={parejas}
        seleccionado={seleccionado}
        onTocar={tocar}
        textoConfirmar="Crear Partida"
      />

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
