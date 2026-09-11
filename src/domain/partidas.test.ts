import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  usersTable,
  gruposTable,
  gruposParticipantesTable,
  partidasTable,
  partidasParticipantesTable,
} from "../db/schema";
import { registrarParticipante } from "./participantes";
import { crearGrupo } from "./grupos";
import {
  crearPartida,
  crearRevancha,
  crearSiguienteEquipo,
  listarPartidasEnCursoDeGrupo,
  anotarPunto,
  cancelarPartida,
} from "./partidas";

// p0..p6 quedan como miembros del Grupo; p7 registrado pero sin sumarse,
// para el caso de "no es miembro".
const emails = Array.from({ length: 8 }, (_, i) => `test-partidas-p${i}@example.com`);

let participanteIds: string[];
let grupoId: string;

beforeEach(async () => {
  const db = getDb();

  participanteIds = [];
  for (const [i, email] of emails.entries()) {
    const p = await registrarParticipante({
      nombre: `Jugador ${i}`,
      email,
      password: "unaClaveSegura123",
    });
    participanteIds.push(p.id);
  }

  const grupo = await crearGrupo({ nombre: "Grupo de prueba", adminParticipanteId: participanteIds[0] });
  grupoId = grupo.id;

  // Sumamos al resto (menos el último, p7, que queda afuera del Grupo a
  // propósito) directo por DB — no es lo que se está probando acá.
  await db.insert(gruposParticipantesTable).values(
    participanteIds.slice(1, 7).map((participanteId) => ({ grupoId, participanteId })),
  );
});

afterEach(async () => {
  const db = getDb();
  await db.delete(partidasParticipantesTable).where(inArray(partidasParticipantesTable.participanteId, participanteIds));
  await db.delete(partidasTable).where(eq(partidasTable.grupoId, grupoId));
  await db.delete(gruposParticipantesTable).where(eq(gruposParticipantesTable.grupoId, grupoId));
  await db.delete(gruposTable).where(eq(gruposTable.id, grupoId));
  await db.delete(usersTable).where(inArray(usersTable.email, emails));
});

