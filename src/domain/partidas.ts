import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import type { ParticipanteBasico } from "./participantes";
import { nivelDeVictoria, calcularEstadisticasRanking } from "./grupos";
import {
  usersTable,
  gruposParticipantesTable,
  partidasTable,
  partidasParticipantesTable,
} from "../db/schema";

const PUNTOS_PARA_GANAR = 30;

// El Anotador es quien creó la Partida (ver CONTEXT.md) — un solo lugar
// para esta comparación, usado tanto para autorizar (anotarPunto,
// cancelarPartida) como para decidir qué mostrar en la UI (acceso al
// tanteador en vivo).
export function esAnotadorDePartida(
  partida: { anotadorParticipanteId: string },
  participanteId: string,
): boolean {
  return partida.anotadorParticipanteId === participanteId;
}

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

// Guarda compartida por crearRevancha y crearSiguienteEquipo: ambas parten
// de una Partida finalizada, pedida por quien fue su Anotador. Un solo lugar
// para estas 3 validaciones evita que una de las dos quede desactualizada si
// esta regla cambia.
async function obtenerPartidaFinalizadaDelAnotador(
  partidaId: string,
  solicitanteId: string,
  mensajes: { noFinalizada: string; noAnotador: string },
) {
  const partida = await obtenerPartidaConEquipos(partidaId);
  if (!partida) {
    throw new Error("La Partida no existe");
  }
  if (partida.estado !== "finalizada") {
    throw new Error(mensajes.noFinalizada);
  }
  if (!esAnotadorDePartida(partida, solicitanteId)) {
    throw new Error(mensajes.noAnotador);
  }
  return partida;
}

// Repite la última Partida con un tap (ticket #12): mismos 6 Participantes,
// misma división de Equipos y mismo Anotador que la Partida finalizada de
// referencia, arrancando 0-0. Sin validaciones propias más allá de leer la
// Partida original — delega en crearPartida para no duplicar sus reglas
// (3+3, sin repetidos, exclusividad).
export async function crearRevancha(input: { partidaId: string; solicitanteId: string }) {
  const partida = await obtenerPartidaFinalizadaDelAnotador(input.partidaId, input.solicitanteId, {
    noFinalizada: "Solo se puede pedir Revancha de una Partida finalizada",
    noAnotador: "Solo el Anotador de la Partida puede pedir Revancha",
  });

  return crearPartida({
    grupoId: partida.grupoId,
    anotadorParticipanteId: partida.anotadorParticipanteId,
    equipo1: partida.equipo1.map((p) => p.participanteId),
    equipo2: partida.equipo2.map((p) => p.participanteId),
  });
}

// El Equipo ganador sigue, se elige un desafiante nuevo (ticket #13): mismo
// Equipo ganador de la Partida finalizada de referencia, Equipo desafiante
// con los Participantes indicados. Si quien pide esto (el Anotador
// anterior) quedó en el Equipo ganador, sigue de Anotador; si quedó en el
// que se reemplaza, hace falta indicar un nuevoAnotadorParticipanteId de
// entre los 6 finales — la única excepción a "el Anotador se asigna
// automáticamente a quien crea la Partida, sin transferencia" (ver
// CONTEXT.md/issue #1), acotada a este flujo. Delega en crearPartida para
// las reglas de siempre (3+3, sin repetidos, exclusividad).
export async function crearSiguienteEquipo(input: {
  partidaId: string;
  solicitanteId: string;
  equipoDesafiante: string[];
  nuevoAnotadorParticipanteId?: string;
}) {
  const partida = await obtenerPartidaFinalizadaDelAnotador(input.partidaId, input.solicitanteId, {
    noFinalizada: "Solo se puede armar el Siguiente equipo desde una Partida finalizada",
    noAnotador: "Solo el Anotador de la Partida puede armar el Siguiente equipo",
  });
  if (partida.equipoGanador !== 1 && partida.equipoGanador !== 2) {
    throw new Error("La Partida finalizada no tiene un Equipo ganador registrado");
  }

  const equipoGanador = partida.equipoGanador === 1 ? partida.equipo1 : partida.equipo2;
  const equipoGanadorIds = equipoGanador.map((p) => p.participanteId);

  let anotadorParticipanteId: string;
  if (equipoGanadorIds.includes(input.solicitanteId)) {
    anotadorParticipanteId = input.solicitanteId;
  } else {
    if (!input.nuevoAnotadorParticipanteId) {
      throw new Error("Elegí quién anota la Partida nueva");
    }
    const participantesFinales = [...equipoGanadorIds, ...input.equipoDesafiante];
    if (!participantesFinales.includes(input.nuevoAnotadorParticipanteId)) {
      throw new Error("El nuevo Anotador tiene que ser uno de los 6 Participantes de la Partida nueva");
    }
    anotadorParticipanteId = input.nuevoAnotadorParticipanteId;
  }

  return crearPartida({
    grupoId: partida.grupoId,
    anotadorParticipanteId,
    equipo1: equipoGanadorIds,
    equipo2: input.equipoDesafiante,
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
// El Nivel de Victoria (simple/doble/triple, ver CONTEXT.md) del cierre
// sale del puntaje final del Equipo perdedor — ticket #16.
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
    if (!esAnotadorDePartida(partida, input.solicitanteId)) {
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

    // Nivel de Victoria (ver CONTEXT.md) según el puntaje final del Equipo
    // perdedor, que no cambia en este cierre (solo se tocó la columna del
    // Equipo ganador arriba). El peso en puntos de una sola Victoria de este
    // nivel sale de calcularEstadisticasRanking (ticket #15) pidiéndole el
    // resultado de "1 Partida jugada y ganada, con este nivel" — así no se
    // duplica la fórmula acá.
    const puntajeDelPerdedor = input.equipo === 1 ? partida.equipo2Puntos : partida.equipo1Puntos;
    const nivel = nivelDeVictoria(puntajeDelPerdedor);
    const { puntos: puntosPorEstaVictoria } = calcularEstadisticasRanking({
      partidasJugadas: 1,
      partidasGanadas: 1,
      partidasGanadasDobles: nivel === "doble" ? 1 : 0,
      partidasGanadasTriples: nivel === "triple" ? 1 : 0,
    });

    // Ganadores y perdedores son conjuntos disjuntos (particionados del mismo
    // `jugadores`) — no hay fila que ambos updates puedan pisarse, así que
    // corren en paralelo, igual que crearPartida hace con su propio trabajo
    // independiente dentro de la transacción.
    await Promise.all([
      ganadores.length > 0
        ? tx
            .update(gruposParticipantesTable)
            .set({
              puntos: sql`${gruposParticipantesTable.puntos} + ${puntosPorEstaVictoria}`,
              partidasJugadas: sql`${gruposParticipantesTable.partidasJugadas} + 1`,
              partidasGanadas: sql`${gruposParticipantesTable.partidasGanadas} + 1`,
              ...(nivel === "doble" && {
                partidasGanadasDobles: sql`${gruposParticipantesTable.partidasGanadasDobles} + 1`,
              }),
              ...(nivel === "triple" && {
                partidasGanadasTriples: sql`${gruposParticipantesTable.partidasGanadasTriples} + 1`,
              }),
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
    if (!esAnotadorDePartida(partida, input.solicitanteId)) {
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
