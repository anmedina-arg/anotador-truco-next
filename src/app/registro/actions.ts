"use server";

import { registrarParticipante } from "@/domain/participantes";
import { signIn } from "@/auth";

export async function registrarYLoguear(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!nombre || !email || !password) {
    throw new Error("Completá nombre, email y contraseña.");
  }

  await registrarParticipante({ nombre, email, password });
  await signIn("credentials", { email, password, redirectTo: "/" });
}
