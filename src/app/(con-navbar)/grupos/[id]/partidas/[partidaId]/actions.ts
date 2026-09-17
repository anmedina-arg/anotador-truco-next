"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  anotarPunto,
  cargarResultadoDeMano,
  cancelarPartida,
  corregirBloqueManualmente,
  crearRevancha,
  crearSiguienteEquipo,
  type TipoDeBloque,
} from "@/domain/partidas";

// Una Server Action se puede invocar con un POST directo, sin pasar por el
// tipado de TypeScript del lado del cliente — validar en runtime igual que
// antes hacía equipoValido() con el FormData.
function equipoValido(valor: unknown): 1 | 2 {
  if (valor !== 1 && valor !== 2) {
    throw new Error("Equipo inválido");
  }
  return valor;
}

function tipoDeBloqueValido(valor: unknown): TipoDeBloque {
  if (valor !== "ronda" && valor !== "pica_pica") {
    throw new Error("Tipo de Bloque inválido");
  }
  return valor;
}

export type ResultadoCorregirPunto =
  | { ok: true; equipo1Puntos: number; equipo2Puntos: number }
  | { ok: false };

// Corrige un punto ya confirmado de una Mano anterior (ver CONTEXT.md/Mano,
// ADR 0005) — se llama directo desde el componente cliente del tanteador
// (ver marcador-en-vivo.tsx), no por un <form>, así que recibe argumentos
// planos en vez de FormData. Devuelve el puntaje resultante para que el
// cliente actualice su estado local ya mismo — esperar a que
// revalidatePath refresque los props del Server Component deja una
// ventana donde el puntaje mostrado vuelve por un instante al valor
// viejo antes de ponerse al día (parpadeo).
export async function corregirPuntoAction(input: {
  grupoId: string;
  partidaId: string;
  equipo: 1 | 2;
}): Promise<ResultadoCorregirPunto> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const equipo = equipoValido(input.equipo);

  let actualizada: Awaited<ReturnType<typeof anotarPunto>> | undefined;
  try {
    actualizada = await anotarPunto({
      partidaId: input.partidaId,
      solicitanteId: session.user.id,
      equipo,
      delta: -1,
    });
  } catch (error) {
    // Doble click, pestaña vieja u otra sesión llegó primero: la Partida ya
    // no está en el estado que el botón asumía (ya se cerró, ya se canceló).
    // No hay nada que reparar — revalidar y mostrar el estado real alcanza.
    if (!(error instanceof Error)) throw error;
  }

  revalidatePath(`/grupos/${input.grupoId}/partidas/${input.partidaId}`);
  revalidatePath(`/grupos/${input.grupoId}`);

  if (!actualizada) return { ok: false };
  return { ok: true, equipo1Puntos: actualizada.equipo1Puntos, equipo2Puntos: actualizada.equipo2Puntos };
}

export type ResultadoCargarMano =
  | { ok: true; equipo1Puntos: number; equipo2Puntos: number }
  | { ok: false; message: string };

// Carga el resultado de una Mano completa (ver CONTEXT.md/Mano, ADR 0005) —
// el debounce del cliente ya decidió que la Mano terminó antes de llamar
// esto. A diferencia del resto de las acciones de este archivo, esta
// devuelve un resultado explícito: el cliente necesita distinguir un
// rechazo de dominio limpio (no reintentar, ej. "no sos el Anotador") de
// una falla de red real (reintentar con backoff), y necesita el puntaje
// resultante para actualizar su estado local ya mismo (ver comentario de
// corregirPuntoAction arriba) — ver marcador-en-vivo.tsx.
export async function cargarResultadoDeManoAction(input: {
  grupoId: string;
  partidaId: string;
  deltaEquipo1: number;
  deltaEquipo2: number;
}): Promise<ResultadoCargarMano> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  let actualizada: Awaited<ReturnType<typeof cargarResultadoDeMano>>;
  try {
    actualizada = await cargarResultadoDeMano({
      partidaId: input.partidaId,
      solicitanteId: session.user.id,
      deltaEquipo1: input.deltaEquipo1,
      deltaEquipo2: input.deltaEquipo2,
    });
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  revalidatePath(`/grupos/${input.grupoId}/partidas/${input.partidaId}`);
  revalidatePath(`/grupos/${input.grupoId}`);
  return { ok: true, equipo1Puntos: actualizada.equipo1Puntos, equipo2Puntos: actualizada.equipo2Puntos };
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

export type ResultadoCorregirBloque = { ok: true } | { ok: false; message: string };

// Corrección manual del Bloque (ver CONTEXT.md/Bloque, ticket #21) — args
// planos, no FormData: se llama directo desde marcador-en-vivo.tsx después
// de forzar el flush de cualquier toque todavía pendiente (ver
// corregirBloque en ese componente), para que la corrección nunca se le
// aplique a la Mano equivocada. El badge de "Mano actual" sigue sin ser
// optimista (ver ticket #20): se actualiza recién cuando revalidatePath
// refresca el prop.
export async function corregirBloqueAction(input: {
  grupoId: string;
  partidaId: string;
  tipo: unknown;
}): Promise<ResultadoCorregirBloque> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const tipo = tipoDeBloqueValido(input.tipo);

  try {
    await corregirBloqueManualmente({ partidaId: input.partidaId, solicitanteId: session.user.id, tipo });
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  revalidatePath(`/grupos/${input.grupoId}/partidas/${input.partidaId}`);
  revalidatePath(`/grupos/${input.grupoId}`);
  return { ok: true };
}
