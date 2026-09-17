import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  usersTable,
  gruposTable,
  gruposParticipantesTable,
  partidasTable,
  partidasParticipantesTable,
  picaPicaParejaTable,
} from "../db/schema";
import { registrarParticipante } from "./participantes";
import { crearGrupo, obtenerGrupoPorId, actualizarVentanaInactividad } from "./grupos";
import {
  crearPartida,
  crearRevancha,
  crearSiguienteEquipo,
  listarPartidasEnCursoDeGrupo,
  anotarPunto,
  cargarResultadoDeMano,
  cancelarPartida,
  corregirBloqueManualmente,
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

// Pica-pica: pareja por posición (equipo1[i] enfrenta a equipo2[i]) — no
// repite a mano el objeto {jugadorEquipo1Id, jugadorEquipo2Id} en cada
// test; el orden puntual no le importa a lo que prueba este archivo, solo
// que sea una asignación 1 a 1 válida entre los dos Equipos.
function parejasPorPosicion(equipo1: string[], equipo2: string[]) {
  return equipo1.map((jugadorEquipo1Id, i) => ({
    jugadorEquipo1Id,
    jugadorEquipo2Id: equipo2[i],
  }));
}

describe("crearPartida", () => {
  it("crea la Partida con los 3+3 Participantes repartidos en Equipos", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
    });

    expect(partida.anotadorParticipanteId).toBe(p1);
  });

  it("arranca en Bloque Ronda, sin ningún punto anotado todavía", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
    });

    expect(partida.tipoDeBloqueActual).toBe("ronda");
    expect(partida.manosJugadasEnBloqueActual).toBe(0);
    expect(partida.ultimoPuntoAnotadoEn).toBeNull();
  });

  it("rechaza si un Equipo no tiene exactamente 3 Participantes", async () => {
    const [p0, p1, p2, p3, p4] = participanteIds;
    await expect(
      crearPartida({
        grupoId,
        anotadorParticipanteId: p0,
        equipo1: [p0, p1, p2],
        equipo2: [p3, p4],
        picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4]),
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
        picaPicaParejas: parejasPorPosicion([p0, p0, p1], [p3, p4, p5]),
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
        picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p2, p3, p4]),
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
        picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
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
        picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p7]),
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
    });

    // p6 es el único Participante libre — el resto de esta segunda Partida
    // reusa gente ya anotada en la primera, a propósito.
    await expect(
      crearPartida({
        grupoId,
        anotadorParticipanteId: p5,
        equipo1: [p3, p4, p5],
        equipo2: [p0, p1, p6],
        picaPicaParejas: parejasPorPosicion([p3, p4, p5], [p0, p1, p6]),
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
        picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
      }),
      crearPartida({
        grupoId,
        anotadorParticipanteId: p1,
        equipo1: [p1, p2, p3],
        equipo2: [p4, p5, p6],
        picaPicaParejas: parejasPorPosicion([p1, p2, p3], [p4, p5, p6]),
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
    });

    expect(partida1.estado).toBe("en_curso");
  });

  it("persiste las 3 parejas de Pica-pica asociadas a la Partida, en orden", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
      picaPicaParejas: [
        { jugadorEquipo1Id: p1, jugadorEquipo2Id: p4 },
        { jugadorEquipo1Id: p2, jugadorEquipo2Id: p5 },
        { jugadorEquipo1Id: p0, jugadorEquipo2Id: p3 },
      ],
    });

    const db = getDb();
    const filas = await db
      .select()
      .from(picaPicaParejaTable)
      .where(eq(picaPicaParejaTable.partidaId, partida.id))
      .orderBy(picaPicaParejaTable.posicion);

    expect(filas).toHaveLength(3);
    expect(filas.map((f) => [f.posicion, f.jugadorEquipo1Id, f.jugadorEquipo2Id])).toEqual([
      [1, p1, p4],
      [2, p2, p5],
      [3, p0, p3],
    ]);
  });

  it("rechaza si las parejas de Pica-pica no son exactamente 3", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    await expect(
      crearPartida({
        grupoId,
        anotadorParticipanteId: p0,
        equipo1: [p0, p1, p2],
        equipo2: [p3, p4, p5],
        picaPicaParejas: [
          { jugadorEquipo1Id: p0, jugadorEquipo2Id: p3 },
          { jugadorEquipo1Id: p1, jugadorEquipo2Id: p4 },
        ],
      }),
    ).rejects.toThrow("Las parejas de Pica-pica tienen que ser exactamente 3");
  });

  it("rechaza si una pareja repite un Participante que ya está emparejado en otra", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    await expect(
      crearPartida({
        grupoId,
        anotadorParticipanteId: p0,
        equipo1: [p0, p1, p2],
        equipo2: [p3, p4, p5],
        picaPicaParejas: [
          { jugadorEquipo1Id: p0, jugadorEquipo2Id: p3 },
          { jugadorEquipo1Id: p0, jugadorEquipo2Id: p4 },
          { jugadorEquipo1Id: p2, jugadorEquipo2Id: p5 },
        ],
      }),
    ).rejects.toThrow(
      "Las parejas de Pica-pica tienen que emparejar 1 a 1 a los 3 Participantes de cada Equipo, sin repetidos",
    );
  });

  it("rechaza si una pareja incluye a alguien que no pertenece al Equipo que dice representar", async () => {
    const [p0, p1, p2, p3, p4, p5, p6] = participanteIds;
    await expect(
      crearPartida({
        grupoId,
        anotadorParticipanteId: p0,
        equipo1: [p0, p1, p2],
        equipo2: [p3, p4, p5],
        picaPicaParejas: [
          { jugadorEquipo1Id: p0, jugadorEquipo2Id: p3 },
          { jugadorEquipo1Id: p1, jugadorEquipo2Id: p4 },
          // p6 no juega esta Partida — no es ninguno de los 3 de Equipo 1.
          { jugadorEquipo1Id: p6, jugadorEquipo2Id: p5 },
        ],
      }),
    ).rejects.toThrow(
      "Las parejas de Pica-pica tienen que emparejar 1 a 1 a los 3 Participantes de cada Equipo, sin repetidos",
    );
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
    picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
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
    expect(revancha.tipoDeBloqueActual).toBe("ronda");

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

  it("copia las mismas parejas de Pica-pica que tenía la Partida de referencia, sin pedir nada nuevo", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    // crearPartidaFinalizada arma las parejas con parejasPorPosicion:
    // (p0,p3), (p1,p4), (p2,p5) — ver más arriba.
    const original = await crearPartidaFinalizada();

    const revancha = await crearRevancha({ partidaId: original.id, solicitanteId: p0 });

    const db = getDb();
    const parejasOriginal = await db
      .select({ jugadorEquipo1Id: picaPicaParejaTable.jugadorEquipo1Id, jugadorEquipo2Id: picaPicaParejaTable.jugadorEquipo2Id })
      .from(picaPicaParejaTable)
      .where(eq(picaPicaParejaTable.partidaId, original.id))
      .orderBy(picaPicaParejaTable.posicion);
    const parejasRevancha = await db
      .select({ jugadorEquipo1Id: picaPicaParejaTable.jugadorEquipo1Id, jugadorEquipo2Id: picaPicaParejaTable.jugadorEquipo2Id })
      .from(picaPicaParejaTable)
      .where(eq(picaPicaParejaTable.partidaId, revancha.id))
      .orderBy(picaPicaParejaTable.posicion);

    expect(parejasRevancha).toEqual(parejasOriginal);
    expect(parejasRevancha).toEqual([
      { jugadorEquipo1Id: p0, jugadorEquipo2Id: p3 },
      { jugadorEquipo1Id: p1, jugadorEquipo2Id: p4 },
      { jugadorEquipo1Id: p2, jugadorEquipo2Id: p5 },
    ]);
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p6]),
    });

    expect(siguiente.estado).toBe("en_curso");
    expect(siguiente.equipo1Puntos).toBe(0);
    expect(siguiente.equipo2Puntos).toBe(0);
    expect(siguiente.tipoDeBloqueActual).toBe("ronda");

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

    const parejas = await db
      .select({ jugadorEquipo1Id: picaPicaParejaTable.jugadorEquipo1Id, jugadorEquipo2Id: picaPicaParejaTable.jugadorEquipo2Id })
      .from(picaPicaParejaTable)
      .where(eq(picaPicaParejaTable.partidaId, siguiente.id))
      .orderBy(picaPicaParejaTable.posicion);
    expect(parejas).toEqual([
      { jugadorEquipo1Id: p0, jugadorEquipo2Id: p3 },
      { jugadorEquipo1Id: p1, jugadorEquipo2Id: p4 },
      { jugadorEquipo1Id: p2, jugadorEquipo2Id: p6 },
    ]);
  });

  it("rechaza si las parejas de Pica-pica no corresponden a los Equipos nuevos (no se copian de la Partida anterior)", async () => {
    const [p0, p1, p2, p3, p4, p5, p6] = participanteIds;
    const original = await crearPartidaFinalizada(1); // gana equipo1 = [p0, p1, p2]

    await expect(
      crearSiguienteEquipo({
        partidaId: original.id,
        solicitanteId: p0,
        equipoDesafiante: [p3, p4, p6],
        // Parejas de la Partida original (contra p5, que ya no juega esta
        // Partida nueva) — a propósito, para confirmar que no se heredan.
        picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
      }),
    ).rejects.toThrow(
      "Las parejas de Pica-pica tienen que emparejar 1 a 1 a los 3 Participantes de cada Equipo, sin repetidos",
    );
  });

  it("si el Anotador anterior ganó, sigue siendo Anotador sin necesidad de nuevoAnotadorParticipanteId", async () => {
    const [p0, p1, p2, p3, p4, , p6] = participanteIds;
    const original = await crearPartidaFinalizada(1);

    const siguiente = await crearSiguienteEquipo({
      partidaId: original.id,
      solicitanteId: p0,
      equipoDesafiante: [p3, p4, p6],
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p6]),
    });

    expect(siguiente.anotadorParticipanteId).toBe(p0);
  });

  it("si el Anotador anterior ganó, ignora nuevoAnotadorParticipanteId si vino igual", async () => {
    const [p0, p1, p2, p3, p4, , p6] = participanteIds;
    const original = await crearPartidaFinalizada(1);

    const siguiente = await crearSiguienteEquipo({
      partidaId: original.id,
      solicitanteId: p0,
      equipoDesafiante: [p3, p4, p6],
      nuevoAnotadorParticipanteId: p1,
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p6]),
    });

    expect(siguiente.anotadorParticipanteId).toBe(p0);
  });

  it("si el Anotador anterior perdió, exige nuevoAnotadorParticipanteId", async () => {
    const [p0, p1, p2, p3, p4, p5, p6] = participanteIds;
    // equipoGanador: 2 -> gana equipo2 = [p3, p4, p5]; el Anotador (p0) quedó
    // en equipo1, el que se reemplaza.
    const original = await crearPartidaFinalizada(2);

    await expect(
      crearSiguienteEquipo({
        partidaId: original.id,
        solicitanteId: p0,
        equipoDesafiante: [p1, p2, p6],
        picaPicaParejas: parejasPorPosicion([p3, p4, p5], [p1, p2, p6]),
      }),
    ).rejects.toThrow("Elegí quién anota la Partida nueva");
  });

  it("si el Anotador anterior perdió, acepta como nuevo Anotador a alguien del Equipo ganador", async () => {
    const [p0, p1, p2, p3, p4, p5, p6] = participanteIds;
    const original = await crearPartidaFinalizada(2); // gana equipo2 = [p3, p4, p5]

    const siguiente = await crearSiguienteEquipo({
      partidaId: original.id,
      solicitanteId: p0,
      equipoDesafiante: [p1, p2, p6],
      nuevoAnotadorParticipanteId: p4,
      picaPicaParejas: parejasPorPosicion([p3, p4, p5], [p1, p2, p6]),
    });

    expect(siguiente.anotadorParticipanteId).toBe(p4);
  });

  it("si el Anotador anterior perdió, acepta como nuevo Anotador a alguien del Equipo desafiante", async () => {
    const [p0, p1, p2, p3, p4, p5, p6] = participanteIds;
    const original = await crearPartidaFinalizada(2);

    const siguiente = await crearSiguienteEquipo({
      partidaId: original.id,
      solicitanteId: p0,
      equipoDesafiante: [p1, p2, p6],
      nuevoAnotadorParticipanteId: p6,
      picaPicaParejas: parejasPorPosicion([p3, p4, p5], [p1, p2, p6]),
    });

    expect(siguiente.anotadorParticipanteId).toBe(p6);
  });

  it("rechaza si nuevoAnotadorParticipanteId no es uno de los 6 finales", async () => {
    const [p0, p1, p2, p3, p4, p5, p6] = participanteIds;
    const original = await crearPartidaFinalizada(2);

    await expect(
      crearSiguienteEquipo({
        partidaId: original.id,
        solicitanteId: p0,
        equipoDesafiante: [p1, p2, p6],
        // p0 no juega esta Partida nueva: perdió y quedó afuera de ambos
        // Equipos (Equipo ganador = [p3, p4, p5], desafiante = [p1, p2, p6]).
        nuevoAnotadorParticipanteId: p0,
        picaPicaParejas: parejasPorPosicion([p3, p4, p5], [p1, p2, p6]),
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
    });

    await expect(
      crearSiguienteEquipo({
        partidaId: partida.id,
        solicitanteId: p0,
        equipoDesafiante: [p3, p4, p5],
        picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
      }),
    ).rejects.toThrow("Solo se puede armar el Siguiente equipo desde una Partida finalizada");
  });

  it("rechaza si quien lo pide no era el Anotador de la Partida original", async () => {
    const [p0, p1, p2, p3, p4, , p6] = participanteIds;
    const original = await crearPartidaFinalizada(1);

    await expect(
      crearSiguienteEquipo({
        partidaId: original.id,
        solicitanteId: p1,
        equipoDesafiante: [p3, p4, p6],
        picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p6]),
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
      picaPicaParejas: parejasPorPosicion([p1, p2, p6], [p3, p4, p5]),
    });

    await expect(
      crearSiguienteEquipo({
        partidaId: original.id,
        solicitanteId: p0,
        equipoDesafiante: [p3, p4, p6],
        picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p6]),
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
    });

    const db = getDb();
    await db.update(partidasTable).set({ estado: "cancelada" }).where(eq(partidasTable.id, partida.id));

    const partidas = await listarPartidasEnCursoDeGrupo(grupoId);
    expect(partidas.map((p) => p.id)).not.toContain(partida.id);
  });
});

