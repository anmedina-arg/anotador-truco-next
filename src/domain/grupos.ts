import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { usersTable, gruposTable, gruposParticipantesTable } from "../db/schema";

export class CodigoInvitacionInvalidoError extends Error {
  constructor() {
    super("Código de invitación inválido");
    this.name = "CodigoInvitacionInvalidoError";
  }
}

export class ParticipanteNoEncontradoError extends Error {
  constructor() {
    super("No hay ningún Participante registrado con ese email");
    this.name = "ParticipanteNoEncontradoError";
  }
}

export class YaEsMiembroError extends Error {
  constructor() {
    super("Ese Participante ya es miembro del Grupo");
    this.name = "YaEsMiembroError";
  }
}

export class EstadisticasInvalidasError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "EstadisticasInvalidasError";
  }
}

function generarCodigoInvitacion() {
  return randomBytes(6).toString("base64url");
}

const POSTGRES_UNIQUE_VIOLATION = "23505";
const INTENTOS_CODIGO_INVITACION = 3;

function esColisionUnica(error: unknown) {
  return (
    error instanceof Error && "code" in error && error.code === POSTGRES_UNIQUE_VIOLATION
  );
}

// El código de invitación es aleatorio; una colisión es astronómicamente
// rara, pero reintentar con un código nuevo es más simple para quien lo pide
// que mostrarle un error que no puede resolver por su cuenta.
async function reintentarConCodigoUnico<T>(operacion: () => Promise<T>): Promise<T> {
  let intentosRestantes = INTENTOS_CODIGO_INVITACION;

  while (true) {
    try {
      return await operacion();
    } catch (error) {
      intentosRestantes -= 1;
      if (!esColisionUnica(error) || intentosRestantes <= 0) {
        throw error;
      }
    }
  }
}

async function requerirAdmin(grupoId: string, solicitanteId: string) {
  const grupo = await obtenerGrupoPorId(grupoId);
  if (!grupo || grupo.adminParticipanteId !== solicitanteId) {
    throw new Error("Solo el admin del Grupo puede hacer esto");
  }
  return grupo;
}

export async function crearGrupo(input: {
  nombre: string;
  adminParticipanteId: string;
}) {
  const nombre = input.nombre.trim();
  if (!nombre) {
    throw new Error("El Grupo necesita un nombre");
  }

  const db = getDb();

  return db.transaction(async (tx) => {
    const grupo = await reintentarConCodigoUnico(async () => {
      const [fila] = await tx
        .insert(gruposTable)
        .values({
          nombre,
          adminParticipanteId: input.adminParticipanteId,
          codigoInvitacion: generarCodigoInvitacion(),
        })
        .returning();
      return fila;
    });

    await tx.insert(gruposParticipantesTable).values({
      grupoId: grupo.id,
      participanteId: input.adminParticipanteId,
    });

    return grupo;
  });
}

export async function listarGruposDeParticipante(participanteId: string) {
  const db = getDb();

  return db
    .select({
      id: gruposTable.id,
      nombre: gruposTable.nombre,
      adminParticipanteId: gruposTable.adminParticipanteId,
      codigoInvitacion: gruposTable.codigoInvitacion,
      creadoEn: gruposTable.creadoEn,
    })
    .from(gruposTable)
    .innerJoin(
      gruposParticipantesTable,
      eq(gruposParticipantesTable.grupoId, gruposTable.id),
    )
    .where(eq(gruposParticipantesTable.participanteId, participanteId));
}

export async function obtenerGrupoPorId(grupoId: string) {
  const db = getDb();
  const [grupo] = await db.select().from(gruposTable).where(eq(gruposTable.id, grupoId));
  return grupo ?? null;
}

