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

  // Los dos campos son opcionales en el formulario (ver formulario.tsx): un
  // input vacío llega acá como "" — se trata igual que "no lo mandó" (usa
  // los defaults de crearGrupo), no como un valor inválido.
  const umbralInicioCrudo = String(formData.get("umbralInicioPicaPica") ?? "").trim();
  const umbralFinCrudo = String(formData.get("umbralFinPicaPica") ?? "").trim();
  const umbralInicioPicaPica = umbralInicioCrudo ? Number(umbralInicioCrudo) : undefined;
  const umbralFinPicaPica = umbralFinCrudo ? Number(umbralFinCrudo) : undefined;

  try {
    await crearGrupo({ nombre, adminParticipanteId: session.user.id, umbralInicioPicaPica, umbralFinPicaPica });
  } catch (error) {
    if (error instanceof Error) {
      return { message: error.message };
    }
    throw error;
  }

  redirect("/grupos");
}
