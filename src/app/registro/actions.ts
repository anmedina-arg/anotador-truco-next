"use server";

import { registrarParticipante } from "@/domain/participantes";
import { signIn } from "@/auth";

export type EstadoRegistro = { message: string } | undefined;

export async function registrarYLoguear(
  _estadoPrevio: EstadoRegistro,
  formData: FormData,
): Promise<EstadoRegistro> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!nombre || !email || !password) {
    return { message: "Completá nombre, email y contraseña." };
  }

  try {
    await registrarParticipante({ nombre, email, password });
  } catch (error) {
    if (error instanceof Error) {
      return { message: error.message };
    }
    throw error;
  }

  await signIn("credentials", { email, password, redirectTo: "/" });
}