// El Grupo al que el Participante pertenece hace más tiempo — por su propia
// fecha de alta a ese Grupo (grupoParticipante.fechaAlta), no por cuándo se
// creó el Grupo en sí (alguien puede sumarse mucho después a un Grupo viejo).
export async function obtenerGrupoMasAntiguoDeParticipante(participanteId: string) {
  const db = getDb();

  const [grupo] = await db
    .select({ id: gruposTable.id, nombre: gruposTable.nombre })
    .from(gruposParticipantesTable)
    .innerJoin(gruposTable, eq(gruposTable.id, gruposParticipantesTable.grupoId))
    .where(eq(gruposParticipantesTable.participanteId, participanteId))
    .orderBy(asc(gruposParticipantesTable.fechaAlta))
    .limit(1);

  return grupo ?? null;
}

// Sin orden particular propio: quien la llama decide cómo ordenar el
// resultado — ordenarPorRanking (Ranking) u ordenarPorFrecuencia (picker de
// "Nueva Partida" y lista de Miembros, ver ticket #11).
export async function listarMiembrosDeGrupo(grupoId: string) {
  const db = getDb();

  return db
    .select({
      participanteId: usersTable.id,
      nombre: usersTable.name,
      email: usersTable.email,
      puntos: gruposParticipantesTable.puntos,
      partidasJugadas: gruposParticipantesTable.partidasJugadas,
      partidasGanadas: gruposParticipantesTable.partidasGanadas,
      partidasGanadasDobles: gruposParticipantesTable.partidasGanadasDobles,
      partidasGanadasTriples: gruposParticipantesTable.partidasGanadasTriples,
      partidasPerdidas: gruposParticipantesTable.partidasPerdidas,
    })
    .from(gruposParticipantesTable)
    .innerJoin(usersTable, eq(usersTable.id, gruposParticipantesTable.participanteId))
    .where(eq(gruposParticipantesTable.grupoId, grupoId));
}

// Desempate determinístico compartido por los distintos órdenes de
// Participantes de abajo — sin él, Postgres no garantiza nada entre filas
// empatadas en el campo que se esté ordenando.
function compararPorParticipanteId(a: { participanteId: string }, b: { participanteId: string }) {
  return a.participanteId.localeCompare(b.participanteId);
}

// Ranking (ver CONTEXT.md): orden de Participantes por promedio
// (puntos/Partidas jugadas), no por suma total — a propósito, para que
// pocas Partidas con buen resultado no queden por detrás de muchas con
// resultado mediocre. Sin Partidas jugadas el promedio no existe
// (calcularRatio devuelve null): esos Participantes van todos al final,
// desempatados entre sí igual que el resto (ver ADR 0002 — no hay umbral
// mínimo de Partidas jugadas para entrar a este orden).
export function ordenarPorRanking<
  T extends { puntos: number; partidasJugadas: number; participanteId: string },
>(miembros: T[]): T[] {
  return [...miembros].sort((a, b) => {
    const ratioA = calcularRatio(a.puntos, a.partidasJugadas);
    const ratioB = calcularRatio(b.puntos, b.partidasJugadas);

    if (ratioA === null && ratioB === null) return compararPorParticipanteId(a, b);
    if (ratioA === null) return 1;
    if (ratioB === null) return -1;

    return ratioB - ratioA || compararPorParticipanteId(a, b);
  });
}

// Orden por frecuencia de juego (ticket #11): quienes juegan más seguido
// primero, para no tener que buscarlos entre gente que rara vez juega al
// armar Equipos.
export function ordenarPorFrecuencia<T extends { partidasJugadas: number; participanteId: string }>(
  miembros: T[],
): T[] {
  return [...miembros].sort(
    (a, b) => b.partidasJugadas - a.partidasJugadas || compararPorParticipanteId(a, b),
  );
}

// Orden alfabético por nombre (o email si no tiene nombre cargado) — el que
// usa la lista de "Miembros" del Grupo, a diferencia del picker de armado de
// Equipos que usa ordenarPorFrecuencia.
export function ordenarAlfabeticamente<
  T extends { nombre: string | null; email: string | null; participanteId: string },
>(miembros: T[]): T[] {
  return [...miembros].sort(
    (a, b) =>
      (a.nombre || a.email || "").localeCompare(b.nombre || b.email || "") ||
      compararPorParticipanteId(a, b),
  );
}

