import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import type { ParticipanteBasico } from "./participantes";
import { nivelDeVictoria, calcularEstadisticasRanking } from "./grupos";
import {
  usersTable,
  gruposTable,
  gruposParticipantesTable,
  partidasTable,
  partidasParticipantesTable,
  picaPicaParejaTable,
  picaPicaManoTable,
} from "../db/schema";

const PUNTOS_PARA_GANAR = 30;

export type TipoDeBloque = "ronda" | "pica_pica";

// Pareja fija de Pica-pica (ver CONTEXT.md/Pica-pica, ADR 0006): quién de
// Equipo 1 enfrenta a quién de Equipo 2 en los Bloques de Pica-pica de una
// Partida. Se decide al crear la Partida (crearPartida) y no se puede
// derivar del orden de los arrays de equipo1/equipo2 — se guarda explícita.
export type ParejaPicaPica = { jugadorEquipo1Id: string; jugadorEquipo2Id: string };

const MANOS_POR_BLOQUE_PICA_PICA = 3;

// Máquina de estados del Bloque (ver CONTEXT.md: Bloque, Ronda, Pica-pica,
// Fase; ADR 0003). Pura, sin acceso a base ni a reloj: dado el Bloque
// vigente, los umbrales del Grupo y el puntaje de ambos Equipos *antes* de
// la Mano que se está por jugar, devuelve el Bloque que le corresponde.
// Única fuente de verdad de esta lógica — tanto anotarPunto como la
// corrección manual del Bloque (ticket #21) la usan, para no duplicar las
// reglas de Fase en dos lugares.
export function calcularBloqueSiguiente(input: {
  tipoActual: TipoDeBloque;
  manosJugadas: number;
  umbralInicio: number;
  umbralFin: number;
  equipo1Puntos: number;
  equipo2Puntos: number;
}): { tipo: TipoDeBloque; manosJugadas: number } {
  // "manosJugadas" cuenta las Manos de Pica-pica ya jugadas *antes* de la
  // que se está cargando ahora — así que la Mano actual es la
  // manosJugadas+1-ésima del Bloque. El Bloque se completa CON esta Mano
  // (no en la llamada siguiente): comparar contra el valor ya incrementado
  // es lo que detecta la 3ra Mano en el momento en que se carga, no una
  // Mano más tarde.
  const bloqueEstaCompleto =
    input.tipoActual === "ronda" ||
    (input.tipoActual === "pica_pica" && input.manosJugadas + 1 >= MANOS_POR_BLOQUE_PICA_PICA);

  if (!bloqueEstaCompleto) {
    // Seguimos en el mismo Bloque de Pica-pica ya empezado — no se reevalúa
    // la Fase a mitad de camino (ver historia de usuario 8 del ticket #19).
    return { tipo: "pica_pica", manosJugadas: input.manosJugadas + 1 };
  }

  const max = Math.max(input.equipo1Puntos, input.equipo2Puntos);
  if (max < input.umbralInicio) return { tipo: "ronda", manosJugadas: 0 }; // Fase inicial
  if (max >= input.umbralFin) return { tipo: "ronda", manosJugadas: 0 }; // Fase final

  // Fase alternada: el Bloque nuevo es el tipo opuesto al que se acaba de
  // completar.
  return {
    tipo: input.tipoActual === "ronda" ? "pica_pica" : "ronda",
    manosJugadas: 0,
  };
}

// El Anotador es quien creó la Partida, si quedó jugando — si no, queda sin
// asignar hasta que alguno de los 6 lo reclama en vivo (ver ticket #32/#33,
// CONTEXT.md/Anotador). Un solo lugar para esta comparación, usado tanto
// para autorizar (anotarPunto, cancelarPartida) como para decidir qué
// mostrar en la UI (acceso al tanteador en vivo) — null nunca matchea, así
// que una Partida sin Anotador asignado bloquea esas acciones para
// cualquiera, sin ningún chequeo extra.
export function esAnotadorDePartida(
  partida: { anotadorParticipanteId: string | null },
  participanteId: string,
): boolean {
  return partida.anotadorParticipanteId === participanteId;
}