describe("crearPartida", () => {
  it("crea la Partida con los 3+3 Participantes repartidos en Equipos", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });

    expect(partida.grupoId).toBe(grupoId);
    expect(partida.estado).toBe("en_curso");

    const db = getDb();
    const filas = await db
      .select()
      .from(partidasParticipantesTable)
      .where(eq(partidasParticipantesTable.partidaId, partida.id));

    expect(filas).toHaveLength(6);
    expect(filas.filter((f) => f.equipoNumero === 1).map((f) => f.participanteId).sort()).toEqual(
      [p0, p1, p2].sort(),
    );
    expect(filas.filter((f) => f.equipoNumero === 2).map((f) => f.participanteId).sort()).toEqual(
      [p3, p4, p5].sort(),
    );
  });

  it("registra a quien la crea como Anotador", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p1,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });

    expect(partida.anotadorParticipanteId).toBe(p1);
  });

  it("rechaza si un Equipo no tiene exactamente 3 Participantes", async () => {
    const [p0, p1, p2, p3, p4] = participanteIds;
    await expect(
      crearPartida({
        grupoId,
        anotadorParticipanteId: p0,
        equipo1: [p0, p1, p2],
        equipo2: [p3, p4],
      }),
    ).rejects.toThrow("Cada Equipo necesita exactamente 3 Participantes");
  });

  it("rechaza si un Participante está repetido dentro del mismo Equipo", async () => {
    const [p0, p1, p3, p4, p5] = participanteIds;
    await expect(
      crearPartida({
        grupoId,
        anotadorParticipanteId: p0,
        equipo1: [p0, p0, p1],
        equipo2: [p3, p4, p5],
      }),
    ).rejects.toThrow("Un Participante no puede estar repetido en el mismo Equipo");
  });

  it("rechaza si un Participante está en los dos Equipos", async () => {
    const [p0, p1, p2, p3, p4] = participanteIds;
    await expect(
      crearPartida({
        grupoId,
        anotadorParticipanteId: p0,
        equipo1: [p0, p1, p2],
        equipo2: [p2, p3, p4],
      }),
    ).rejects.toThrow("Un Participante no puede estar en los dos Equipos");
  });

  it("rechaza si el Anotador no es ninguno de los 6 Participantes", async () => {
    const [p0, p1, p2, p3, p4, p5, p6] = participanteIds;
    await expect(
      crearPartida({
        grupoId,
        anotadorParticipanteId: p6,
        equipo1: [p0, p1, p2],
        equipo2: [p3, p4, p5],
      }),
    ).rejects.toThrow("El Anotador tiene que ser uno de los 6 Participantes de la Partida");
  });

  it("rechaza si alguno de los 6 no es miembro del Grupo", async () => {
    const [p0, p1, p2, p3, p4, , , p7] = participanteIds;
    await expect(
      crearPartida({
        grupoId,
        anotadorParticipanteId: p0,
        equipo1: [p0, p1, p2],
        equipo2: [p3, p4, p7],
      }),
    ).rejects.toThrow("Los 6 Participantes tienen que ser miembros del Grupo");
  });

  it("rechaza si alguno ya está en otra Partida en_curso", async () => {
    const [p0, p1, p2, p3, p4, p5, p6] = participanteIds;
    await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });

    // p6 es el único Participante libre — el resto de esta segunda Partida
    // reusa gente ya anotada en la primera, a propósito.
    await expect(
      crearPartida({
        grupoId,
        anotadorParticipanteId: p5,
        equipo1: [p3, p4, p5],
        equipo2: [p0, p1, p6],
      }),
    ).rejects.toThrow("Alguno de los Participantes elegidos ya está jugando otra Partida");
  });

  it("rechaza la carrera entre dos creaciones simultáneas con Participantes en común", async () => {
    const [p0, p1, p2, p3, p4, p5, p6] = participanteIds;

    const resultados = await Promise.allSettled([
      crearPartida({
        grupoId,
        anotadorParticipanteId: p0,
        equipo1: [p0, p1, p2],
        equipo2: [p3, p4, p5],
      }),
      crearPartida({
        grupoId,
        anotadorParticipanteId: p1,
        equipo1: [p1, p2, p3],
        equipo2: [p4, p5, p6],
      }),
    ]);

    const cumplidas = resultados.filter((r) => r.status === "fulfilled");
    const rechazadas = resultados.filter((r) => r.status === "rejected");

    expect(cumplidas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect((rechazadas[0] as PromiseRejectedResult).reason.message).toBe(
      "Alguno de los Participantes elegidos ya está jugando otra Partida",
    );
  });

  it("permite dos Partidas en_curso en paralelo con Participantes distintos", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida1 = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });

    expect(partida1.estado).toBe("en_curso");
  });
});

// Semilla una Partida ya finalizada directo por DB (equivalente a llegar a
// 30 vía anotarPunto, sin el round-trip) — reutilizada por crearRevancha y,
// más adelante, por crearSiguienteEquipo (ticket #13).
async function crearPartidaFinalizada(equipoGanador: 1 | 2 = 1) {
  const [p0, p1, p2, p3, p4, p5] = participanteIds;
  const partida = await crearPartida({
    grupoId,
    anotadorParticipanteId: p0,
    equipo1: [p0, p1, p2],
    equipo2: [p3, p4, p5],
  });

  const db = getDb();
  const puntos = equipoGanador === 1 ? { equipo1Puntos: 30 } : { equipo2Puntos: 30 };
  const [finalizada] = await db
    .update(partidasTable)
    .set({ ...puntos, estado: "finalizada", equipoGanador, fechaFin: new Date() })
    .where(eq(partidasTable.id, partida.id))
    .returning();

  return finalizada;
}

