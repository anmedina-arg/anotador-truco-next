"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { anotarPunto, cancelarPartida, crearRevancha, crearSiguienteEquipo } from "@/domain/partidas";

function equipoValido(valor: FormDataEntryValue | null): 1 | 2 {
  const n = Number(valor);
  if (n !== 1 && n !== 2) {
    throw new Error("Equipo inválido");
  }
  return n;
}

function deltaValido(valor: FormDataEntryValue | null): 1 | -1 {
  const n = Number(valor);
  if (n !== 1 && n !== -1) {
    throw new Error("Delta inválido");
  }
  return n;
}

export async function anotarPuntoAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const grupoId = String(formData.get("grupoId") ?? "");
  const partidaId = String(formData.get("partidaId") ?? "");
  const equipo = equipoValido(formData.get("equipo"));
  const delta = deltaValido(formData.get("delta"));

  try {
    await anotarPunto({ partidaId, solicitanteId: session.user.id, equipo, delta });
  } catch (error) {
    // Doble click, pestaña vieja u otra sesión llegó primero: la Partida ya
    // no está en el estado que el botón asumía (ya se cerró, ya se canceló).
    // No hay nada que reparar — revalidar y mostrar el estado real alcanza.
    if (!(error instanceof Error)) throw error;
  }

  revalidatePath(`/grupos/${grupoId}/partidas/${partidaId}`);
  revalidatePath(`/grupos/${grupoId}`);
}

export type EstadoRevancha = { message: string } | undefined;

export async function crearRevanchaAction(
  _estadoPrevio: EstadoRevancha,
  formData: FormData,
): Promise<EstadoRevancha> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const grupoId = String(formData.get("grupoId") ?? "");
  const partidaId = String(formData.get("partidaId") ?? "");

  let revancha: Awaited<ReturnType<typeof crearRevancha>>;
  try {
    revancha = await crearRevancha({ partidaId, solicitanteId: session.user.id });
  } catch (error) {
    if (error instanceof Error) {
      return { message: error.message };
    }
    throw error;
  }

  revalidatePath(`/grupos/${grupoId}`);
  redirect(`/grupos/${grupoId}/partidas/${revancha.id}`);
}

export type EstadoSiguienteEquipo = { message: string } | undefined;

export async function crearSiguienteEquipoAction(
  _estadoPrevio: EstadoSiguienteEquipo,
  formData: FormData,
): Promise<EstadoSiguienteEquipo> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const grupoId = String(formData.get("grupoId") ?? "");
  const partidaId = String(formData.get("partidaId") ?? "");
  const equipoDesafiante = formData.getAll("equipoDesafiante").map(String);
  const nuevoAnotadorRaw = formData.get("nuevoAnotadorParticipanteId");
  const nuevoAnotadorParticipanteId = nuevoAnotadorRaw ? String(nuevoAnotadorRaw) : undefined;

  let siguiente: Awaited<ReturnType<typeof crearSiguienteEquipo>>;
  try {
    siguiente = await crearSiguienteEquipo({
      partidaId,
      solicitanteId: session.user.id,
      equipoDesafiante,
      nuevoAnotadorParticipanteId,
    });
  } catch (error) {
    if (error instanceof Error) {
      return { message: error.message };
    }
    throw error;
  }

  revalidatePath(`/grupos/${grupoId}`);
  redirect(`/grupos/${grupoId}/partidas/${siguiente.id}`);
}

export async function cancelarPartidaAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const grupoId = String(formData.get("grupoId") ?? "");
  const partidaId = String(formData.get("partidaId") ?? "");

  try {
    await cancelarPartida({ partidaId, solicitanteId: session.user.id });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
  }

  revalidatePath(`/grupos/${grupoId}/partidas/${partidaId}`);
  revalidatePath(`/grupos/${grupoId}`);
}
