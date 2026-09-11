import { describe, it, expect } from "vitest";
import { ordenarPorRanking, ordenarPorFrecuencia, ordenarAlfabeticamente, calcularRatio } from "./grupos";

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