describe("crearRevancha", () => {
  it("arma una Partida nueva con los mismos 6 Participantes, misma división y mismo Anotador", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const original = await crearPartidaFinalizada();

    const revancha = await crearRevancha({ partidaId: original.id, solicitanteId: p0 });

    expect(revancha.id).not.toBe(original.id);
    expect(revancha.estado).toBe("en_curso");
    expect(revancha.anotadorParticipanteId).toBe(p0);
    expect(revancha.equipo1Puntos).toBe(0);
    expect(revancha.equipo2Puntos).toBe(0);

    const db = getDb();
    const filas = await db
      .select()
      .from(partidasParticipantesTable)
      .where(eq(partidasParticipantesTable.partidaId, revancha.id));

    expect(filas.filter((f) => f.equipoNumero === 1).map((f) => f.participanteId).sort()).toEqual(
      [p0, p1, p2].sort(),
    );
    expect(filas.filter((f) => f.equipoNumero === 2).map((f) => f.participanteId).sort()).toEqual(
      [p3, p4, p5].sort(),
    );
  });

  it("rechaza si la Partida no existe", async () => {
    const [p0] = participanteIds;
    await expect(
      crearRevancha({ partidaId: "00000000-0000-0000-0000-000000000000", solicitanteId: p0 }),
    ).rejects.toThrow("La Partida no existe");
  });

  it("rechaza si la Partida está en_curso", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });

    await expect(
      crearRevancha({ partidaId: partida.id, solicitanteId: p0 }),
    ).rejects.toThrow("Solo se puede pedir Revancha de una Partida finalizada");
  });

  it("rechaza si la Partida está cancelada", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });
    await cancelarPartida({ partidaId: partida.id, solicitanteId: p0 });

    await expect(
      crearRevancha({ partidaId: partida.id, solicitanteId: p0 }),
    ).rejects.toThrow("Solo se puede pedir Revancha de una Partida finalizada");
  });

  it("rechaza si quien la pide no era el Anotador de la Partida original", async () => {
    const [, p1] = participanteIds;
    const original = await crearPartidaFinalizada();

    await expect(
      crearRevancha({ partidaId: original.id, solicitanteId: p1 }),
    ).rejects.toThrow("Solo el Anotador de la Partida puede pedir Revancha");
  });

  it("rechaza si alguno de los 6 ya está jugando otra Partida en_curso", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const original = await crearPartidaFinalizada();

    // p0 (el Anotador de la original) ya quedó anotado en otra Partida
    // en_curso aparte, con gente distinta.
    await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });

    await expect(
      crearRevancha({ partidaId: original.id, solicitanteId: p0 }),
    ).rejects.toThrow("Alguno de los Participantes elegidos ya está jugando otra Partida");
  });
});

