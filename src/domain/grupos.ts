import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { gruposTable, gruposParticipantesTable } from "../db/schema";

function generarCodigoInvitacion() {
  return randomBytes(6).toString("base64url");
}

const POSTGRES_UNIQUE_VIOLATION = "23505";
const INTENTOS_CODIGO_INVITACION = 3;

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
    let grupo;
    let intentosRestantes = INTENTOS_CODIGO_INVITACION;

    // El código de invitación es aleatorio; una colisión es astronómicamente
    // rara, pero reintentar con un código nuevo es más simple para quien crea
    // el Grupo que mostrarle un error que no puede resolver por su cuenta.
    while (true) {
      try {
        [grupo] = await tx
          .insert(gruposTable)
          .values({
            nombre,
            adminParticipanteId: input.adminParticipanteId,
            codigoInvitacion: generarCodigoInvitacion(),
          })
          .returning();
        break;
      } catch (error) {
        intentosRestantes -= 1;
        const esColisionDeCodigo =
          error instanceof Error &&
          "code" in error &&
          error.code === POSTGRES_UNIQUE_VIOLATION;
        if (!esColisionDeCodigo || intentosRestantes <= 0) {
          throw error;
        }
      }
    }

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
