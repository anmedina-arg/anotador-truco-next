import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import type { ParticipanteBasico } from "./participantes";
import {
  usersTable,
  gruposParticipantesTable,
  partidasTable,
  partidasParticipantesTable,
} from "../db/schema";

const PUNTOS_PARA_GANAR = 30;

export async function crearPartida(input: {
  grupoId: string;
  anotadorParticipanteId: string;
  equipo1: string[];
  equipo2: string[];
}) {
  if (input.equipo1.length !== 3 || input.equipo2.length !== 3) {
    throw new Error("Cada Equipo necesita exactamente 3 Participantes");
  }

  if (new Set(input.equipo1).size !== 3 || new Set(input.equipo2).size !== 3) {
    throw new Error("Un Participante no puede estar repetido en el mismo Equipo");
  }

  const participantes = [...input.equipo1, ...input.equipo2];
  if (new Set(participantes).size !== 6) {
    throw new Error("Un Participante no puede estar en los dos Equipos");
  }

  if (!participantes.includes(input.anotadorParticipanteId)) {
    throw new Error("El Anotador tiene que ser uno de los 6 Participantes de la Partida");
  }

  const db = getDb();

  return db.transaction(async (tx) => {
    // Orden fijo (sorted) para tomar los advisory locks: evita que dos
    // Partidas creándose en simultáneo con Participantes en común se
    // deadlockeen esperándose una a la otra en orden distinto.
    const idsOrdenados = [...participantes].sort();

    const [miembros] = await Promise.all([
      tx
        .select({ participanteId: gruposParticipantesTable.participanteId })
        .from(gruposParticipantesTable)
        .where(
          and(
            eq(gruposParticipantesTable.grupoId, input.grupoId),
            inArray(gruposParticipantesTable.participanteId, participantes),
          ),
        ),
      // Advisory lock transaccional por Participante: el chequeo de "ya está
      // jugando otra Partida" de abajo es un SELECT sin constraint de base
      // que lo respalde (a diferencia del email o el código de invitación),
      // así que dos creaciones simultáneas con gente en común se serializan
      // acá — la segunda espera a que la primera termine su transacción
      // antes de correr su propio chequeo.
      (async () => {
        for (const id of idsOrdenados) {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`);
        }
      })(),
    ]);

    if (miembros.length !== 6) {
      throw new Error("Los 6 Participantes tienen que ser miembros del Grupo");
    }

    const enOtraPartida = await tx
      .select({ participanteId: partidasParticipantesTable.participanteId })
      .from(partidasParticipantesTable)
      .innerJoin(partidasTable, eq(partidasTable.id, partidasParticipantesTable.partidaId))
      .where(
        and(
          eq(partidasTable.estado, "en_curso"),
          inArray(partidasParticipantesTable.participanteId, participantes),
        ),
      );
    if (enOtraPartida.length > 0) {
      throw new Error("Alguno de los Participantes elegidos ya está jugando otra Partida");
    }

    const [partida] = await tx
      .insert(partidasTable)
      .values({ grupoId: input.grupoId, anotadorParticipanteId: input.anotadorParticipanteId })
      .returning();

    await tx.insert(partidasParticipantesTable).values([
      ...input.equipo1.map((participanteId) => ({
        partidaId: partida.id,
        participanteId,
        equipoNumero: 1,
      })),
      ...input.equipo2.map((participanteId) => ({
        partidaId: partida.id,
        participanteId,
        equipoNumero: 2,
      })),
    ]);

    return partida;
  });
}

export async function listarPartidasEnCursoDeGrupo(grupoId: string) {
  const db = getDb();

  const filas = await db
    .select({
      partidaId: partidasTable.id,
      anotadorParticipanteId: partidasTable.anotadorParticipanteId,
      fechaInicio: partidasTable.fechaInicio,
      participanteId: usersTable.id,
      nombre: usersTable.name,
      email: usersTable.email,
      equipoNumero: partidasParticipantesTable.equipoNumero,
    })
    .from(partidasTable)
    .innerJoin(
      partidasParticipantesTable,
      eq(partidasParticipantesTable.partidaId, partidasTable.id),
    )
    .innerJoin(usersTable, eq(usersTable.id, partidasParticipantesTable.participanteId))
    .where(and(eq(partidasTable.grupoId, grupoId), eq(partidasTable.estado, "en_curso")));

  const porPartida = new Map<
    string,
    {
      id: string;
      anotadorParticipanteId: string;
      fechaInicio: Date;
      equipo1: ParticipanteBasico[];
      equipo2: ParticipanteBasico[];
    }
  >();

  for (const fila of filas) {
    let partida = porPartida.get(fila.partidaId);
    if (!partida) {
      partida = {
        id: fila.partidaId,
        anotadorParticipanteId: fila.anotadorParticipanteId,
        fechaInicio: fila.fechaInicio,
        equipo1: [],
        equipo2: [],
      };
      porPartida.set(fila.partidaId, partida);
    }

    const miembro = { participanteId: fila.participanteId, nombre: fila.nombre, email: fila.email };
    (fila.equipoNumero === 1 ? partida.equipo1 : partida.equipo2).push(miembro);
  }

  return Array.from(porPartida.values());
}

export async function obtenerPartidaConEquipos(partidaId: string) {
  const db = getDb();

  const [partida] = await db.select().from(partidasTable).where(eq(partidasTable.id, partidaId));
  if (!partida) {
    return null;
  }

  const filas = await db
    .select({
      participanteId: usersTable.id,
      nombre: usersTable.name,
      email: usersTable.email,
      equipoNumero: partidasParticipantesTable.equipoNumero,
    })
    .from(partidasParticipantesTable)
    .innerJoin(usersTable, eq(usersTable.id, partidasParticipantesTable.participanteId))
    .where(eq(partidasParticipantesTable.partidaId, partidaId));

  const equipo1: ParticipanteBasico[] = [];
  const equipo2: ParticipanteBasico[] = [];
  for (const fila of filas) {
    const miembro = { participanteId: fila.participanteId, nombre: fila.nombre, email: fila.email };
    (fila.equipoNumero === 1 ? equipo1 : equipo2).push(miembro);
  }

  return { ...partida, equipo1, equipo2 };
}

// Anota (o resta) un punto en vivo al Equipo indicado. Solo el Anotador de
// la Partida puede hacerlo, y solo mientras está en_curso. El contador nunca
// sale de [0, 30] — restar en 0 es un no-op, y llegar a 30 cierra sola la
// Partida (estado, Equipo ganador y estadísticas de los 6 Participantes se
// actualizan en la misma transacción, según lo decidido en el ticket #1).
export async function anotarPunto(input: {
  partidaId: string;
  solicitanteId: string;
  equipo: 1 | 2;
  delta: 1 | -1;
}) {
  const db = getDb();

  return db.transaction(async (tx) => {
    // FOR UPDATE: dos toques de "+" casi simultáneos del mismo Anotador (o un
    // doble submit) tienen que serializarse acá, no pisarse los cambios.
    const [partida] = await tx
      .select()
      .from(partidasTable)
      .where(eq(partidasTable.id, input.partidaId))
      .for("update");

    if (!partida) {
      throw new Error("La Partida no existe");
    }
    if (partida.estado !== "en_curso") {
      throw new Error("La Partida no está en curso");
    }
    if (partida.anotadorParticipanteId !== input.solicitanteId) {
      throw new Error("Solo el Anotador de la Partida puede cargar puntos");
    }

    const actual = input.equipo === 1 ? partida.equipo1Puntos : partida.equipo2Puntos;
    const nuevoValor = Math.min(PUNTOS_PARA_GANAR, Math.max(0, actual + input.delta));

    if (nuevoValor === actual) {
      return partida;
    }

    const columnaPuntos =
      input.equipo === 1 ? { equipo1Puntos: nuevoValor } : { equipo2Puntos: nuevoValor };

    if (nuevoValor < PUNTOS_PARA_GANAR) {
      const [actualizada] = await tx
        .update(partidasTable)
        .set(columnaPuntos)
        .where(eq(partidasTable.id, input.partidaId))
        .returning();
      return actualizada;
    }

    const [finalizada] = await tx
      .update(partidasTable)
      .set({
        ...columnaPuntos,
        estado: "finalizada",
        equipoGanador: input.equipo,
        fechaFin: new Date(),
      })
      .where(eq(partidasTable.id, input.partidaId))
      .returning();

    const jugadores = await tx
      .select({
        participanteId: partidasParticipantesTable.participanteId,
        equipoNumero: partidasParticipantesTable.equipoNumero,
      })
      .from(partidasParticipantesTable)
      .where(eq(partidasParticipantesTable.partidaId, input.partidaId));

    const ganadores = jugadores
      .filter((j) => j.equipoNumero === input.equipo)
      .map((j) => j.participanteId);
    const perdedores = jugadores
      .filter((j) => j.equipoNumero !== input.equipo)
      .map((j) => j.participanteId);

    // Ganadores y perdedores son conjuntos disjuntos (particionados del mismo
    // `jugadores`) — no hay fila que ambos updates puedan pisarse, así que
    // corren en paralelo, igual que crearPartida hace con su propio trabajo
    // independiente dentro de la transacción.
    await Promise.all([
      ganadores.length > 0
        ? tx
            .update(gruposParticipantesTable)
            .set({
              puntos: sql`${gruposParticipantesTable.puntos} + 1`,
              partidasJugadas: sql`${gruposParticipantesTable.partidasJugadas} + 1`,
              partidasGanadas: sql`${gruposParticipantesTable.partidasGanadas} + 1`,
            })
            .where(
              and(
                eq(gruposParticipantesTable.grupoId, partida.grupoId),
                inArray(gruposParticipantesTable.participanteId, ganadores),
              ),
            )
        : Promise.resolve(),
      perdedores.length > 0
        ? tx
            .update(gruposParticipantesTable)
            .set({
              partidasJugadas: sql`${gruposParticipantesTable.partidasJugadas} + 1`,
              partidasPerdidas: sql`${gruposParticipantesTable.partidasPerdidas} + 1`,
            })
            .where(
              and(
                eq(gruposParticipantesTable.grupoId, partida.grupoId),
                inArray(gruposParticipantesTable.participanteId, perdedores),
              ),
            )
        : Promise.resolve(),
    ]);

    return finalizada;
  });
}

// El Anotador corta la Partida antes de tiempo: libera a sus 6 Participantes
// (quedan con estado distinto de en_curso, así que una Partida nueva los
// puede volver a elegir) sin que cuente como jugada para nadie.
export async function cancelarPartida(input: { partidaId: string; solicitanteId: string }) {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [partida] = await tx
      .select()
      .from(partidasTable)
      .where(eq(partidasTable.id, input.partidaId))
      .for("update");

    if (!partida) {
      throw new Error("La Partida no existe");
    }
    if (partida.estado !== "en_curso") {
      throw new Error("La Partida no está en curso");
    }
    if (partida.anotadorParticipanteId !== input.solicitanteId) {
      throw new Error("Solo el Anotador de la Partida puede cancelarla");
    }

    const [cancelada] = await tx
      .update(partidasTable)
      .set({ estado: "cancelada", fechaFin: new Date() })
      .where(eq(partidasTable.id, input.partidaId))
      .returning();

    return cancelada;
  });
}
