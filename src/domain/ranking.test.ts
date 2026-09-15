import { describe, it, expect } from "vitest";
import {
  ordenarPorRanking,
  ordenarPorFrecuencia,
  ordenarAlfabeticamente,
  calcularRatio,
  nivelDeVictoria,
  calcularEstadisticasRanking,
} from "./grupos";

describe("ordenarPorRanking", () => {
  it("ordena de mayor a menor puntos", () => {
    const miembros = [
      { participanteId: "a", puntos: 1 },
      { participanteId: "b", puntos: 5 },
      { participanteId: "c", puntos: 3 },
    ];

    expect(ordenarPorRanking(miembros).map((m) => m.participanteId)).toEqual(["b", "c", "a"]);
  });

  it("desempata por participanteId para que el orden sea determinístico", () => {
    const miembros = [
      { participanteId: "z", puntos: 2 },
      { participanteId: "a", puntos: 2 },
    ];

    expect(ordenarPorRanking(miembros).map((m) => m.participanteId)).toEqual(["a", "z"]);
  });

  it("no muta el array recibido", () => {
    const miembros = [
      { participanteId: "a", puntos: 1 },
      { participanteId: "b", puntos: 5 },
    ];
    const original = [...miembros];

    ordenarPorRanking(miembros);

    expect(miembros).toEqual(original);
  });
});

describe("ordenarPorFrecuencia", () => {
  it("ordena de mayor a menor partidasJugadas", () => {
    const miembros = [
      { participanteId: "a", partidasJugadas: 1 },
      { participanteId: "b", partidasJugadas: 5 },
      { participanteId: "c", partidasJugadas: 3 },
    ];

    expect(ordenarPorFrecuencia(miembros).map((m) => m.participanteId)).toEqual(["b", "c", "a"]);
  });

  it("desempata por participanteId para que el orden sea determinístico", () => {
    const miembros = [
      { participanteId: "z", partidasJugadas: 2 },
      { participanteId: "a", partidasJugadas: 2 },
    ];

    expect(ordenarPorFrecuencia(miembros).map((m) => m.participanteId)).toEqual(["a", "z"]);
  });

  it("no muta el array recibido", () => {
    const miembros = [
      { participanteId: "a", partidasJugadas: 1 },
      { participanteId: "b", partidasJugadas: 5 },
    ];
    const original = [...miembros];

    ordenarPorFrecuencia(miembros);

    expect(miembros).toEqual(original);
  });
});

describe("ordenarAlfabeticamente", () => {
  it("ordena por nombre, sin importar mayúsculas/minúsculas", () => {
    const miembros = [
      { participanteId: "a", nombre: "Beto", email: null },
      { participanteId: "b", nombre: "ana", email: null },
      { participanteId: "c", nombre: "Carlos", email: null },
    ];

    expect(ordenarAlfabeticamente(miembros).map((m) => m.participanteId)).toEqual(["b", "a", "c"]);
  });

  it("usa el email como respaldo cuando no hay nombre", () => {
    const miembros = [
      { participanteId: "a", nombre: null, email: "zeta@example.com" },
      { participanteId: "b", nombre: "Ana", email: null },
    ];

    expect(ordenarAlfabeticamente(miembros).map((m) => m.participanteId)).toEqual(["b", "a"]);
  });

  it("desempata por participanteId para que el orden sea determinístico", () => {
    const miembros = [
      { participanteId: "z", nombre: "Ana", email: null },
      { participanteId: "a", nombre: "Ana", email: null },
    ];

    expect(ordenarAlfabeticamente(miembros).map((m) => m.participanteId)).toEqual(["a", "z"]);
  });

  it("no muta el array recibido", () => {
    const miembros = [
      { participanteId: "a", nombre: "Beto", email: null },
      { participanteId: "b", nombre: "Ana", email: null },
    ];
    const original = [...miembros];

    ordenarAlfabeticamente(miembros);

    expect(miembros).toEqual(original);
  });
});

describe("calcularRatio", () => {
  it("calcula puntos sobre partidas jugadas", () => {
    expect(calcularRatio(3, 5)).toBeCloseTo(0.6);
  });

  it("devuelve null cuando todavía no jugó ninguna Partida", () => {
    expect(calcularRatio(0, 0)).toBeNull();
  });
});

describe("nivelDeVictoria", () => {
  it("es triple cuando el perdedor terminó en 0", () => {
    expect(nivelDeVictoria(0)).toBe("triple");
  });

  it("es doble en el límite inferior del rango (1)", () => {
    expect(nivelDeVictoria(1)).toBe("doble");
  });

  it("es doble en el límite superior del rango (15)", () => {
    expect(nivelDeVictoria(15)).toBe("doble");
  });

  it("es simple en el límite inferior del rango (16)", () => {
    expect(nivelDeVictoria(16)).toBe("simple");
  });

  it("es simple en el límite superior del rango (29)", () => {
    expect(nivelDeVictoria(29)).toBe("simple");
  });
});

describe("calcularEstadisticasRanking", () => {
  it("una sola Victoria simple da 1 punto", () => {
    expect(
      calcularEstadisticasRanking({
        partidasJugadas: 1,
        partidasGanadas: 1,
        partidasGanadasDobles: 0,
        partidasGanadasTriples: 0,
      }),
    ).toEqual({ puntos: 1, partidasPerdidas: 0 });
  });

  it("combina simples, dobles y triples con sus pesos (1/2/3)", () => {
    // 5 ganadas: 3 simples (implícitas) + 1 doble + 1 triple = 3 + 2 + 3 = 8
    expect(
      calcularEstadisticasRanking({
        partidasJugadas: 8,
        partidasGanadas: 5,
        partidasGanadasDobles: 1,
        partidasGanadasTriples: 1,
      }),
    ).toEqual({ puntos: 8, partidasPerdidas: 3 });
  });

  it("un Participante sin Partidas jugadas da 0 puntos y 0 perdidas", () => {
    expect(
      calcularEstadisticasRanking({
        partidasJugadas: 0,
        partidasGanadas: 0,
        partidasGanadasDobles: 0,
        partidasGanadasTriples: 0,
      }),
    ).toEqual({ puntos: 0, partidasPerdidas: 0 });
  });

  it("partidasPerdidas es siempre jugadas menos ganadas", () => {
    expect(
      calcularEstadisticasRanking({
        partidasJugadas: 10,
        partidasGanadas: 2,
        partidasGanadasDobles: 0,
        partidasGanadasTriples: 0,
      }),
    ).toEqual({ puntos: 2, partidasPerdidas: 8 });
  });
});
