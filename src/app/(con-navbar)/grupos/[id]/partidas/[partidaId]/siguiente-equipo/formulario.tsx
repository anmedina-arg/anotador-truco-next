"use client";

import { useActionState, useState } from "react";
import type { ParticipanteBasico } from "@/domain/participantes";
import { nombreDeParticipante, nombresDeEquipo } from "@/domain/participantes";
import {
  InputsOcultosDeParejas,
  ModalDeParejasPicaPica,
  ResumenDeParejasPicaPica,
  usePicaPicaParejas,
  useModalDeParejas,
} from "@/components/armado-parejas-pica-pica";
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
  const equipoDesafianteElegido = candidatos.filter((c) => seleccionados.includes(c.participanteId));
  const candidatosAAnotador = [...equipoGanador, ...equipoDesafianteElegido];
  const equiposCompletos = equipoDesafianteElegido.length === 3;

  // Las parejas de Pica-pica no se copian de la Partida original (ver ADR
  // 0006) — el desafiante es gente nueva, así que se arman de cero, igual
  // que en Nueva Partida.
  const { parejas, seleccionado, tocar, completas } = usePicaPicaParejas(equipoGanador, equipoDesafianteElegido);
  const modal = useModalDeParejas(equiposCompletos);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="grupoId" value={grupoId} />
      <input type="hidden" name="partidaId" value={partidaId} />
      <InputsOcultosDeParejas parejas={parejas} />

      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-bold text-ink">Equipo ganador (sigue)</h2>
        <p className="text-sm text-muted">{nombresDeEquipo(equipoGanador)}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold text-ink">Elegí a los 3 desafiantes</h2>
        <ul className="flex flex-col gap-2.5">
          {candidatos.map((candidato) => (
            <li
              key={candidato.participanteId}
              className="flex items-center justify-between rounded-2xl border-2 border-line bg-surface p-3"
            >
              <span className="font-bold text-ink">{nombreDeParticipante(candidato)}</span>
              <label className="flex items-center gap-1.5 text-sm font-bold text-muted">
                <input
                  type="checkbox"
                  name="equipoDesafiante"
                  value={candidato.participanteId}
                  checked={seleccionados.includes(candidato.participanteId)}
                  onChange={() => alternar(candidato.participanteId)}
                  className="accent-accent"
                />
                Desafiante
              </label>
            </li>
          ))}
        </ul>
      </div>

      {equiposCompletos && <ResumenDeParejasPicaPica parejas={parejas} onAbrir={modal.abrir} />}

      <ModalDeParejasPicaPica
        abierto={modal.abierto}
        onCerrar={modal.cerrar}
        equipo1={equipoGanador}
        equipo2={equipoDesafianteElegido}
        parejas={parejas}
        seleccionado={seleccionado}
        onTocar={tocar}
      />

      {necesitaElegirAnotador && (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-sm font-bold text-ink">
            Vos ya no jugás esta Partida — ¿quién queda de Anotador?
            <select
              name="nuevoAnotadorParticipanteId"
              className="rounded-2xl border-2 border-line bg-surface p-3 font-bold text-ink focus:border-accent focus:outline-none"
              required
            >
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

      {estado?.message && <p className="text-sm font-bold text-danger">{estado.message}</p>}

      <button
        type="submit"
        disabled={pendiente || !equiposCompletos || !completas}
        className="rounded-2xl bg-accent p-3 font-display font-bold text-white shadow-pop-accent disabled:opacity-50"
      >
        Confirmar Siguiente equipo
      </button>
    </form>
  );
}