async function crearPartidaDePrueba() {
  const [p0, p1, p2, p3, p4, p5] = participanteIds;
  return crearPartida({
    grupoId,
    anotadorParticipanteId: p0,
    equipo1: [p0, p1, p2],
    equipo2: [p3, p4, p5],
    picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
  });
}

async function estadisticasPorParticipante() {
  const db = getDb();
  const stats = await db
    .select()
    .from(gruposParticipantesTable)
    .where(eq(gruposParticipantesTable.grupoId, grupoId));

  return new Map(stats.map((s) => [s.participanteId, s]));
}

// Siembra el marcador/Bloque directo por DB — igual que el resto de la
// suite ya hace para arrancar en un estado puntual sin depender de
// round-trips reales (ver "no devuelve Partidas canceladas" más arriba).
async function sembrarMarcador(
  partidaId: string,
  valores: {
    equipo1Puntos?: number;
    equipo2Puntos?: number;
    tipoDeBloqueActual?: "ronda" | "pica_pica";
    manosJugadasEnBloqueActual?: number;
  },
) {
  const db = getDb();
  await db.update(partidasTable).set(valores).where(eq(partidasTable.id, partidaId));
}

describe("anotarPunto", () => {
  it("resta un punto al Equipo indicado", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarMarcador(partida.id, { equipo2Puntos: 1 });

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
      anotarPunto({ partidaId: partida.id, solicitanteId: p1, equipo: 1, delta: -1 }),
    ).rejects.toThrow("Solo el Anotador de la Partida puede cargar puntos");
  });

  it("rechaza si la Partida no está en_curso", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await cancelarPartida({ partidaId: partida.id, solicitanteId: p0 });

    await expect(
      anotarPunto({ partidaId: partida.id, solicitanteId: p0, equipo: 1, delta: -1 }),
    ).rejects.toThrow("La Partida no está en curso");
  });

  it("nunca toca tipoDeBloqueActual ni manosJugadasEnBloqueActual", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarMarcador(partida.id, {
      equipo1Puntos: 5,
      tipoDeBloqueActual: "pica_pica",
      manosJugadasEnBloqueActual: 1,
    });

    const actualizada = await anotarPunto({
      partidaId: partida.id,
      solicitanteId: p0,
      equipo: 1,
      delta: -1,
    });

    expect(actualizada.equipo1Puntos).toBe(4);
    expect(actualizada.tipoDeBloqueActual).toBe("pica_pica");
    expect(actualizada.manosJugadasEnBloqueActual).toBe(1);
  });
});

