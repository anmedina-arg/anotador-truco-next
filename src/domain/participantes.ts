import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "../db/client";
import { usersTable } from "../db/schema";

// Forma mínima de un Participante para mostrar en una lista (nombre de
// Grupo, Equipo de una Partida, etc.) — un solo lugar para no repetir esta
// forma en cada módulo que solo necesita id+nombre+email.
export type ParticipanteBasico = {
  participanteId: string;
  nombre: string | null;
  email: string | null;
};

export function nombreDeParticipante(participante: ParticipanteBasico) {
  return participante.nombre || participante.email || "";
}

export function nombresDeEquipo(equipo: ParticipanteBasico[]) {
  return equipo.map(nombreDeParticipante).join(", ");
}

export function inicialesDeParticipante(participante: ParticipanteBasico) {
  const palabras = nombreDeParticipante(participante).trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) {
    return "?";
  }
  const [primera, segunda] = palabras;
  return (primera.charAt(0) + (segunda?.charAt(0) ?? "")).toUpperCase();
}

function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

// Código de error de Postgres para violación de constraint unique.
const POSTGRES_UNIQUE_VIOLATION = "23505";

export async function registrarParticipante(input: {
  nombre: string;
  email: string;
  password: string;
}) {
  if (input.password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres");
  }

  const nombre = input.nombre.trim();
  if (!nombre) {
    throw new Error("El Participante necesita un nombre");
  }

  const db = getDb();
  const email = normalizarEmail(input.email);

  const [yaExiste] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (yaExiste) {
    throw new Error("Ya existe un Participante con ese email");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  try {
    const [participante] = await db
      .insert(usersTable)
      .values({ name: nombre, email, passwordHash })
      .returning();

    return participante;
  } catch (error) {
    // Defensa contra la carrera entre el SELECT de arriba y este INSERT: si
    // dos registros con el mismo email llegan casi al mismo tiempo, el
    // constraint unique de la base es la última línea de defensa.
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === POSTGRES_UNIQUE_VIOLATION
    ) {
      throw new Error("Ya existe un Participante con ese email");
    }
    throw error;
  }
}

export async function verificarCredenciales(input: {
  email: string;
  password: string;
}) {
  const db = getDb();
  const email = normalizarEmail(input.email);

  const [participante] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!participante?.passwordHash) {
    return null;
  }

  const coincide = await bcrypt.compare(input.password, participante.passwordHash);
  return coincide ? participante : null;
}
