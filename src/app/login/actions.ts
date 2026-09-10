"use server";

import { CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";

export type EstadoLogin = { message: string } | undefined;

export async function loguearConCredenciales(
  _estadoPrevio: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    // Ojo: no capturar el AuthError genérico acá — CallbackRouteError envuelve
    // cualquier excepción de authorize() (ej. la base caída), no solo
    // credenciales inválidas. Solo CredentialsSignin es específicamente eso.
    if (error instanceof CredentialsSignin) {
      return { message: "Email o contraseña incorrectos." };
    }
    throw error;
  }
}

export async function loguearConGoogle() {
  await signIn("google", { redirectTo: "/" });
}
