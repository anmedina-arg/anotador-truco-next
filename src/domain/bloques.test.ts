import { describe, it, expect } from "vitest";
import { calcularBloqueSiguiente } from "./partidas";

const UMBRAL_INICIO = 5;
const UMBRAL_FIN = 20;

function siguiente(input: {
  tipoActual: "ronda" | "pica_pica";
  manosJugadas: number;
  equipo1Puntos: number;
  equipo2Puntos: number;
  umbralInicio?: number;
  umbralFin?: number;
}) {
  return calcularBloqueSiguiente({
    umbralInicio: UMBRAL_INICIO,
    umbralFin: UMBRAL_FIN,
    ...input,
  });
}

describe("calcularBloqueSiguiente", () => {
  it("primera Mano (arranca en Ronda, 0-0): sigue en Ronda", () => {
    expect(
      siguiente({ tipoActual: "ronda", manosJugadas: 0, equipo1Puntos: 0, equipo2Puntos: 0 }),
    ).toEqual({ tipo: "ronda", manosJugadas: 0 });
  });

  it("se mantiene en Ronda mientras ningún Equipo cruzó el umbral de inicio", () => {
    expect(
      siguiente({ tipoActual: "ronda", manosJugadas: 0, equipo1Puntos: 4, equipo2Puntos: 2 }),
    ).toEqual({ tipo: "ronda", manosJugadas: 0 });
  });

  it("pasa a Pica-pica apenas un Equipo alcanza o supera el umbral de inicio", () => {
    expect(
      siguiente({ tipoActual: "ronda", manosJugadas: 0, equipo1Puntos: 5, equipo2Puntos: 2 }),
    ).toEqual({ tipo: "pica_pica", manosJugadas: 0 });
  });

  it("dentro de un Bloque de Pica-pica no reevalúa nada hasta completar sus 3 Manos", () => {
    expect(
      siguiente({ tipoActual: "pica_pica", manosJugadas: 0, equipo1Puntos: 5, equipo2Puntos: 2 }),
    ).toEqual({ tipo: "pica_pica", manosJugadas: 1 });
    expect(
      siguiente({ tipoActual: "pica_pica", manosJugadas: 1, equipo1Puntos: 999, equipo2Puntos: 999 }),
    ).toEqual({ tipo: "pica_pica", manosJugadas: 2 });
  });

  it("el Bloque se completa CON la 3ra Mano (misma llamada), no una Mano después", () => {
    // manosJugadas: 2 = van 2 Manos jugadas antes de esta -> la que se está
    // cargando ahora es la 3ra. Tiene que reevaluar la Fase ya, en este
    // mismo cálculo, sin necesitar una 4ta Mano para notar que el Bloque
    // terminó.
    expect(
      siguiente({ tipoActual: "pica_pica", manosJugadas: 2, equipo1Puntos: 3, equipo2Puntos: 1 }),
    ).toEqual({ tipo: "ronda", manosJugadas: 0 }); // Fase inicial, max < umbralInicio
  });

  it("alterna Ronda↔Pica-pica repetidamente dentro de la Fase alternada", () => {
    // manosJugadas: 2 = van 2 manos jugadas antes de esta -> esta es la 3ra,
    // completa el Bloque de Pica-pica ya con esta Mano (no en la próxima
    // llamada) -> con el puntaje todavía en la Fase alternada, vuelve a
    // Ronda.
    expect(
      siguiente({ tipoActual: "pica_pica", manosJugadas: 2, equipo1Puntos: 8, equipo2Puntos: 3 }),
    ).toEqual({ tipo: "ronda", manosJugadas: 0 });

    // Ronda completa (siempre 1 Mano) en la Fase alternada -> vuelve a
    // Pica-pica.
    expect(
      siguiente({ tipoActual: "ronda", manosJugadas: 0, equipo1Puntos: 9, equipo2Puntos: 3 }),
    ).toEqual({ tipo: "pica_pica", manosJugadas: 0 });

    // Y de nuevo Ronda -> Pica-pica -> Ronda, mismo puntaje.
    expect(
      siguiente({ tipoActual: "pica_pica", manosJugadas: 2, equipo1Puntos: 9, equipo2Puntos: 3 }),
    ).toEqual({ tipo: "ronda", manosJugadas: 0 });
  });

  it("termina el Bloque de Pica-pica en curso aunque el umbral de fin ya se haya cruzado a mitad de camino", () => {
    // Va por la 2da Mano de un Pica-pica (manosJugadas: 1 = ya jugó 1 antes)
    // cuando el puntaje ya cruzó umbralFin (20) -- tiene que completar la
    // 3ra Mano igual, sin cortar.
    expect(
      siguiente({ tipoActual: "pica_pica", manosJugadas: 1, equipo1Puntos: 22, equipo2Puntos: 3 }),
    ).toEqual({ tipo: "pica_pica", manosJugadas: 2 });

    // La 3ra Mano (manosJugadas: 2 = van 2 antes de esta) completa el
    // Bloque con esta misma carga -- ahí nota que ya se cruzó umbralFin y
    // pasa a la Fase final (Ronda fija), sin esperar una 4ta Mano.
    expect(
      siguiente({ tipoActual: "pica_pica", manosJugadas: 2, equipo1Puntos: 22, equipo2Puntos: 3 }),
    ).toEqual({ tipo: "ronda", manosJugadas: 0 });
  });

  it("una vez en Ronda con el umbral de fin cruzado, se queda fija sin volver a alternar", () => {
    expect(
      siguiente({ tipoActual: "ronda", manosJugadas: 0, equipo1Puntos: 25, equipo2Puntos: 3 }),
    ).toEqual({ tipo: "ronda", manosJugadas: 0 });
  });

  it("umbrales pisados por una corrección manual (tipoActual/manosJugadas arbitrarios) siguen el mismo cálculo sin casos especiales", () => {
    expect(
      siguiente({ tipoActual: "pica_pica", manosJugadas: 0, equipo1Puntos: 3, equipo2Puntos: 1 }),
    ).toEqual({ tipo: "pica_pica", manosJugadas: 1 });
  });
});
