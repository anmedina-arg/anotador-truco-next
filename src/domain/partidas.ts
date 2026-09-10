import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import type { ParticipanteBasico } from "./participantes";
import {
  usersTable,
  gruposParticipantesTable,
  partidasTable,
  partidasParticipantesTable,
} from "../db/schema";

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