describe("crearSiguienteEquipo", () => {
  it("deja fijo al Equipo ganador y arma el desafiante con los Participantes indicados", async () => {
    const [p0, p1, p2, p3, p4, , p6] = participanteIds;
    const original = await crearPartidaFinalizada(1); // gana equipo1 = [p0, p1, p2]

    const siguiente = await crearSiguienteEquipo({
      partidaId: original.id,
      solicitanteId: p0,
      equipoDesafiante: [p3, p4, p6],
    });

    expect(siguiente.estado).toBe("en_curso");
    expect(siguiente.equipo1Puntos).toBe(0);
    expect(siguiente.equipo2Puntos).toBe(0);

    const db = getDb();
    const filas = await db
      .select()
      .from(partidasParticipantesTable)
      .where(eq(partidasParticipantesTable.partidaId, siguiente.id));

    expect(filas.filter((f) => f.equipoNumero === 1).map((f) => f.participanteId).sort()).toEqual(
      [p0, p1, p2].sort(),
    );
    expect(filas.filter((f) => f.equipoNumero === 2).map((f) => f.participanteId).sort()).toEqual(
      [p3, p4, p6].sort(),
    );
  });

  it("si el Anotador anterior ganó, sigue siendo Anotador sin necesidad de nuevoAnotadorParticipanteId", async () => {
    const [p0, , , p3, p4, , p6] = participanteIds;
    const original = await crearPartidaFinalizada(1);

    const siguiente = await crearSiguienteEquipo({
      partidaId: original.id,
      solicitanteId: p0,
      equipoDesafiante: [p3, p4, p6],
    });

    expect(siguiente.anotadorParticipanteId).toBe(p0);
  });

  it("si el Anotador anterior ganó, ignora nuevoAnotadorParticipanteId si vino igual", async () => {
    const [p0, p1, , p3, p4, , p6] = participanteIds;
    const original = await crearPartidaFinalizada(1);

    const siguiente = await crearSiguienteEquipo({
      partidaId: original.id,
      solicitanteId: p0,
      equipoDesafiante: [p3, p4, p6],
      nuevoAnotadorParticipanteId: p1,
    });

    expect(siguiente.anotadorParticipanteId).toBe(p0);
  });

  it("si el Anotador anterior perdió, exige nuevoAnotadorParticipanteId", async () => {
    const [p0, p1, p2, , , , p6] = participanteIds;
    // equipoGanador: 2 -> gana equipo2 = [p3, p4, p5]; el Anotador (p0) quedó
    // en equipo1, el que se reemplaza.
    const original = await crearPartidaFinalizada(2);

    await expect(
      crearSiguienteEquipo({
        partidaId: original.id,
        solicitanteId: p0,
        equipoDesafiante: [p1, p2, p6],
      }),
    ).rejects.toThrow("Elegí quién anota la Partida nueva");
  });

  it("si el Anotador anterior perdió, acepta como nuevo Anotador a alguien del Equipo ganador", async () => {
    const [p0, p1, p2, , p4, , p6] = participanteIds;
    const original = await crearPartidaFinalizada(2); // gana equipo2 = [p3, p4, p5]

    const siguiente = await crearSiguienteEquipo({
      partidaId: original.id,
      solicitanteId: p0,
      equipoDesafiante: [p1, p2, p6],
      nuevoAnotadorParticipanteId: p4,
    });

    expect(siguiente.anotadorParticipanteId).toBe(p4);
  });

  it("si el Anotador anterior perdió, acepta como nuevo Anotador a alguien del Equipo desafiante", async () => {
    const [p0, p1, p2, , , , p6] = participanteIds;
    const original = await crearPartidaFinalizada(2);

    const siguiente = await crearSiguienteEquipo({
      partidaId: original.id,
      solicitanteId: p0,
      equipoDesafiante: [p1, p2, p6],
      nuevoAnotadorParticipanteId: p6,
    });

    expect(siguiente.anotadorParticipanteId).toBe(p6);
  });

  it("rechaza si nuevoAnotadorParticipanteId no es uno de los 6 finales", async () => {
    const [p0, p1, p2, , , , p6] = participanteIds;
    const original = await crearPartidaFinalizada(2);

    await expect(
      crearSiguienteEquipo({
        partidaId: original.id,
        solicitanteId: p0,
        equipoDesafiante: [p1, p2, p6],
        // p0 no juega esta Partida nueva: perdió y quedó afuera de ambos
        // Equipos (Equipo ganador = [p3, p4, p5], desafiante = [p1, p2, p6]).
        nuevoAnotadorParticipanteId: p0,
      }),
    ).rejects.toThrow("El nuevo Anotador tiene que ser uno de los 6 Participantes de la Partida nueva");
  });

  it("rechaza si la Partida referenciada no está finalizada", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });

    await expect(
      crearSiguienteEquipo({
        partidaId: partida.id,
        solicitanteId: p0,
        equipoDesafiante: [p3, p4, p5],
      }),
    ).rejects.toThrow("Solo se puede armar el Siguiente equipo desde una Partida finalizada");
  });

  it("rechaza si quien lo pide no era el Anotador de la Partida original", async () => {
    const [, p1, , p3, p4, , p6] = participanteIds;
    const original = await crearPartidaFinalizada(1);

    await expect(
      crearSiguienteEquipo({
        partidaId: original.id,
        solicitanteId: p1,
        equipoDesafiante: [p3, p4, p6],
      }),
    ).rejects.toThrow("Solo el Anotador de la Partida puede armar el Siguiente equipo");
  });

  it("respeta la exclusividad existente (delega en crearPartida)", async () => {
    const [p0, p1, p2, p3, p4, p5, p6] = participanteIds;
    const original = await crearPartidaFinalizada(1); // gana equipo1 = [p0, p1, p2], libera a todos

    // Dos del propio Equipo ganador (p1, p2) quedan anotados en otra Partida
    // en_curso aparte -- este Grupo de prueba no tiene gente suficiente para
    // aislar el conflicto solo del lado del desafiante.
    await crearPartida({
      grupoId,
      anotadorParticipanteId: p1,
      equipo1: [p1, p2, p6],
      equipo2: [p3, p4, p5],
    });

    await expect(
      crearSiguienteEquipo({
        partidaId: original.id,
        solicitanteId: p0,
        equipoDesafiante: [p3, p4, p6],
      }),
    ).rejects.toThrow("Alguno de los Participantes elegidos ya está jugando otra Partida");
  });
});