// Si un Participante dado es uno de los 6 que juegan una Partida (pertenece
// a alguno de los dos Equipos) — distinto de esAnotadorDePartida, que
// pregunta por el rol, no por participar. Lo usa el reclamo de Anotador en
// vivo (ticket #33) para saber a quién ofrecerle el rol.
export function esParticipanteDePartida(
  partida: { equipo1: { participanteId: string }[]; equipo2: { participanteId: string }[] },
  participanteId: string,
): boolean {
  return (
    partida.equipo1.some((p) => p.participanteId === participanteId) ||
    partida.equipo2.some((p) => p.participanteId === participanteId)
  );
}

export async function crearPartida(input: {
  grupoId: string;
  // Opcional (ticket #32): si quien crea la Partida no queda en ninguno de
  // los dos Equipos, se omite y la Partida queda sin Anotador asignado
  // hasta que alguno de los 6 lo reclama en vivo (ver ticket #33).
  // crearRevancha y crearSiguienteEquipo lo siguen mandando siempre — ya
  // resuelven ellos mismos quién queda de Anotador, sin cambios acá.
  anotadorParticipanteId?: string;
  equipo1: string[];
  equipo2: string[];
  picaPicaParejas: ParejaPicaPica[];
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

  if (input.anotadorParticipanteId !== undefined && !participantes.includes(input.anotadorParticipanteId)) {
    throw new Error("El Anotador tiene que ser uno de los 6 Participantes de la Partida");
  }

  // Las parejas de Pica-pica (ver ADR 0006) tienen que ser una asignación 1
  // a 1 completa entre los 3 de Equipo 1 y los 3 de Equipo 2 — comparar los
  // multiconjuntos ordenados alcanza para detectar cualquiera de los 3
  // errores posibles a la vez (menos/más de 3 parejas, un Participante
  // repetido entre parejas, o uno que no pertenece al Equipo que dice
  // representar), porque Equipo 1/Equipo 2 ya se validaron arriba como
  // conjuntos de 3 sin repetidos.
  if (input.picaPicaParejas.length !== 3) {
    throw new Error("Las parejas de Pica-pica tienen que ser exactamente 3");
  }
  const jugadoresEquipo1DeParejas = input.picaPicaParejas.map((p) => p.jugadorEquipo1Id).sort();
  const jugadoresEquipo2DeParejas = input.picaPicaParejas.map((p) => p.jugadorEquipo2Id).sort();
  if (
    jugadoresEquipo1DeParejas.join() !== [...input.equipo1].sort().join() ||
    jugadoresEquipo2DeParejas.join() !== [...input.equipo2].sort().join()
  ) {
    throw new Error(
      "Las parejas de Pica-pica tienen que emparejar 1 a 1 a los 3 Participantes de cada Equipo, sin repetidos",
    );
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
      .values({ grupoId: input.grupoId, anotadorParticipanteId: input.anotadorParticipanteId ?? null })
      .returning();

    await Promise.all([
      tx.insert(partidasParticipantesTable).values([
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
      ]),
      tx.insert(picaPicaParejaTable).values(
        input.picaPicaParejas.map((pareja, indice) => ({
          partidaId: partida.id,
          posicion: indice + 1,
          jugadorEquipo1Id: pareja.jugadorEquipo1Id,
          jugadorEquipo2Id: pareja.jugadorEquipo2Id,
        })),
      ),
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

// Parejas fijas de Pica-pica de una Partida (ver ADR 0006), en orden de
// posicion — la posicion ya no decide a qué pareja le toca cada Mano (ver
// corrección del ADR 0006, ticket #29: el orden entre Bloques de Pica-pica
// no es fijo), solo ordena cómo se muestran ("Pareja 1/2/3", ticket #26).
// crearRevancha usa esto para copiarlas tal cual a la Partida nueva sin
// tener que reconstruirlas; el marcador en vivo (ticket #30) la usa para
// saber qué avatares corresponden a qué pareja.
export async function obtenerParejasPicaPica(partidaId: string): Promise<ParejaPicaPica[]> {
  const db = getDb();

  const filas = await db
    .select({
      jugadorEquipo1Id: picaPicaParejaTable.jugadorEquipo1Id,
      jugadorEquipo2Id: picaPicaParejaTable.jugadorEquipo2Id,
    })
    .from(picaPicaParejaTable)
    .where(eq(picaPicaParejaTable.partidaId, partidaId))
    .orderBy(picaPicaParejaTable.posicion);

  return filas;
}

// Qué parejas ya jugaron su Mano dentro del Bloque de Pica-pica vigente
// (ver Marcador en vivo, ticket #30 — corrección de UI): cada pareja juega
// exactamente 1 de las 3 Manos de un Bloque (ver CONTEXT.md/Pica-pica), así
// que una vez confirmada su Mano no puede volver a elegirse hasta el
// próximo Bloque. Esto se llevaba solo en memoria del cliente hasta ahora
// (se perdía en un reload a mitad de Bloque) — se deriva acá de
// pica_pica_mano: como cada Mano de Pica-pica confirmada inserta una fila
// ahí en la misma transacción que actualiza manosJugadasEnBloqueActual (ver
// cargarResultadoDeMano), las últimas "manosJugadasEnBloqueActual" filas ya
// insertadas para esta Partida son exactamente las del Bloque todavía
// abierto — ni una corrección manual de Bloque (que resetea ese contador a
// 0 sin tocar el historial) ni Manos de un Bloque de Pica-pica anterior
// dentro de la misma Partida se cuelan. Devuelve los jugadorEquipo1Id de
// esas parejas (mismo identificador que ya usa el resto del código).
export async function obtenerParejasYaJugadasEnBloqueActual(partida: {
  id: string;
  manosJugadasEnBloqueActual: number;
}): Promise<string[]> {
  if (partida.manosJugadasEnBloqueActual === 0) {
    return [];
  }

  const db = getDb();
  const filas = await db
    .select({ jugadorAId: picaPicaManoTable.jugadorAId })
    .from(picaPicaManoTable)
    .where(eq(picaPicaManoTable.partidaId, partida.id))
    .orderBy(desc(picaPicaManoTable.creadaEn))
    .limit(partida.manosJugadasEnBloqueActual);

  return filas.map((f) => f.jugadorAId);
}

// Consulta liviana para el marcador de un espectador (ticket #34,
// CONTEXT.md/Anotador) — pensada para sondearse cada pocos segundos, así
// que trae solo lo que puede cambiar entre un tick y el siguiente
// (puntaje, estado, Bloque vigente, parejas de Pica-pica ya jugadas).
// Deja afuera todo lo que ya conoce el cliente desde el primer render
// server-side y nunca cambia durante la Partida (miembros de los Equipos,
// el emparejamiento fijo de Pica-pica, ver ADR 0006) — repetirlo en cada
// sondeo sería tráfico de más sin ningún beneficio. grupoId va en la
// respuesta para que quien llama pueda validar membresía del Grupo antes
// de confiar en el resto (ver obtenerEstadoDeMarcadorAction) sin tener que
// creerle un grupoId que mande el propio cliente.
export async function obtenerEstadoDeMarcador(partidaId: string) {
  const db = getDb();

  const [partida] = await db.select().from(partidasTable).where(eq(partidasTable.id, partidaId));
  if (!partida) {
    return null;
  }

  // Riesgo aceptado: estas dos consultas no comparten transacción/snapshot,
  // así que una Mano que se confirma justo entre una y la otra puede dejar
  // esta respuesta puntual con el puntaje de antes pero una pareja de
  // Pica-pica ya marcada como jugada (o viceversa) — se corrige solo en el
  // próximo tick del sondeo, unos segundos después. Ponerlas en una
  // transacción con REPEATABLE READ evitaría esto, pero es una vista de
  // solo lectura para espectadores, no la fuente de verdad del puntaje
  // (esa sigue siendo el Anotador, sin sondeo) — no vale la complejidad
  // extra para una inconsistencia visual de un instante.
  const parejasYaJugadas = await obtenerParejasYaJugadasEnBloqueActual(partida);

  return {
    grupoId: partida.grupoId,
    estado: partida.estado,
    equipo1Puntos: partida.equipo1Puntos,
    equipo2Puntos: partida.equipo2Puntos,
    tipoDeBloqueActual: partida.tipoDeBloqueActual,
    parejasYaJugadas,
  };
}

// Repite la última Partida con un tap (ticket #12): mismos 6 Participantes,
// misma división de Equipos, mismo Anotador y las mismas parejas de
// Pica-pica (ver ADR 0006) que la Partida finalizada de referencia,
// arrancando 0-0. Sin validaciones propias más allá de leer la Partida
// original — delega en crearPartida para no duplicar sus reglas (3+3, sin
// repetidos, exclusividad, parejas).
export async function crearRevancha(input: { partidaId: string; solicitanteId: string }) {
  const partida = await obtenerPartidaFinalizadaDelAnotador(input.partidaId, input.solicitanteId, {
    noFinalizada: "Solo se puede pedir Revancha de una Partida finalizada",
    noAnotador: "Solo el Anotador de la Partida puede pedir Revancha",
  });

  const picaPicaParejas = await obtenerParejasPicaPica(partida.id);

  return crearPartida({
    grupoId: partida.grupoId,
    // obtenerPartidaFinalizadaDelAnotador ya garantizó que solicitanteId es
    // el Anotador de la Partida original (nunca null en este punto).
    anotadorParticipanteId: input.solicitanteId,
    equipo1: partida.equipo1.map((p) => p.participanteId),
    equipo2: partida.equipo2.map((p) => p.participanteId),
    picaPicaParejas,
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
// las reglas de siempre (3+3, sin repetidos, exclusividad) — a diferencia de
// crearRevancha, acá las parejas de Pica-pica (ver ADR 0006) no se copian de
// ningún lado: el Equipo desafiante es gente nueva, así que quien llama
// tiene que mandarlas armadas de cero.
export async function crearSiguienteEquipo(input: {
  partidaId: string;
  solicitanteId: string;
  equipoDesafiante: string[];
  nuevoAnotadorParticipanteId?: string;
  picaPicaParejas: ParejaPicaPica[];
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
    picaPicaParejas: input.picaPicaParejas,
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
      anotadorParticipanteId: string | null;
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

// Reclamo en vivo del Anotador (ticket #33, CONTEXT.md/Anotador): cuando
// quien crea la Partida no queda jugando (ver ticket #32), la Partida
// arranca sin Anotador asignado, y cualquiera de los 6 Participantes que
// sí juegan puede ofrecerse. FOR UPDATE serializa dos reclamos casi
// simultáneos igual que ya hace anotarPunto: el primero en tomar el lock
// gana; el segundo, al verlo ya asignado, no aplica ningún cambio y
// devuelve { ok: false } — un resultado esperado ("gana el primero"), no
// una excepción, porque no fue un mal uso, solo llegó tarde.
export async function reclamarAnotador(input: {
  partidaId: string;
  participanteId: string;
}): Promise<{ ok: true } | { ok: false }> {
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

    const jugadores = await tx
      .select({ participanteId: partidasParticipantesTable.participanteId })
      .from(partidasParticipantesTable)
      .where(eq(partidasParticipantesTable.partidaId, input.partidaId));
    if (!jugadores.some((j) => j.participanteId === input.participanteId)) {
      throw new Error("Solo uno de los 6 Participantes de la Partida puede reclamar el Anotador");
    }

    if (partida.anotadorParticipanteId !== null) {
      return { ok: false };
    }

    await tx
      .update(partidasTable)
      .set({ anotadorParticipanteId: input.participanteId })
      .where(eq(partidasTable.id, input.partidaId));

    return { ok: true };
  });
}

// Corrige un punto ya confirmado de una Mano anterior (se cargó de más, o
// al Equipo equivocado). Solo el Anotador de la Partida, solo mientras
// está en_curso. El contador nunca baja de 0 — restar en 0 es un no-op.
// Nunca toca el Bloque ni ultimoPuntoAnotadoEn bajo ninguna circunstancia
// (ver CONTEXT.md/Mano, ADR 0005) — cargar el resultado de una Mano nueva
// es responsabilidad exclusiva de cargarResultadoDeMano, para que corregir
// un error de carga no genere un segundo error en el tipo de Bloque.
export async function anotarPunto(input: {
  partidaId: string;
  solicitanteId: string;
  equipo: 1 | 2;
  delta: -1;
}) {
  const db = getDb();

  return db.transaction(async (tx) => {
    // FOR UPDATE: dos correcciones casi simultáneas del mismo Anotador (o un
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
    const nuevoValor = Math.max(0, actual + input.delta);

    if (nuevoValor === actual) {
      return partida;
    }

    const columnaPuntos =
      input.equipo === 1 ? { equipo1Puntos: nuevoValor } : { equipo2Puntos: nuevoValor };

    const [actualizada] = await tx
      .update(partidasTable)
      .set(columnaPuntos)
      .where(eq(partidasTable.id, input.partidaId))
      .returning();
    return actualizada;
  });
}

// Carga el resultado de una Mano ya jugada y resuelta con las cartas (ver
// CONTEXT.md/Mano, ADR 0005): el cliente ya decidió, con su propio
// debounce, que la Mano terminó — acá no se compara ninguna ventana de
// tiempo, se confía en que este llamado ya representa una Mano cerrada y
// se recalcula el Bloque siempre. Recibe el puntaje neto que le
// corresponde a cada Equipo (puede ser 0 para uno de los dos — Envido a un
// Equipo, Truco al otro —, nunca los dos a la vez: no existe la Mano 0 a
// 0). Solo el Anotador de la Partida, solo mientras está en_curso.
export async function cargarResultadoDeMano(input: {
  partidaId: string;
  solicitanteId: string;
  deltaEquipo1: number;
  deltaEquipo2: number;
  // Pareja activa de Pica-pica (ver ADR 0006, ticket #29): un
  // participanteId alcanza, el otro integrante se resuelve contra las
  // parejas fijas de la Partida. Obligatorio solo cuando el Bloque vigente
  // es Pica-pica — se ignora si es Ronda.
  parejaActivaParticipanteId?: string;
}) {
  if (
    !Number.isInteger(input.deltaEquipo1) ||
    !Number.isInteger(input.deltaEquipo2) ||
    input.deltaEquipo1 < 0 ||
    input.deltaEquipo2 < 0
  ) {
    throw new Error("El resultado de una Mano tiene que ser un número entero, 0 o más, por Equipo");
  }
  if (input.deltaEquipo1 === 0 && input.deltaEquipo2 === 0) {
    throw new Error("Una Mano tiene que otorgar al menos 1 punto, a uno o a ambos Equipos");
  }

  const db = getDb();

  return db.transaction(async (tx) => {
    // FOR UPDATE: dos flushes casi simultáneos del mismo Anotador (doble
    // pestaña, reintento tras recuperar de sessionStorage) se serializan
    // acá, no se pisan los cambios.
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

    const [grupo] = await tx
      .select({
        umbralInicioPicaPica: gruposTable.umbralInicioPicaPica,
        umbralFinPicaPica: gruposTable.umbralFinPicaPica,
      })
      .from(gruposTable)
      .where(eq(gruposTable.id, partida.grupoId));

    // Pareja activa de Pica-pica (ver ADR 0006, ticket #29): el orden en
    // que las 3 parejas se turnan entre Bloques de Pica-pica no es fijo en
    // la mesa real, así que no hay ningún dato ya guardado del que se
    // pueda derivar sola — el Anotador la indica en cada Mano, y acá se
    // valida contra las parejas fijas de la Partida antes de persistir
    // nada. tipoDeBloqueActual acá es el tipo con el que se jugó ESTA Mano
    // (el valor persistido antes de esta llamada, igual criterio que ya
    // usa el cálculo de Bloque más abajo).
    let parejaActiva: { jugadorEquipo1Id: string; jugadorEquipo2Id: string } | null = null;
    if (partida.tipoDeBloqueActual === "pica_pica") {
      if (!input.parejaActivaParticipanteId) {
        throw new Error("Hay que indicar qué pareja de Pica-pica está jugando esta Mano");
      }
      const parejas = await tx
        .select({
          jugadorEquipo1Id: picaPicaParejaTable.jugadorEquipo1Id,
          jugadorEquipo2Id: picaPicaParejaTable.jugadorEquipo2Id,
        })
        .from(picaPicaParejaTable)
        .where(eq(picaPicaParejaTable.partidaId, input.partidaId));

      parejaActiva =
        parejas.find(
          (p) =>
            p.jugadorEquipo1Id === input.parejaActivaParticipanteId ||
            p.jugadorEquipo2Id === input.parejaActivaParticipanteId,
        ) ?? null;
      if (!parejaActiva) {
        throw new Error("La pareja activa indicada no es una de las parejas fijas de esta Partida");
      }
    }

    // Puntaje: se aplica en orden fijo, Equipo 1 primero — si ya alcanza
    // los 30, la Partida termina ahí mismo y el delta de Equipo 2 de esta
    // misma Mano no llega a aplicarse (en la mesa real, la Partida ya
    // había terminado antes de resolverse esa segunda parte de la Mano).
    // Así nunca se llega a un estado con los dos Equipos en 30.
    const nuevoEquipo1Puntos = Math.min(PUNTOS_PARA_GANAR, partida.equipo1Puntos + input.deltaEquipo1);
    let equipoGanador: 1 | 2 | null = null;
    let nuevoEquipo2Puntos = partida.equipo2Puntos;

    if (nuevoEquipo1Puntos >= PUNTOS_PARA_GANAR) {
      equipoGanador = 1;
    } else {
      nuevoEquipo2Puntos = Math.min(PUNTOS_PARA_GANAR, partida.equipo2Puntos + input.deltaEquipo2);
      if (nuevoEquipo2Puntos >= PUNTOS_PARA_GANAR) {
        equipoGanador = 2;
      }
    }

    const columnaPuntos = { equipo1Puntos: nuevoEquipo1Puntos, equipo2Puntos: nuevoEquipo2Puntos };

    // Bloque (ver CONTEXT.md / ADR 0005): siempre se recalcula. tipoActual
    // acá es el tipo con el que se jugó la Mano que se acaba de cargar (el
    // valor persistido antes de esta llamada); el puntaje que corresponde
    // pasarle es el de DESPUÉS de aplicar esta Mano, porque lo que se está
    // por predecir es el tipo de la Mano *siguiente* — no el de la que ya
    // se jugó y se está cargando ahora (ver el contrato de
    // calcularBloqueSiguiente: "puntaje de ambos Equipos antes de la Mano
    // que se está por jugar").
    const bloque = calcularBloqueSiguiente({
      tipoActual: partida.tipoDeBloqueActual,
      manosJugadas: partida.manosJugadasEnBloqueActual,
      umbralInicio: grupo.umbralInicioPicaPica,
      umbralFin: grupo.umbralFinPicaPica,
      equipo1Puntos: nuevoEquipo1Puntos,
      equipo2Puntos: nuevoEquipo2Puntos,
    });
    const columnaBloque = {
      tipoDeBloqueActual: bloque.tipo,
      manosJugadasEnBloqueActual: bloque.manosJugadas,
      // Informativo, ya no decide nada (ver ADR 0005).
      ultimoPuntoAnotadoEn: new Date(),
    };

    // Historial de Pica-pica (ver ADR 0006, ticket #29): se atribuye a la
    // pareja activa el delta REALMENTE aplicado a cada Equipo — no
    // input.deltaEquipo1/deltaEquipo2 tal cual vinieron, porque si esta
    // Mano hace ganar la Partida, el clamp a 30 (arriba) puede recortar el
    // delta de Equipo 1, y el de Equipo 2 puede no llegar a aplicarse en
    // absoluto (ver el comentario de "Puntaje" más arriba). El historial
    // tiene que reflejar lo que de verdad quedó sumado en el marcador de
    // esa Partida, no lo que el cliente mandó a cargar. null en Ronda — no
    // hay pareja que atribuirle nada.
    const historialPicaPica = parejaActiva && {
      partidaId: input.partidaId,
      jugadorAId: parejaActiva.jugadorEquipo1Id,
      jugadorBId: parejaActiva.jugadorEquipo2Id,
      deltaJugadorA: nuevoEquipo1Puntos - partida.equipo1Puntos,
      deltaJugadorB: nuevoEquipo2Puntos - partida.equipo2Puntos,
    };

    if (equipoGanador === null) {
      const [[actualizada]] = await Promise.all([
        tx
          .update(partidasTable)
          .set({ ...columnaPuntos, ...columnaBloque })
          .where(eq(partidasTable.id, input.partidaId))
          .returning(),
        historialPicaPica ? tx.insert(picaPicaManoTable).values(historialPicaPica) : Promise.resolve(),
      ]);
      return actualizada;
    }

    const [[finalizada]] = await Promise.all([
      tx
        .update(partidasTable)
        .set({
          ...columnaPuntos,
          ...columnaBloque,
          estado: "finalizada",
          equipoGanador,
          fechaFin: new Date(),
        })
        .where(eq(partidasTable.id, input.partidaId))
        .returning(),
      historialPicaPica ? tx.insert(picaPicaManoTable).values(historialPicaPica) : Promise.resolve(),
    ]);

    const jugadores = await tx
      .select({
        participanteId: partidasParticipantesTable.participanteId,
        equipoNumero: partidasParticipantesTable.equipoNumero,
      })
      .from(partidasParticipantesTable)
      .where(eq(partidasParticipantesTable.partidaId, input.partidaId));

    const ganadores = jugadores
      .filter((j) => j.equipoNumero === equipoGanador)
      .map((j) => j.participanteId);
    const perdedores = jugadores
      .filter((j) => j.equipoNumero !== equipoGanador)
      .map((j) => j.participanteId);

    // Nivel de Victoria (ver CONTEXT.md) según el puntaje final del Equipo
    // perdedor DESPUÉS de aplicar el delta de esta misma Mano — a
    // diferencia de antes (una sola columna cambiaba por llamada), acá el
    // perdedor también pudo haber sumado puntos en esta Mano (Envido a un
    // Equipo, Truco al otro). El peso en puntos de una sola Victoria de
    // este nivel sale de calcularEstadisticasRanking (ticket #15)
    // pidiéndole el resultado de "1 Partida jugada y ganada, con este
    // nivel" — así no se duplica la fórmula acá.
    const puntajeDelPerdedor = equipoGanador === 1 ? nuevoEquipo2Puntos : nuevoEquipo1Puntos;
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

// Corrección manual del Bloque (ver CONTEXT.md/Bloque, ticket #21): cuando
// la detección automática se desincroniza de lo que se está jugando en la
// mesa real, el Anotador puede pisar el tipo a mano. Reinicia
// manosJugadasEnBloqueActual a 0 en los dos casos — para Ronda ese valor es
// irrelevante (siempre es 1 sola Mano), para Pica-pica arranca de cero sus
// 3 Manos (ver historia de usuario 7 del ticket #19). No valida en qué Fase
// está la Partida ni pasa por calcularBloqueSiguiente — es una corrección
// deliberada del Anotador, y ese cálculo ya sabe seguir la alternancia
// desde cualquier estado en la próxima Mano que se cargue.
export async function corregirBloqueManualmente(input: {
  partidaId: string;
  solicitanteId: string;
  tipo: TipoDeBloque;
}) {
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
      throw new Error("Solo el Anotador de la Partida puede corregir el Bloque");
    }

    const [actualizada] = await tx
      .update(partidasTable)
      .set({ tipoDeBloqueActual: input.tipo, manosJugadasEnBloqueActual: 0 })
      .where(eq(partidasTable.id, input.partidaId))
      .returning();

    return actualizada;
  });
}

// Historial acumulado entre dos Participantes en los Bloques de Pica-pica
// de un Grupo (ver ADR 0006, ticket #29): suma todas las filas de
// pica_pica_mano de Partidas de ese Grupo donde aparecen los dos IDs, en
// cualquiera de las dos columnas — una Mano real no tiene "lado" fijo entre
// Partidas distintas (en una Partida jugadorA puede caer en jugadorAId, en
// otra en jugadorBId) — y devuelve el total orientado según el orden en
// que se pidieron los IDs acá, no según cómo haya quedado guardada cada
// fila. Mismo resultado sin importar qué Participante se pase primero.
export async function obtenerHistorialEntreJugadores(
  grupoId: string,
  participanteAId: string,
  participanteBId: string,
) {
  const db = getDb();

  const filas = await db
    .select({
      jugadorAId: picaPicaManoTable.jugadorAId,
      jugadorBId: picaPicaManoTable.jugadorBId,
      deltaJugadorA: picaPicaManoTable.deltaJugadorA,
      deltaJugadorB: picaPicaManoTable.deltaJugadorB,
    })
    .from(picaPicaManoTable)
    .innerJoin(partidasTable, eq(partidasTable.id, picaPicaManoTable.partidaId))
    .where(
      and(
        eq(partidasTable.grupoId, grupoId),
        or(
          and(
            eq(picaPicaManoTable.jugadorAId, participanteAId),
            eq(picaPicaManoTable.jugadorBId, participanteBId),
          ),
          and(
            eq(picaPicaManoTable.jugadorAId, participanteBId),
            eq(picaPicaManoTable.jugadorBId, participanteAId),
          ),
        ),
      ),
    );

  let puntosParticipanteA = 0;
  let puntosParticipanteB = 0;
  for (const fila of filas) {
    if (fila.jugadorAId === participanteAId) {
      puntosParticipanteA += fila.deltaJugadorA;
      puntosParticipanteB += fila.deltaJugadorB;
    } else {
      puntosParticipanteA += fila.deltaJugadorB;
      puntosParticipanteB += fila.deltaJugadorA;
    }
  }

  return { puntosParticipanteA, puntosParticipanteB, manosJugadas: filas.length };
}
