"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  regenerarCodigoInvitacion,
  sacarMiembro,
  agregarMiembroPorEmail,
  actualizarEstadisticas,
  ParticipanteNoEncontradoError,
  YaEsMiembroError,
  EstadisticasInvalidasError,
} from "@/domain/grupos";

export async function regenerarCodigoInvitacionAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const grupoId = String(formData.get("grupoId") ?? "");
  await regenerarCodigoInvitacion({ grupoId, solicitanteId: session.user.id });
  revalidatePath(`/grupos/${grupoId}`);
}

export type EstadoInvitarPorEmail = { message: string } | undefined;

export async function invitarPorEmailAction(
  _estadoPrevio: EstadoInvitarPorEmail,
  formData: FormData,
): Promise<EstadoInvitarPorEmail> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const grupoId = String(formData.get("grupoId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { message: "Poné el email del Participante." };
  }

  try {
    await agregarMiembroPorEmail({ grupoId, solicitanteId: session.user.id, email });
  } catch (error) {
    if (error instanceof ParticipanteNoEncontradoError || error instanceof YaEsMiembroError) {
      return { message: error.message };
    }
    throw error;
  }

  revalidatePath(`/grupos/${grupoId}`);
  return undefined;
}

export async function sacarMiembroAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const grupoId = String(formData.get("grupoId") ?? "");
  const participanteId = String(formData.get("participanteId") ?? "");
  await sacarMiembro({ grupoId, solicitanteId: session.user.id, participanteId });
  revalidatePath(`/grupos/${grupoId}`);
}

export type EstadoEditarEstadisticas = { message: string } | undefined;

export async function actualizarEstadisticasAction(
  _estadoPrevio: EstadoEditarEstadisticas,
  formData: FormData,
): Promise<EstadoEditarEstadisticas> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const grupoId = String(formData.get("grupoId") ?? "");
  const participanteId = String(formData.get("participanteId") ?? "");
  const partidasJugadas = Number(formData.get("partidasJugadas"));
  const partidasGanadas = Number(formData.get("partidasGanadas"));
  const partidasPerdidas = Number(formData.get("partidasPerdidas"));

  try {
    await actualizarEstadisticas({
      grupoId,
      solicitanteId: session.user.id,
      participanteId,
      partidasJugadas,
      partidasGanadas,
      partidasPerdidas,
    });
  } catch (error) {
    if (error instanceof EstadisticasInvalidasError) {
      return { message: error.message };
    }
    throw error;
  }

  revalidatePath(`/grupos/${grupoId}`);
  return undefined;
}
