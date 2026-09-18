"use client";

import { useEffect, useState } from "react";
import type { ParticipanteBasico } from "@/domain/participantes";
import type { ParejaPicaPica, TipoDeBloque } from "@/domain/partidas";
import { MarcadorEquipo, NOMBRE_DE_BLOQUE } from "@/components/marcador-equipo";
import { obtenerEstadoDeMarcadorAction } from "./actions";

const INTERVALO_SONDEO_MS = 4000;

type EstadoSondeado = {
  tipoDeBloqueActual: TipoDeBloque;
  puntos1: number;
  puntos2: number;
  parejasYaJugadas: string[];
};

// Marcador de una Partida en_curso para cualquier miembro del Grupo que no
// sea su Anotador (ver ticket #33, CONTEXT.md/Anotador) — mismo panel
// visual que el del Anotador (MarcadorEquipo), sin ningún control de
// anotar: sin botones de +/- ni avatares tocables. Arranca con lo que ya
// trajo el servidor al abrir la pantalla y, a partir de ahí, se sondea
// sola cada pocos segundos (ticket #34) — el propio Anotador NO hace esto,
// sigue sin ningún sondeo (ver ADR 0005). Ninguna pareja de Pica-pica
// aparece como "activa" (esa elección es estado efímero solo del cliente
// del Anotador, nunca llega al servidor hasta que confirma la Mano) — un
// espectador solo ve las que ya jugaron.
export function MarcadorSoloLectura({
  partidaId,
  tipoDeBloqueActual,
  equipo1,
  equipo2,
  parejasPicaPica,
  parejasYaJugadas,
}: {
  partidaId: string;
  tipoDeBloqueActual: TipoDeBloque;
  equipo1: { miembros: ParticipanteBasico[]; puntos: number };
  equipo2: { miembros: ParticipanteBasico[]; puntos: number };
  parejasPicaPica: ParejaPicaPica[];
  parejasYaJugadas: string[];
}) {
  // Arranca de los props (el primer render del servidor) y de ahí en más
  // el sondeo lleva la cuenta solo — mismo criterio que ya usa el
  // tanteador del Anotador para su propio estado "confirmado" (ver
  // marcador-en-vivo.tsx), para no depender de que revalidatePath refresque
  // los props ante cada tick.
  const [sondeado, setSondeado] = useState<EstadoSondeado>({
    tipoDeBloqueActual,
    puntos1: equipo1.puntos,
    puntos2: equipo2.puntos,
    parejasYaJugadas,
  });

  useEffect(() => {
    let activo = true;
    // Si un tick tarda más que el intervalo, puede llegar después que uno
    // más nuevo (por ejemplo un pico de latencia puntual) — sin esto, su
    // respuesta vieja pisaría el estado ya actualizado y el puntaje
    // parecería retroceder un instante. Cada tick se numera al arrancar; su
    // resultado solo se aplica si sigue siendo el tick más nuevo cuando
    // vuelve.
    let ultimoTickId = 0;

    const intervalo = setInterval(() => {
      const tickId = ++ultimoTickId;
      void (async () => {
        const resultado = await obtenerEstadoDeMarcadorAction(partidaId);
        if (!activo || tickId !== ultimoTickId) return;
        // Un tick que falla (red, sesión vencida, membresía) se ignora sin
        // más: la pantalla se queda con el último estado conocido, tal
        // como pide el ticket — no hay nada que reintentar ni mostrar.
        if (!resultado.ok) return;

        if (resultado.estado !== "en_curso") {
          // La Partida terminó o se canceló mientras se miraba — no tiene
          // sentido seguir sondeando algo que ya no va a cambiar más.
          clearInterval(intervalo);
          return;
        }

        setSondeado({
          tipoDeBloqueActual: resultado.tipoDeBloqueActual,
          puntos1: resultado.equipo1Puntos,
          puntos2: resultado.equipo2Puntos,
          parejasYaJugadas: resultado.parejasYaJugadas,
        });
      })();
    }, INTERVALO_SONDEO_MS);

    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, [partidaId]);

  const esPicaPica = sondeado.tipoDeBloqueActual === "pica_pica";

  const yaJugadasSet = new Set(sondeado.parejasYaJugadas);
  const idsYaJugados = new Set<string>();
  if (esPicaPica) {
    for (const pareja of parejasPicaPica) {
      if (yaJugadasSet.has(pareja.jugadorEquipo1Id)) {
        idsYaJugados.add(pareja.jugadorEquipo1Id);
        idsYaJugados.add(pareja.jugadorEquipo2Id);
      }
    }
  }

  const colorBadge = esPicaPica ? "text-accent2" : "text-accent";

  return (
    <>
      <p className="flex shrink-0 items-center justify-center gap-2 text-center text-sm font-display font-bold text-ink">
        Mano actual: <span className={colorBadge}>{NOMBRE_DE_BLOQUE[sondeado.tipoDeBloqueActual]}</span>
      </p>

      <div className="flex min-h-0 flex-1 justify-around gap-4">
        <MarcadorEquipo
          miembros={equipo1.miembros}
          puntos={sondeado.puntos1}
          equipo={1}
          interactivo={false}
          tocable={esPicaPica}
          idsActivos={new Set()}
          idsYaJugados={idsYaJugados}
        />
        <MarcadorEquipo
          miembros={equipo2.miembros}
          puntos={sondeado.puntos2}
          equipo={2}
          interactivo={false}
          tocable={esPicaPica}
          idsActivos={new Set()}
          idsYaJugados={idsYaJugados}
        />
      </div>
    </>
  );
}
