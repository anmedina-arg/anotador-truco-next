import { describe, it, expect } from "vitest";
import {
  parejaSueltaPorDescarte,
  siguienteEstadoAlTocar,
  type EstadoArmadoDeParejas,
} from "./armado-parejas-pica-pica";

// Sin base de datos a propósito (ticket #37): es lógica de arreglos pura,
// no necesita Postgres ni renderizar ningún componente — primer test de
// este proyecto que no pega contra la base de test real.
describe("parejaSueltaPorDescarte", () => {
  const equipo1 = ["p0", "p1", "p2"];
  const equipo2 = ["p3", "p4", "p5"];

  it("no aplica con 0 parejas armadas", () => {
    expect(parejaSueltaPorDescarte(equipo1, equipo2, [])).toBeNull();
  });

  it("no aplica con 1 pareja armada", () => {
    const parejas = [{ jugadorEquipo1Id: "p0", jugadorEquipo2Id: "p3" }];
    expect(parejaSueltaPorDescarte(equipo1, equipo2, parejas)).toBeNull();
  });

  it("no aplica con las 3 parejas ya armadas", () => {
    const parejas = [
      { jugadorEquipo1Id: "p0", jugadorEquipo2Id: "p3" },
      { jugadorEquipo1Id: "p1", jugadorEquipo2Id: "p4" },
      { jugadorEquipo1Id: "p2", jugadorEquipo2Id: "p5" },
    ];
    expect(parejaSueltaPorDescarte(equipo1, equipo2, parejas)).toBeNull();
  });

  it("con exactamente 2 parejas armadas, devuelve al único suelto de cada Equipo", () => {
    const parejas = [
      { jugadorEquipo1Id: "p0", jugadorEquipo2Id: "p4" },
      { jugadorEquipo1Id: "p1", jugadorEquipo2Id: "p3" },
    ];
    expect(parejaSueltaPorDescarte(equipo1, equipo2, parejas)).toEqual({
      jugadorEquipo1Id: "p2",
      jugadorEquipo2Id: "p5",
    });
  });

  it("el resultado no depende del orden en que se armaron las 2 parejas previas", () => {
    const ordenA = [
      { jugadorEquipo1Id: "p1", jugadorEquipo2Id: "p3" },
      { jugadorEquipo1Id: "p0", jugadorEquipo2Id: "p4" },
    ];
    const ordenB = [...ordenA].reverse();

    expect(parejaSueltaPorDescarte(equipo1, equipo2, ordenA)).toEqual(
      parejaSueltaPorDescarte(equipo1, equipo2, ordenB),
    );
  });
});

// Secuencia completa de toques (ticket #37, corrección de code-review):
// cubre justo el caso que un code-review encontró roto en la primera
// versión — deshacer cualquiera de las 3 parejas ya completas no puede
// volver a armarse sola. Antes de esto solo la función de "quién queda
// suelto" tenía test, nunca la decisión completa de un toque.
describe("siguienteEstadoAlTocar", () => {
  const equipo1 = ["p0", "p1", "p2"];
  const equipo2 = ["p3", "p4", "p5"];
  const vacio: EstadoArmadoDeParejas = { parejas: [], seleccionado: null };

  function aplicarToques(toques: string[]) {
    return toques.reduce(
      (estado, participanteId) => siguienteEstadoAlTocar(estado, participanteId, equipo1, equipo2),
      vacio,
    );
  }

  it("arma una pareja tocando a uno de cada Equipo", () => {
    expect(aplicarToques(["p0", "p3"])).toEqual({
      parejas: [{ jugadorEquipo1Id: "p0", jugadorEquipo2Id: "p3" }],
      seleccionado: null,
    });
  });

  it("tocar dos veces al mismo Participante lo deselecciona", () => {
    expect(aplicarToques(["p0", "p0"])).toEqual(vacio);
  });

  it("tocar a otro del mismo Equipo cambia la selección en vez de formar pareja", () => {
    expect(aplicarToques(["p0", "p1"])).toEqual({ parejas: [], seleccionado: "p1" });
  });

  it("al armar la segunda pareja, la tercera se completa sola con los 2 que quedan sueltos", () => {
    const estado = aplicarToques(["p0", "p3", "p1", "p4"]);

    expect(estado.seleccionado).toBeNull();
    expect(estado.parejas).toHaveLength(3);
    expect(estado.parejas).toContainEqual({ jugadorEquipo1Id: "p2", jugadorEquipo2Id: "p5" });
  });

  it("deshacer la pareja armada por descarte la deja deshecha, sin volver a armarse sola", () => {
    const conLasTres = aplicarToques(["p0", "p3", "p1", "p4"]);

    const estado = siguienteEstadoAlTocar(conLasTres, "p2", equipo1, equipo2);

    expect(estado.parejas).toHaveLength(2);
    expect(estado.parejas).not.toContainEqual({ jugadorEquipo1Id: "p2", jugadorEquipo2Id: "p5" });
  });

  it("deshacer una pareja armada a mano (no la de descarte) también la deja deshecha, sin recalcular nada", () => {
    const conLasTres = aplicarToques(["p0", "p3", "p1", "p4"]);

    const estado = siguienteEstadoAlTocar(conLasTres, "p0", equipo1, equipo2);

    expect(estado.parejas).toHaveLength(2);
    expect(estado.parejas).not.toContainEqual({ jugadorEquipo1Id: "p0", jugadorEquipo2Id: "p3" });
  });
});
