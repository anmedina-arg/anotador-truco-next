import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { usersTable, gruposTable, gruposParticipantesTable } from "../db/schema";

export class CodigoInvitacionInvalidoError extends Error {
  constructor() {
    super("Código de invitación inválido");
    this.name = "CodigoInvitacionInvalidoError";
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

// Sin orden particular a propósito: esta lista también alimenta el picker
// de "Nueva Partida" y el panel de administración de miembros — ninguno de
// los dos debería reordenarse cada vez que alguien gana una Partida. Para
// el Ranking (ticket #7) usar ordenarPorRanking sobre el resultado.
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
      partidasPerdidas: gruposParticipantesTable.partidasPerdidas,
    })
    .from(gruposParticipantesTable)
    .innerJoin(usersTable, eq(usersTable.id, gruposParticipantesTable.participanteId))
    .where(eq(gruposParticipantesTable.grupoId, grupoId));
}

// Ranking (ver CONTEXT.md): orden de Participantes por puntos, desempatado
// por participanteId para que el orden sea determinístico entre llamadas —
// sin un desempate explícito, Postgres no garantiza nada entre filas
// empatadas en puntos.
export function ordenarPorRanking<T extends { puntos: number; participanteId: string }>(
  miembros: T[],
): T[] {
  return [...miembros].sort(
    (a, b) => b.puntos - a.puntos || a.participanteId.localeCompare(b.participanteId),
  );
}

// Ratio puntos/Partidas jugadas (ver CONTEXT.md) — null cuando todavía no
// jugó ninguna Partida, para no confundir "no jugó" con "ratio 0".
export function calcularRatio(puntos: number, partidasJugadas: number): number | null {
  return partidasJugadas === 0 ? null : puntos / partidasJugadas;
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
