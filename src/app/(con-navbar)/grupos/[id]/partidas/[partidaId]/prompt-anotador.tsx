"use client";

import { useState, useTransition } from "react";
import type { ParticipanteBasico } from "@/domain/participantes";
import type { ParejaPicaPica, TipoDeBloque } from "@/domain/partidas";
import { reclamarAnotadorAction } from "./actions";
import { MarcadorSoloLectura } from "./marcador-solo-lectura";

// "¿Anotás vos?" (ticket #33, CONTEXT.md/Anotador): se muestra solo a los
// 6 Participantes que juegan una Partida todavía sin Anotador asignado
// (ver ticket #32). "Sí" reclama el rol contra el servidor; si gana la
// carrera, revalidatePath (ver reclamarAnotadorAction) hace que page.tsx
// se vuelva a renderizar del lado del servidor ya con esAnotadorDePartida
// en true, y este componente ni sigue montado. Si la pierde (otro de los
// 6 reclamó un instante antes), no hay ningún error que mostrar — cae
// directo al marcador de solo lectura, igual que "No". "No" no llama al
// servidor: es una decisión que no persiste, si esta persona vuelve a
// entrar más tarde y todavía nadie reclamó el rol, se le vuelve a
// preguntar.
export function PromptAnotador({
  grupoId,
  partidaId,
  tipoDeBloqueActual,
  equipo1,
  equipo2,
  parejasPicaPica,
  parejasYaJugadas,
}: {
  grupoId: string;
  partidaId: string;
  tipoDeBloqueActual: TipoDeBloque;
  equipo1: { miembros: ParticipanteBasico[]; puntos: number };
  equipo2: { miembros: ParticipanteBasico[]; puntos: number };
  parejasPicaPica: ParejaPicaPica[];
  parejasYaJugadas: string[];
}) {
  const [respondido, setRespondido] = useState(false);
  const [pendiente, startTransition] = useTransition();

  if (respondido) {
    return (
      <MarcadorSoloLectura
        partidaId={partidaId}
        tipoDeBloqueActual={tipoDeBloqueActual}
        equipo1={equipo1}
        equipo2={equipo2}
        parejasPicaPica={parejasPicaPica}
        parejasYaJugadas={parejasYaJugadas}
      />
    );
  }

  function elegirSi() {
    // Pasar la función async directo a startTransition (no envuelta en un
    // void(async () => {...})()) es lo que hace que React 19 mantenga
    // `pendiente` en true hasta que el resultado vuelve del servidor —
    // envolverla perdía esa señal (la función pasada a startTransition
    // volvía sincrónica al toque), dejando la ventana abierta a un
    // doble-tap que reclama dos veces desde el mismo Participante.
    startTransition(async () => {
      const resultado = await reclamarAnotadorAction({ grupoId, partidaId });
      if (!resultado.ok) {
        setRespondido(true);
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-line bg-surface p-6 text-center shadow-pop">
      <p className="font-display text-xl font-bold text-ink">¿Anotás vos?</p>
      <p className="text-sm text-muted">
        Todavía nadie es el Anotador de esta Partida. El primero de los 6 que elige &quot;Sí&quot; se queda
        con el rol.
      </p>
      <div className="flex w-full gap-3">
        <button
          type="button"
          onClick={() => setRespondido(true)}
          disabled={pendiente}
          className="flex-1 rounded-2xl border-2 border-line bg-bg p-3 font-display font-bold text-ink disabled:opacity-50"
        >
          No
        </button>
        <button
          type="button"
          onClick={elegirSi}
          disabled={pendiente}
          className="flex-1 rounded-2xl bg-accent p-3 font-display font-bold text-white shadow-pop-accent disabled:opacity-50"
        >
          Sí
        </button>
      </div>
    </div>
  );
}
