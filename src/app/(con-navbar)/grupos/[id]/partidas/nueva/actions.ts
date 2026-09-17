"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { crearPartida } from "@/domain/partidas";

export type EstadoNuevaPartida = { message: string } | undefined;

export async function crearPartidaAction(
  _estadoPrevio: EstadoNuevaPartida,
  formData: FormData,
): Promise<EstadoNuevaPartida> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const grupoId = String(formData.get("grupoId") ?? "");
  const equipo1: string[] = [];
  const equipo2: string[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("equipo-")) continue;
    const participanteId = key.slice("equipo-".length);
    if (value === "1") equipo1.push(participanteId);
    else if (value === "2") equipo2.push(participanteId);
  }

  // Parejas de Pica-pica (ver ADR 0006) armadas por toque en el cliente
  // (ver ArmadoDeParejasPicaPica) — viajan como pares de inputs ocultos con
  // el mismo índice en los dos nombres.
  const picaPicaJugador1 = formData.getAll("picaPicaJugador1").map(String);
  const picaPicaJugador2 = formData.getAll("picaPicaJugador2").map(String);
  const picaPicaParejas = picaPicaJugador1.map((jugadorEquipo1Id, i) => ({
    jugadorEquipo1Id,
    jugadorEquipo2Id: picaPicaJugador2[i],
  }));

  let partida: Awaited<ReturnType<typeof crearPartida>>;
  try {
    partida = await crearPartida({
      grupoId,
      anotadorParticipanteId: session.user.id,
      equipo1,
      equipo2,
      picaPicaParejas,
    });
  } catch (error) {
    if (error instanceof Error) {
      return { message: error.message };
    }
    throw error;
  }

  // Directo al marcador en vez de a la página del Grupo — evita el paso
  // extra de tener que ubicar el link de la Partida recién creada.
  redirect(`/grupos/${grupoId}/partidas/${partida.id}`);
}