describe("cargarResultadoDeMano", () => {
  it("carga el delta neto de ambos Equipos en una sola llamada", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();

    const actualizada = await cargarResultadoDeMano({
      partidaId: partida.id,
      solicitanteId: p0,
      deltaEquipo1: 2,
      deltaEquipo2: 3,
    });

    expect(actualizada.equipo1Puntos).toBe(2);
    expect(actualizada.equipo2Puntos).toBe(3);
    expect(actualizada.estado).toBe("en_curso");
  });

  it("acepta un delta de 0 para un solo Equipo (Mano que le dio puntos a uno solo)", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();

    const actualizada = await cargarResultadoDeMano({
      partidaId: partida.id,
      solicitanteId: p0,
      deltaEquipo1: 3,
      deltaEquipo2: 0,
    });

    expect(actualizada.equipo1Puntos).toBe(3);
    expect(actualizada.equipo2Puntos).toBe(0);
  });

  it("rechaza si los dos deltas son 0 (no existe la Mano 0 a 0)", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();

    await expect(
      cargarResultadoDeMano({ partidaId: partida.id, solicitanteId: p0, deltaEquipo1: 0, deltaEquipo2: 0 }),
    ).rejects.toThrow("Una Mano tiene que otorgar al menos 1 punto, a uno o a ambos Equipos");
  });

  it("rechaza un delta negativo", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();

    await expect(
      cargarResultadoDeMano({ partidaId: partida.id, solicitanteId: p0, deltaEquipo1: -1, deltaEquipo2: 0 }),
    ).rejects.toThrow("El resultado de una Mano tiene que ser un número entero, 0 o más, por Equipo");
  });

  it("rechaza si quien carga el resultado no es el Anotador de la Partida", async () => {
    const [p0, p1] = participanteIds;
    const partida = await crearPartidaDePrueba();

    await expect(
      cargarResultadoDeMano({ partidaId: partida.id, solicitanteId: p1, deltaEquipo1: 1, deltaEquipo2: 0 }),
    ).rejects.toThrow("Solo el Anotador de la Partida puede cargar puntos");
  });

  it("rechaza si la Partida no está en_curso", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await cancelarPartida({ partidaId: partida.id, solicitanteId: p0 });

    await expect(
      cargarResultadoDeMano({ partidaId: partida.id, solicitanteId: p0, deltaEquipo1: 1, deltaEquipo2: 0 }),
    ).rejects.toThrow("La Partida no está en curso");
  });

  it("clampea a 30 aunque el delta se pase", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarMarcador(partida.id, { equipo1Puntos: 28 });

    const actualizada = await cargarResultadoDeMano({
      partidaId: partida.id,
      solicitanteId: p0,
      deltaEquipo1: 5,
      deltaEquipo2: 0,
    });

    expect(actualizada.equipo1Puntos).toBe(30);
    expect(actualizada.estado).toBe("finalizada");
    expect(actualizada.equipoGanador).toBe(1);
    expect(actualizada.fechaFin).toBeTruthy();
  });

  it("no deja seguir anotando en una Partida ya finalizada", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarMarcador(partida.id, { equipo1Puntos: 29 });
    await cargarResultadoDeMano({ partidaId: partida.id, solicitanteId: p0, deltaEquipo1: 1, deltaEquipo2: 0 });

    await expect(
      cargarResultadoDeMano({ partidaId: partida.id, solicitanteId: p0, deltaEquipo1: 0, deltaEquipo2: 1 }),
    ).rejects.toThrow("La Partida no está en curso");
  });

  it("actualiza las estadísticas de los 6 Participantes en la misma operación al cerrar", async () => {
    const [p0, p1, p2, p3, p4, p5] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarMarcador(partida.id, { equipo1Puntos: 29 });
    await cargarResultadoDeMano({ partidaId: partida.id, solicitanteId: p0, deltaEquipo1: 1, deltaEquipo2: 0 });

    const porId = await estadisticasPorParticipante();

    for (const ganadorId of [p0, p1, p2]) {
      const s = porId.get(ganadorId)!;
      expect(s.partidasJugadas).toBe(1);
      expect(s.partidasGanadas).toBe(1);
      expect(s.partidasPerdidas).toBe(0);
    }

    for (const perdedorId of [p3, p4, p5]) {
      const s = porId.get(perdedorId)!;
      expect(s.puntos).toBe(0);
      expect(s.partidasJugadas).toBe(1);
      expect(s.partidasGanadas).toBe(0);
      expect(s.partidasGanadasDobles).toBe(0);
      expect(s.partidasGanadasTriples).toBe(0);
      expect(s.partidasPerdidas).toBe(1);
    }
  });

  it("Victoria triple (perdedor en 0): 3 puntos y partidasGanadasTriples+1", async () => {
    const [p0, p1, p2] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarMarcador(partida.id, { equipo1Puntos: 29, equipo2Puntos: 0 });
    await cargarResultadoDeMano({ partidaId: partida.id, solicitanteId: p0, deltaEquipo1: 1, deltaEquipo2: 0 });

    const porId = await estadisticasPorParticipante();

    for (const ganadorId of [p0, p1, p2]) {
      const s = porId.get(ganadorId)!;
      expect(s.puntos).toBe(3);
      expect(s.partidasGanadas).toBe(1);
      expect(s.partidasGanadasDobles).toBe(0);
      expect(s.partidasGanadasTriples).toBe(1);
    }
  });

  it("Victoria doble (perdedor en 1-15): 2 puntos y partidasGanadasDobles+1", async () => {
    const [p0, p1, p2] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarMarcador(partida.id, { equipo1Puntos: 29, equipo2Puntos: 10 });
    await cargarResultadoDeMano({ partidaId: partida.id, solicitanteId: p0, deltaEquipo1: 1, deltaEquipo2: 0 });

    const porId = await estadisticasPorParticipante();

    for (const ganadorId of [p0, p1, p2]) {
      const s = porId.get(ganadorId)!;
      expect(s.puntos).toBe(2);
      expect(s.partidasGanadas).toBe(1);
      expect(s.partidasGanadasDobles).toBe(1);
      expect(s.partidasGanadasTriples).toBe(0);
    }
  });

  it("Victoria simple (perdedor en 16-29): 1 punto, sin dobles ni triples", async () => {
    const [p0, p1, p2] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarMarcador(partida.id, { equipo1Puntos: 29, equipo2Puntos: 20 });
    await cargarResultadoDeMano({ partidaId: partida.id, solicitanteId: p0, deltaEquipo1: 1, deltaEquipo2: 0 });

    const porId = await estadisticasPorParticipante();

    for (const ganadorId of [p0, p1, p2]) {
      const s = porId.get(ganadorId)!;
      expect(s.puntos).toBe(1);
      expect(s.partidasGanadas).toBe(1);
      expect(s.partidasGanadasDobles).toBe(0);
      expect(s.partidasGanadasTriples).toBe(0);
    }
  });

  // El perdedor también puede sumar puntos en esta misma Mano (Envido a un
  // Equipo, Truco al otro) — el Nivel de Victoria tiene que usar su
  // puntaje DESPUÉS de aplicar ese delta, no el de antes de la transacción
  // (ver comentario en cargarResultadoDeMano). Equipo 2 (perdedor) entra
  // en 15 y sale en 17 con este delta: un port que lea el valor de antes
  // (15, "doble") en vez del de después (17, "simple") falla acá.
  it("el Nivel de Victoria del perdedor usa su puntaje después del delta de esta misma Mano", async () => {
    const [p0, p1, p2] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarMarcador(partida.id, { equipo1Puntos: 15, equipo2Puntos: 29 });

    await cargarResultadoDeMano({
      partidaId: partida.id,
      solicitanteId: p0,
      deltaEquipo1: 2,
      deltaEquipo2: 1,
    });

    const porId = await estadisticasPorParticipante();
    for (const ganadorId of [participanteIds[3], participanteIds[4], participanteIds[5]]) {
      const s = porId.get(ganadorId)!;
      expect(s.partidasGanadasDobles).toBe(0);
      expect(s.partidasGanadas).toBe(1);
    }
    // Sanity: p0/p1/p2 (Equipo 1) son quienes perdieron acá.
    expect(porId.get(p0)!.partidasPerdidas).toBe(1);
    expect(porId.get(p1)!.partidasPerdidas).toBe(1);
    expect(porId.get(p2)!.partidasPerdidas).toBe(1);
  });

  it("si Equipo 1 ya llega a 30, el delta de Equipo 2 en el mismo flush no se aplica", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarMarcador(partida.id, { equipo1Puntos: 29, equipo2Puntos: 10 });

    const actualizada = await cargarResultadoDeMano({
      partidaId: partida.id,
      solicitanteId: p0,
      deltaEquipo1: 1,
      deltaEquipo2: 5,
    });

    expect(actualizada.equipoGanador).toBe(1);
    expect(actualizada.equipo1Puntos).toBe(30);
    expect(actualizada.equipo2Puntos).toBe(10);
  });

  describe("Bloque (Ronda/Pica-pica)", () => {
    // La Mano que se está cargando ya se jugó (ver CONTEXT.md/Mano, ADR
    // 0005) — lo que predice calcularBloqueSiguiente acá es el tipo de la
    // Mano *siguiente*, así que usa el puntaje ya incluyendo esta Mano
    // (3-2 antes, +3 para Equipo 2, 3-5 después: recién ahí cruza el
    // umbral de inicio, 5), sin ninguna ventana de tiempo de por medio.
    it("siempre recalcula el Bloque con el puntaje de después de esta Mano", async () => {
      const [p0] = participanteIds;
      const partida = await crearPartidaDePrueba();
      // Umbral de inicio por default del Grupo: 5 (ver schema/CONTEXT.md).
      await sembrarMarcador(partida.id, { equipo1Puntos: 3, equipo2Puntos: 2 });

      const actualizada = await cargarResultadoDeMano({
        partidaId: partida.id,
        solicitanteId: p0,
        deltaEquipo1: 0,
        deltaEquipo2: 3,
      });

      expect(actualizada.equipo2Puntos).toBe(5);
      expect(actualizada.tipoDeBloqueActual).toBe("pica_pica");
      expect(actualizada.manosJugadasEnBloqueActual).toBe(0);
    });

    // Ticket #22: una Partida de un Grupo con umbrales propios tiene que
    // alternar según esos valores, no según el default 5/20 — Grupo
    // separado del que arma el beforeEach de este archivo, con su propia
    // limpieza acá (el afterEach de arriba solo borra el Grupo default).
    it("usa los umbrales propios del Grupo, no el default 5/20", async () => {
      const [p0, p1, p2, p3, p4, p5] = participanteIds;
      const db = getDb();
      const grupoCustom = await crearGrupo({
        nombre: "Grupo con umbrales propios",
        adminParticipanteId: p0,
        umbralInicioPicaPica: 2,
        umbralFinPicaPica: 4,
      });

      try {
        await db.insert(gruposParticipantesTable).values(
          [p1, p2, p3, p4, p5].map((participanteId) => ({ grupoId: grupoCustom.id, participanteId })),
        );
        const partida = await crearPartida({
          grupoId: grupoCustom.id,
          anotadorParticipanteId: p0,
          equipo1: [p0, p1, p2],
          equipo2: [p3, p4, p5],
          picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
        });

        // Con el umbral default (5) esto seguiría en Ronda — con el umbral
        // propio de este Grupo (2) ya tiene que cruzar a Pica-pica.
        const actualizada = await cargarResultadoDeMano({
          partidaId: partida.id,
          solicitanteId: p0,
          deltaEquipo1: 2,
          deltaEquipo2: 0,
        });

        expect(actualizada.tipoDeBloqueActual).toBe("pica_pica");
      } finally {
        await db.delete(partidasTable).where(eq(partidasTable.grupoId, grupoCustom.id));
        await db.delete(gruposParticipantesTable).where(eq(gruposParticipantesTable.grupoId, grupoCustom.id));
        await db.delete(gruposTable).where(eq(gruposTable.id, grupoCustom.id));
      }
    });

    it("avanza manosJugadasEnBloqueActual a mitad de un Pica-pica sin reevaluar la Fase", async () => {
      const [p0] = participanteIds;
      const partida = await crearPartidaDePrueba();
      await sembrarMarcador(partida.id, {
        equipo1Puntos: 6,
        equipo2Puntos: 3,
        tipoDeBloqueActual: "pica_pica",
        manosJugadasEnBloqueActual: 1,
      });

      const actualizada = await cargarResultadoDeMano({
        partidaId: partida.id,
        solicitanteId: p0,
        deltaEquipo1: 0,
        deltaEquipo2: 1,
      });

      expect(actualizada.tipoDeBloqueActual).toBe("pica_pica");
      expect(actualizada.manosJugadasEnBloqueActual).toBe(2);
    });

    it("sigue escribiendo ultimoPuntoAnotadoEn (informativo, ya no decide nada)", async () => {
      const [p0] = participanteIds;
      const partida = await crearPartidaDePrueba();

      const actualizada = await cargarResultadoDeMano({
        partidaId: partida.id,
        solicitanteId: p0,
        deltaEquipo1: 1,
        deltaEquipo2: 0,
      });

      expect(actualizada.ultimoPuntoAnotadoEn).toBeTruthy();
    });
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
    });
    await cancelarPartida({ partidaId: partida.id, solicitanteId: p0 });

    const nueva = await crearPartida({
      grupoId,
      anotadorParticipanteId: p0,
      equipo1: [p0, p1, p2],
      equipo2: [p3, p4, p5],
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
    });
    await cargarResultadoDeMano({ partidaId: partida.id, solicitanteId: p0, deltaEquipo1: 1, deltaEquipo2: 0 });
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
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
      picaPicaParejas: parejasPorPosicion([p0, p1, p2], [p3, p4, p5]),
    });
    await cancelarPartida({ partidaId: partida.id, solicitanteId: p0 });

    await expect(
      cancelarPartida({ partidaId: partida.id, solicitanteId: p0 }),
    ).rejects.toThrow("La Partida no está en curso");
  });
});

