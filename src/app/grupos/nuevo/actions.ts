"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { crearGrupo } from "@/domain/grupos";

export type EstadoNuevoGrupo = { message: string } | undefined;

export async function crearGrupoAction(
  _estadoPrevio: EstadoNuevoGrupo,
  formData: FormData,
): Promise<EstadoNuevoGrupo> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) {
    return { message: "Poné un nombre para el Grupo." };
  }

  await crearGrupo({ nombre, adminParticipanteId: session.user.id });
  redirect("/grupos");
}
