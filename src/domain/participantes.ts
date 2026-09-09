import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "../db/client";
import { usersTable } from "../db/schema";

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
      .values({ name: input.nombre, email, passwordHash })
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