describe("corregirBloqueManualmente", () => {
  it("corrige a Pica-pica y reinicia manosJugadasEnBloqueActual a 0", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();

    const actualizada = await corregirBloqueManualmente({
      partidaId: partida.id,
      solicitanteId: p0,
      tipo: "pica_pica",
    });

    expect(actualizada.tipoDeBloqueActual).toBe("pica_pica");
    expect(actualizada.manosJugadasEnBloqueActual).toBe(0);
  });

  it("corrige a Ronda y reinicia manosJugadasEnBloqueActual a 0", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarMarcador(partida.id, { tipoDeBloqueActual: "pica_pica", manosJugadasEnBloqueActual: 2 });

    const actualizada = await corregirBloqueManualmente({
      partidaId: partida.id,
      solicitanteId: p0,
      tipo: "ronda",
    });

    expect(actualizada.tipoDeBloqueActual).toBe("ronda");
    expect(actualizada.manosJugadasEnBloqueActual).toBe(0);
  });

  it("rechaza si quien corrige no es el Anotador de la Partida", async () => {
    const [p0, p1] = participanteIds;
    const partida = await crearPartidaDePrueba();

    await expect(
      corregirBloqueManualmente({ partidaId: partida.id, solicitanteId: p1, tipo: "pica_pica" }),
    ).rejects.toThrow("Solo el Anotador de la Partida puede corregir el Bloque");
  });

  it("rechaza si la Partida no está en_curso", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await cancelarPartida({ partidaId: partida.id, solicitanteId: p0 });

    await expect(
      corregirBloqueManualmente({ partidaId: partida.id, solicitanteId: p0, tipo: "pica_pica" }),
    ).rejects.toThrow("La Partida no está en curso");
  });

  it("después de corregir a Pica-pica, las siguientes 3 Manos completan ese Bloque antes de reevaluar la Fase", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await corregirBloqueManualmente({ partidaId: partida.id, solicitanteId: p0, tipo: "pica_pica" });

    const mano1 = await cargarResultadoDeMano({
      partidaId: partida.id,
      solicitanteId: p0,
      deltaEquipo1: 1,
      deltaEquipo2: 0,
    });
    expect(mano1.tipoDeBloqueActual).toBe("pica_pica");
    expect(mano1.manosJugadasEnBloqueActual).toBe(1);

    const mano2 = await cargarResultadoDeMano({
      partidaId: partida.id,
      solicitanteId: p0,
      deltaEquipo1: 1,
      deltaEquipo2: 0,
    });
    expect(mano2.tipoDeBloqueActual).toBe("pica_pica");
    expect(mano2.manosJugadasEnBloqueActual).toBe(2);

    // La 3ra Mano completa el Bloque y ya reevalúa la Fase en esta misma
    // carga (ver ADR sobre calcularBloqueSiguiente) — el puntaje (3-0)
    // sigue por debajo del umbral de inicio (5), así que vuelve a Ronda,
    // igual que un Bloque de Pica-pica detectado automáticamente.
    const mano3 = await cargarResultadoDeMano({
      partidaId: partida.id,
      solicitanteId: p0,
      deltaEquipo1: 1,
      deltaEquipo2: 0,
    });
    expect(mano3.tipoDeBloqueActual).toBe("ronda");
    expect(mano3.manosJugadasEnBloqueActual).toBe(0);
  });

  it("después de corregir a Ronda, la Mano siguiente ya dispara una nueva evaluación de Fase con normalidad", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();
    await sembrarMarcador(partida.id, {
      equipo1Puntos: 4,
      tipoDeBloqueActual: "pica_pica",
      manosJugadasEnBloqueActual: 1,
    });
    await corregirBloqueManualmente({ partidaId: partida.id, solicitanteId: p0, tipo: "ronda" });

    // Umbral de inicio por default del Grupo: 5. El puntaje antes de esta
    // Mano es 4-0; con este delta pasa a 5-0 y cruza el umbral — sin
    // ningún caso especial para la corrección manual, es el mismo cálculo
    // de siempre (tipoActual: "ronda" siempre reevalúa de inmediato).
    const actualizada = await cargarResultadoDeMano({
      partidaId: partida.id,
      solicitanteId: p0,
      deltaEquipo1: 1,
      deltaEquipo2: 0,
    });

    expect(actualizada.tipoDeBloqueActual).toBe("pica_pica");
    expect(actualizada.manosJugadasEnBloqueActual).toBe(0);
  });
});

// Ticket #23: a diferencia de los umbrales de Pica-pica, la ventana de
// inactividad no vive copiada en la Partida — así que una Partida ya
// en_curso no la tiene "congelada" al momento de crearse, lee siempre la
// del Grupo. Ver el comentario de actualizarVentanaInactividad en
// domain/grupos.ts para la salvedad de una pestaña ya abierta (ADR 0005):
// eso es un límite del cliente, no del dominio, y no es lo que este test
// cubre.
describe("ventana de inactividad (ticket #23)", () => {
  it("una Partida en_curso lee el valor nuevo apenas el admin lo actualiza, sin quedar congelada", async () => {
    const [p0] = participanteIds;
    const partida = await crearPartidaDePrueba();

    await actualizarVentanaInactividad({
      grupoId,
      solicitanteId: p0,
      ventanaInactividadSegundos: 45,
    });

    const grupoActualizado = await obtenerGrupoPorId(partida.grupoId);
    expect(grupoActualizado?.ventanaInactividadSegundos).toBe(45);
  });
});
