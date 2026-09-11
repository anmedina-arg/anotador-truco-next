"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { regenerarCodigoInvitacion, sacarMiembro } from "@/domain/grupos";

export async function regenerarCodigoInvitacionAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const grupoId = String(formData.get("grupoId") ?? "");
  await regenerarCodigoInvitacion({ grupoId, solicitanteId: session.user.id });
  revalidatePath(`/grupos/${grupoId}`);
}

export async function sacarMiembroAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const grupoId = String(formData.get("grupoId") ?? "");
  const participanteId = String(formData.get("participanteId") ?? "");
  await sacarMiembro({ grupoId, solicitanteId: session.user.id, participanteId });
  revalidatePath(`/grupos/${grupoId}`);
}
