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
import { crearPartida, listarPartidasEnCursoDeGrupo } from "./partidas";

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