describe("listarPartidasEnCursoDeGrupo", () => {
  it("devuelve la Partida en_curso con sus dos Equipos", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });

    const partidas = await listarPartidasEnCursoDeGrupo(grupoId);
    const encontrada = partidas.find((p) => p.id === partida.id);

    expect(encontrada).toBeTruthy();
    expect(encontrada?.equipo1.map((m) => m.participanteId).sort()).toEqual([p0, p1, p2].sort());
    expect(encontrada?.equipo2.map((m) => m.participanteId).sort()).toEqual([p3, p4, p5].sort());
  });

  it("no devuelve Partidas canceladas", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });

    const db = getDb();
    await db.update(partidasTable).set({ estado: "cancelada" }).where(eq(partidasTable.id, partida.id));

    const partidas = await listarPartidasEnCursoDeGrupo(grupoId);
    expect(partidas.map((p) => p.id)).not.toContain(partida.id);
  });
});

describe("anotarPunto", () => {
  async function crearPartidaDePrueba() {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    return crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });
  }

  it("suma un punto al Equipo indicado", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();

    const actualizada = await anotarPunto({
      partidaId: partida.id,
      solicitanteId: p0,
      equipo: 1,
      delta: 1,
    });

    expect(actualizada.equipo1Puntos).toBe(1);
    expect(actualizada.equipo2Puntos).toBe(0);
    expect(actualizada.estado).toBe("en_curso");
  });

  it("resta un punto al Equipo indicado", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await anotarPunto({ partidaId: partida.id, solicitanteId: p0, equipo: 2, delta: 1 });

    const actualizada = await anotarPunto({
      partidaId: partida.id,
      solicitanteId: p0,
      equipo: 2,
      delta: -1,
    });

    expect(actualizada.equipo2Puntos).toBe(0);
  });

  it("el contador nunca queda por debajo de 0", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();

    const actualizada = await anotarPunto({
      partidaId: partida.id,
      solicitanteId: p0,
      equipo: 1,
      delta: -1,
    });

    expect(actualizada.equipo1Puntos).toBe(0);
    expect(actualizada.estado).toBe("en_curso");
  });

  it("rechaza si quien anota no es el Anotador de la Partida", async () => {
    const [p0, p1] = participanteIds;
    const partida = await crearPartidaDePrueba();

    await expect(
      anotarPunto({ partidaId: partida.id, solicitanteId: p1, equipo: 1, delta: 1 }),
    ).rejects.toThrow("Solo el Anotador de la Partida puede cargar puntos");
  });

  it("rechaza si la Partida no está en_curso", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await cancelarPartida({ partidaId: partida.id, solicitanteId: p0 });

    await expect(
      anotarPunto({ partidaId: partida.id, solicitanteId: p0, equipo: 1, delta: 1 }),
    ).rejects.toThrow("La Partida no está en curso");
  });

  // Llegar a 30 anotando de a uno tomaría 30 round-trips a la base de test
  // (supera el timeout de vitest por test) — se siembra el marcador en 29
  // directo por DB, igual que el resto de la suite ya hace para arrancar en
  // un estado puntual (ver "no devuelve Partidas canceladas" más arriba), y
  // se prueba solo la transición 29 → 30 que es lo que importa acá.
  async function sembrarEquipo1En29(partidaId: string) {
    const db = getDb();
    await db.update(partidasTable).set({ equipo1Puntos: 29 }).where(eq(partidasTable.id, partidaId));
  }

  it("al llegar a 30 cierra la Partida como finalizada y registra el Equipo ganador", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarEquipo1En29(partida.id);

    const actual = await anotarPunto({ partidaId: partida.id, solicitanteId: p0, equipo: 1, delta: 1 });

    expect(actual.equipo1Puntos).toBe(30);
    expect(actual.estado).toBe("finalizada");
    expect(actual.equipoGanador).toBe(1);
    expect(actual.fechaFin).toBeTruthy();
  });

  it("al llegar a 30 no deja seguir anotando en esa Partida", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarEquipo1En29(partida.id);
    await anotarPunto({ partidaId: partida.id, solicitanteId: p0, equipo: 1, delta: 1 });

    await expect(
      anotarPunto({ partidaId: partida.id, solicitanteId: p0, equipo: 2, delta: 1 }),
    ).rejects.toThrow("La Partida no está en curso");
  });

  it("al llegar a 30 actualiza las estadísticas de los 6 Participantes en la misma operación", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarEquipo1En29(partida.id);
    await anotarPunto({ partidaId: partida.id, solicitanteId: p0, equipo: 1, delta: 1 });

    const db = getDb();
    const stats = await db
      .select()
      .from(gruposParticipantesTable)
      .where(eq(gruposParticipantesTable.grupoId, grupoId));

    const porId = new Map(stats.map((s) => [s.participanteId, s]));

    for (const ganadorId of [p0, p1, p2]) {
      const s = porId.get(ganadorId)!;
      expect(s.puntos).toBe(1);
      expect(s.partidasJugadas).toBe(1);
      expect(s.partidasGanadas).toBe(1);
      expect(s.partidasPerdidas).toBe(0);
    }

    for (const perdedorId of [p3, p4, p5]) {
      const s = porId.get(perdedorId)!;
      expect(s.puntos).toBe(0);
      expect(s.partidasJugadas).toBe(1);
      expect(s.partidasGanadas).toBe(0);
      expect(s.partidasPerdidas).toBe(1);
    }
  });
});

