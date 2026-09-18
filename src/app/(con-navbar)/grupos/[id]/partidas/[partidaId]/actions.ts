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
  reclamarAnotador,
  obtenerEstadoDeMarcador,
  type TipoDeBloque,
} from "@/domain/partidas";
import { esMiembroDeGrupo } from "@/domain/grupos";

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
  parejaActivaParticipanteId?: string;
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
      parejaActivaParticipanteId: input.parejaActivaParticipanteId,
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

  // Parejas de Pica-pica (ver ADR 0006) armadas por toque en el cliente —
  // mismo formato que crearPartidaAction (ver nueva/actions.ts).
  const picaPicaJugador1 = formData.getAll("picaPicaJugador1").map(String);
  const picaPicaJugador2 = formData.getAll("picaPicaJugador2").map(String);
  const picaPicaParejas = picaPicaJugador1.map((jugadorEquipo1Id, i) => ({
    jugadorEquipo1Id,
    jugadorEquipo2Id: picaPicaJugador2[i],
  }));

  let siguiente: Awaited<ReturnType<typeof crearSiguienteEquipo>>;
  try {
    siguiente = await crearSiguienteEquipo({
      partidaId,
      solicitanteId: session.user.id,
      equipoDesafiante,
      nuevoAnotadorParticipanteId,
      picaPicaParejas,
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

export type ResultadoReclamarAnotador = { ok: true } | { ok: false };

// "Sí" de la pregunta "¿Anotás vos?" (ticket #33, CONTEXT.md/Anotador) —
// args planos, se llama directo desde el componente cliente de la
// pregunta, no por un <form>. Sin message de error: perder la carrera
// contra otro de los 6 que reclamó un instante antes es un resultado
// esperado (ver reclamarAnotador en domain/partidas.ts), no una falla —
// el cliente cae a solo lectura sin avisar nada. revalidatePath solo hace
// falta si funcionó: si perdió la carrera, el estado del servidor no
// cambió por esta llamada.
export async function reclamarAnotadorAction(input: {
  grupoId: string;
  partidaId: string;
}): Promise<ResultadoReclamarAnotador> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Sin try/catch a propósito: reclamarAnotador solo devuelve {ok:false}
  // para el caso esperado (perdió la carrera) — lo demás (Partida
  // inexistente, no en_curso, alguien ajeno a los 6) tira una excepción
  // real porque no debería poder pasar desde esta pantalla (el botón solo
  // se muestra a quien corresponde). Dejarla propagarse en vez de
  // tragársela como un {ok:false} más mantiene visible un bug real si
  // alguna vez ocurre, en vez de disfrazarlo de carrera perdida.
  const resultado = await reclamarAnotador({ partidaId: input.partidaId, participanteId: session.user.id });

  if (resultado.ok) {
    revalidatePath(`/grupos/${input.grupoId}/partidas/${input.partidaId}`);
    revalidatePath(`/grupos/${input.grupoId}`);
  }
  return resultado;
}

export type ResultadoEstadoMarcador =
  | {
      ok: true;
      estado: "en_curso" | "finalizada" | "cancelada";
      equipo1Puntos: number;
      equipo2Puntos: number;
      tipoDeBloqueActual: TipoDeBloque;
      parejasYaJugadas: string[];
    }
  | { ok: false };

// Sondeo del marcador de solo lectura (ticket #34, ADR 0007) — se llama
// desde marcador-solo-lectura.tsx cada pocos segundos, nunca desde el
// tanteador del Anotador (ver ADR 0005: ese sigue sin ningún sondeo).
// Nunca redirige a /login ni lanza: un tick de sondeo sin sesión, sin
// membresía del Grupo, o contra una Partida que ya no existe, es
// simplemente { ok: false } — el cliente se queda con el último estado
// conocido (ver "si el sondeo falla momentáneamente" en el ticket), no es
// un error que cortar la sesión. La membresía se valida contra el grupoId
// real de la Partida (ver obtenerEstadoDeMarcador), nunca contra uno que
// mande el propio cliente — evitaría el chequeo mandando el grupoId de un
// Grupo propio junto al partidaId de una Partida ajena.
export async function obtenerEstadoDeMarcadorAction(partidaId: string): Promise<ResultadoEstadoMarcador> {
  const session = await auth();
  if (!session?.user) return { ok: false };

  const estado = await obtenerEstadoDeMarcador(partidaId);
  if (!estado) return { ok: false };

  if (!(await esMiembroDeGrupo(estado.grupoId, session.user.id))) {
    return { ok: false };
  }

  return {
    ok: true,
    estado: estado.estado,
    equipo1Puntos: estado.equipo1Puntos,
    equipo2Puntos: estado.equipo2Puntos,
    tipoDeBloqueActual: estado.tipoDeBloqueActual,
    parejasYaJugadas: estado.parejasYaJugadas,
  };
}