// Ratio puntos/Partidas jugadas (ver CONTEXT.md) — null cuando todavía no
// jugó ninguna Partida, para no confundir "no jugó" con "ratio 0".
export function calcularRatio(puntos: number, partidasJugadas: number): number | null {
  return partidasJugadas === 0 ? null : puntos / partidasJugadas;
}

// Victorias simples de un grupo_participante — no se persisten aparte (ver
// calcularEstadisticasRanking), quedan siempre implícitas como el resto de
// las ganadas que no fueron dobles ni triples. Único lugar que hace esa
// resta, para que la UI no la repita suelta.
export function calcularPartidasGanadasSimples(input: {
  partidasGanadas: number;
  partidasGanadasDobles: number;
  partidasGanadasTriples: number;
}): number {
  return input.partidasGanadas - input.partidasGanadasDobles - input.partidasGanadasTriples;
}

// Nivel de Victoria (ver CONTEXT.md) según el puntaje final del Equipo
// perdedor al cerrarse la Partida. Rangos propios de esta regla — no
// reutilizan Malas/Buenas (0-15/16-30, contador en vivo de una Partida).
export function nivelDeVictoria(puntajeFinalDelPerdedor: number): "simple" | "doble" | "triple" {
  if (puntajeFinalDelPerdedor === 0) return "triple";
  if (puntajeFinalDelPerdedor <= 15) return "doble";
  return "simple";
}

// Único lugar que calcula puntos/partidasPerdidas de un grupo_participante
// (ver CONTEXT.md, Ranking). anotarPunto (cierre de Partida en vivo) le pide
// "1 Partida jugada y ganada con este Nivel" para obtener el peso de una
// sola Victoria; actualizarEstadisticas (corrección manual del admin) le
// pasa el desglose absoluto que cargó el admin — mismo cálculo, sin
// duplicar la fórmula. Simples quedan implícitas (ganadas - dobles -
// triples): puntos = simples×1 + dobles×2 + triples×3, que se simplifica a
// ganadas + dobles + 2×triples. No valida que dobles+triples <= ganadas —
// esa validación es responsabilidad del caller (ver actualizarEstadisticas).
export function calcularEstadisticasRanking(input: {
  partidasJugadas: number;
  partidasGanadas: number;
  partidasGanadasDobles: number;
  partidasGanadasTriples: number;
}): { puntos: number; partidasPerdidas: number } {
  const { partidasJugadas, partidasGanadas, partidasGanadasDobles, partidasGanadasTriples } = input;

  return {
    puntos: partidasGanadas + partidasGanadasDobles + 2 * partidasGanadasTriples,
    partidasPerdidas: partidasJugadas - partidasGanadas,
  };
}

export async function unirseAGrupo(input: {
  codigoInvitacion: string;
  participanteId: string;
}) {
  const db = getDb();

  const [grupo] = await db
    .select()
    .from(gruposTable)
    .where(eq(gruposTable.codigoInvitacion, input.codigoInvitacion));

  if (!grupo) {
    throw new CodigoInvitacionInvalidoError();
  }

  const [yaEsMiembro] = await db
    .select({ grupoId: gruposParticipantesTable.grupoId })
    .from(gruposParticipantesTable)
    .where(
      and(
        eq(gruposParticipantesTable.grupoId, grupo.id),
        eq(gruposParticipantesTable.participanteId, input.participanteId),
      ),
    );

  if (!yaEsMiembro) {
    try {
      await db.insert(gruposParticipantesTable).values({
        grupoId: grupo.id,
        participanteId: input.participanteId,
      });
    } catch (error) {
      // Ya es miembro (carrera con otra pestaña abriendo el mismo link) — no
      // es un error real, unirse dos veces al mismo Grupo es un no-op.
      if (!esColisionUnica(error)) {
        throw error;
      }
    }
  }

  return grupo;
}