describe("cancelarPartida", () => {
  it("cancela una Partida en_curso", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });

    const cancelada = await cancelarPartida({ partidaId: partida.id, solicitanteId: p0 });

    expect(cancelada.estado).toBe("cancelada");
    expect(cancelada.fechaFin).toBeTruthy();
  });

  it("libera a sus Participantes para una Partida nueva", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });
    await cancelarPartida({ partidaId: partida.id, solicitanteId: p0 });

    const nueva = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });

    expect(nueva.estado).toBe("en_curso");
  });

  it("no afecta ninguna estadística", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });
    await anotarPunto({ partidaId: partida.id, solicitanteId: p0, equipo: 1, delta: 1 });
    await cancelarPartida({ partidaId: partida.id, solicitanteId: p0 });

    const db = getDb();
    const stats = await db
      .select()
      .from(gruposParticipantesTable)
      .where(eq(gruposParticipantesTable.grupoId, grupoId));

    for (const s of stats) {
      expect(s.partidasJugadas).toBe(0);
      expect(s.partidasGanadas).toBe(0);
      expect(s.partidasPerdidas).toBe(0);
      expect(s.puntos).toBe(0);
    }
  });

  it("rechaza si quien cancela no es el Anotador de la Partida", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });

    await expect(
      cancelarPartida({ partidaId: partida.id, solicitanteId: p1 }),
    ).rejects.toThrow("Solo el Anotador de la Partida puede cancelarla");
  });

  it("rechaza si la Partida no está en_curso", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
    });
    await cancelarPartida({ partidaId: partida.id, solicitanteId: p0 });

    await expect(
      cancelarPartida({ partidaId: partida.id, solicitanteId: p0 }),
    ).rejects.toThrow("La Partida no está en curso");
  });
});