// Alta directa por el admin (a diferencia de unirseAGrupo, que es
// autoservicio vía código): busca por email exacto entre los Participantes
// ya registrados, no crea cuentas nuevas.
export async function agregarMiembroPorEmail(input: {
  grupoId: string;
  solicitanteId: string;
  email: string;
}) {
  await requerirAdmin(input.grupoId, input.solicitanteId);

  const db = getDb();
  const email = input.email.trim().toLowerCase();

  const [participante] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!participante) {
    throw new ParticipanteNoEncontradoError();
  }

  const [yaEsMiembro] = await db
    .select({ grupoId: gruposParticipantesTable.grupoId })
    .from(gruposParticipantesTable)
    .where(
      and(
        eq(gruposParticipantesTable.grupoId, input.grupoId),
        eq(gruposParticipantesTable.participanteId, participante.id),
      ),
    );

  if (yaEsMiembro) {
    throw new YaEsMiembroError();
  }

  await db.insert(gruposParticipantesTable).values({
    grupoId: input.grupoId,
    participanteId: participante.id,
  });
}

export async function regenerarCodigoInvitacion(input: {
  grupoId: string;
  solicitanteId: string;
}) {
  await requerirAdmin(input.grupoId, input.solicitanteId);

  const db = getDb();

  return reintentarConCodigoUnico(async () => {
    const [actualizado] = await db
      .update(gruposTable)
      .set({ codigoInvitacion: generarCodigoInvitacion() })
      .where(eq(gruposTable.id, input.grupoId))
      .returning();
    return actualizado;
  });
}

export async function sacarMiembro(input: {
  grupoId: string;
  solicitanteId: string;
  participanteId: string;
}) {
  const grupo = await requerirAdmin(input.grupoId, input.solicitanteId);

  if (input.participanteId === grupo.adminParticipanteId) {
    throw new Error("El admin no puede sacarse a sí mismo del Grupo");
  }

  const db = getDb();
  await db
    .delete(gruposParticipantesTable)
    .where(
      and(
        eq(gruposParticipantesTable.grupoId, input.grupoId),
        eq(gruposParticipantesTable.participanteId, input.participanteId),
      ),
    );
}

// Corrección manual del admin (ej. una Partida jugada fuera de la app, o un
// error de carga) — recibe el desglose de victorias (ganadas totales, más
// cuántas de esas fueron dobles/triples; simples quedan implícitas) y deriva
// puntos/partidasPerdidas con calcularEstadisticasRanking (ticket #15), para
// no duplicar esa fórmula acá.
export async function actualizarEstadisticas(input: {
  grupoId: string;
  solicitanteId: string;
  participanteId: string;
  partidasJugadas: number;
  partidasGanadas: number;
  partidasGanadasDobles: number;
  partidasGanadasTriples: number;
}) {
  await requerirAdmin(input.grupoId, input.solicitanteId);

  const { partidasJugadas, partidasGanadas, partidasGanadasDobles, partidasGanadasTriples } = input;
  if (
    [partidasJugadas, partidasGanadas, partidasGanadasDobles, partidasGanadasTriples].some(
      (valor) => !Number.isInteger(valor) || valor < 0,
    )
  ) {
    throw new EstadisticasInvalidasError("Los valores tienen que ser números enteros, 0 o más");
  }
  if (partidasGanadas > partidasJugadas) {
    throw new EstadisticasInvalidasError("Ganadas no puede ser más que Jugadas");
  }
  if (partidasGanadasDobles + partidasGanadasTriples > partidasGanadas) {
    throw new EstadisticasInvalidasError("Ganadas dobles + triples no puede ser más que Ganadas");
  }

  const { puntos, partidasPerdidas } = calcularEstadisticasRanking({
    partidasJugadas,
    partidasGanadas,
    partidasGanadasDobles,
    partidasGanadasTriples,
  });

  const db = getDb();
  const actualizado = await db
    .update(gruposParticipantesTable)
    .set({
      partidasJugadas,
      partidasGanadas,
      partidasGanadasDobles,
      partidasGanadasTriples,
      partidasPerdidas,
      puntos,
    })
    .where(
      and(
        eq(gruposParticipantesTable.grupoId, input.grupoId),
        eq(gruposParticipantesTable.participanteId, input.participanteId),
      ),
    )
    .returning({ grupoId: gruposParticipantesTable.grupoId });

  if (actualizado.length === 0) {
    throw new Error("Ese Participante no es miembro del Grupo");
  }
}
