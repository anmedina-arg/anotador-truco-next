"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { inicialesDeParticipante, type ParticipanteBasico } from "@/domain/participantes";
import type { ParejaPicaPica, TipoDeBloque } from "@/domain/partidas";
import { FosforosTally } from "@/components/fosforos-tally";
import {
  cargarResultadoDeManoAction,
  corregirPuntoAction,
  corregirBloqueAction,
  type ResultadoCorregirBloque,
} from "./actions";

const CORTE_MALAS_BUENAS = 15;
const PUNTOS_PARA_GANAR = 30;
const REINTENTOS_FLUSH = 2;
const BACKOFF_MS = [500, 1500];

// Bloque (ver CONTEXT.md): tipo de la Mano que corresponde jugar a
// continuación, calculado server-side en cada render — sin timer ni
// polling en el cliente (ver ticket #20). El texto del badge se queda acá
// (no es optimista, solo cambia cuando el prop se refresca), pero vive en
// este componente para poder mostrar el indicador circular del debounce
// justo al lado, con el mismo estado que ya maneja el debounce.
const NOMBRE_DE_BLOQUE: Record<TipoDeBloque, string> = {
  ronda: "Ronda",
  pica_pica: "Pica-pica",
};

// Mismo rótulo/color que la selección de equipos en Nueva Partida — ver
// formulario.tsx: Equipo 1 siempre es "Nosotros" (accent), Equipo 2 siempre
// es "Ellos" (accent2).
const ROL_DE_EQUIPO: Record<1 | 2, { texto: string; colorClase: string }> = {
  1: { texto: "Nosotros", colorClase: "border-accent bg-accent text-white" },
  2: { texto: "Ellos", colorClase: "border-accent2 bg-accent2 text-white" },
};

type Pendiente = { equipo1: number; equipo2: number };
type Puntaje = { equipo1: number; equipo2: number };

function claveStorage(partidaId: string) {
  return `truco:partida:${partidaId}:mano-pendiente`;
}

function leerPendienteGuardado(partidaId: string): Pendiente {
  if (typeof window === "undefined") return { equipo1: 0, equipo2: 0 };
  try {
    const crudo = window.sessionStorage.getItem(claveStorage(partidaId));
    if (!crudo) return { equipo1: 0, equipo2: 0 };
    const parseado = JSON.parse(crudo) as Partial<Pendiente>;
    return {
      equipo1: Number.isFinite(parseado.equipo1) ? (parseado.equipo1 as number) : 0,
      equipo2: Number.isFinite(parseado.equipo2) ? (parseado.equipo2 as number) : 0,
    };
  } catch {
    return { equipo1: 0, equipo2: 0 };
  }
}

function guardarPendiente(partidaId: string, pendiente: Pendiente) {
  if (typeof window === "undefined") return;
  try {
    if (pendiente.equipo1 === 0 && pendiente.equipo2 === 0) {
      window.sessionStorage.removeItem(claveStorage(partidaId));
    } else {
      window.sessionStorage.setItem(claveStorage(partidaId), JSON.stringify(pendiente));
    }
  } catch {
    // sessionStorage puede fallar (modo privado, cuota) — el debounce sigue
    // funcionando igual en memoria, solo se pierde la recuperación tras un
    // reload (ver ADR 0005, riesgo aceptado).
  }
}

function esperar(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// Marcador en vivo con el debounce que decide cuándo termina una Mano (ver
// CONTEXT.md/Mano, ADR 0005). Un solo componente por encima de los dos
// Equipos porque el debounce es compartido: un toque en cualquiera de los
// dos reinicia el mismo timer (una Mano real puede repartir puntos entre
// los dos, Envido a uno y Truco al otro). Solo se monta mientras la
// Partida está en_curso (ver page.tsx) — no necesita su propio flag de
// "activo".
export function MarcadorEnVivo({
  partidaId,
  grupoId,
  ventanaInactividadSegundos,
  tipoDeBloqueActual,
  equipo1,
  equipo2,
  parejasPicaPica,
  parejasYaJugadasInicial,
}: {
  partidaId: string;
  grupoId: string;
  ventanaInactividadSegundos: number;
  tipoDeBloqueActual: TipoDeBloque;
  equipo1: { miembros: ParticipanteBasico[]; puntosConfirmados: number };
  equipo2: { miembros: ParticipanteBasico[]; puntosConfirmados: number };
  parejasPicaPica: ParejaPicaPica[];
  // jugadorEquipo1Id de cada pareja que ya jugó su Mano dentro del Bloque
  // de Pica-pica todavía abierto (ver domain/partidas.ts,
  // obtenerParejasYaJugadasEnBloqueActual) — solo se usa para inicializar
  // el estado de abajo, nunca se vuelve a leer de este prop después del
  // primer render (mismo criterio que `confirmado`, ver ese comentario):
  // de ahí en más, este mismo componente ya lleva la cuenta sola.
  parejasYaJugadasInicial: string[];
}) {
  // Arranca en {0,0} tanto en el render server-side como en el primer
  // render del cliente (nunca lee sessionStorage acá): si el inicializador
  // leyera sessionStorage acá, el cliente podría arrancar con un valor
  // distinto al que ya mandó el servidor en el HTML, y React tira un error
  // de hidratación. La recuperación de sessionStorage pasa a un useEffect
  // (ver más abajo), que solo corre en el cliente, después de hidratar.
  const [pendiente, setPendiente] = useState<Pendiente>({ equipo1: 0, equipo2: 0 });
  // Puntaje confirmado por el servidor. Arranca de los props (seguro para
  // hidratar: server y cliente ven los mismos props en el primer render),
  // pero DESPUÉS del mount se actualiza solo con lo que devuelve la propia
  // Server Action al confirmar un flush/corrección — nunca desde los props.
  // Si dependiera de los props, hay una ventana real entre que el estado
  // local de "pendiente" ya se resetea (flush confirmado) y que
  // revalidatePath termina de refrescar el Server Component: en esa
  // ventana el puntaje mostrado vuelve un instante al valor viejo
  // (confirmado-viejo + pendiente-ya-en-0) antes de saltar al nuevo —
  // el parpadeo que se veía en la app real.
  const [confirmado, setConfirmado] = useState<Puntaje>({
    equipo1: equipo1.puntosConfirmados,
    equipo2: equipo2.puntosConfirmados,
  });
  const [error, setError] = useState<string | null>(null);
  // Indicador circular del debounce, puramente visual: se activa mientras
  // el timer está corriendo, se desactiva apenas se cumple la ventana (no
  // espera a que la Mano termine de confirmarse contra el servidor — ver
  // IndicadorDebounce). cicloDebounce cambia en cada reinicio del timer
  // para forzar que la animación CSS arranque de cero (vía key).
  const [debounceActivo, setDebounceActivo] = useState(false);
  const [cicloDebounce, setCicloDebounce] = useState(0);
  // Mientras una corrección de Bloque está en curso (desde que se pide
  // hasta que el servidor responde), los botones "+"/"-" de los dos
  // Equipos se deshabilitan (ver Marcador más abajo) — si no, un toque que
  // entra justo en esa ventana arranca una Mano nueva que la propia
  // corrección no espera, y termina flusheando contra el Bloque ya
  // corregido en vez del que tenía cuando el Anotador la empezó a anotar
  // (la misma clase de bug que el flush-before-correct de abajo previene
  // para toques que ya estaban pendientes *antes* de pedir la corrección).
  const [corrigiendoBloque, setCorrigiendoBloque] = useState(false);
  // Pareja activa de Pica-pica (ver ADR 0006, ticket #29/#30): el Anotador
  // la elige tocando a cualquiera de los 2 integrantes entre los avatares
  // que ya se muestran arriba de cada Equipo — el orden entre Bloques de
  // Pica-pica no es fijo, así que no hay forma de que la app la adivine
  // sola. Se resetea a null apenas se confirma la Mano contra el servidor
  // (ver flush) o se corrige el Bloque a mano (ver corregirBloque). Solo
  // importa mientras tipoDeBloqueActual es "pica_pica" — en Ronda queda sin
  // usar.
  const [parejaActiva, setParejaActiva] = useState<ParejaPicaPica | null>(null);
  // Cada pareja juega exactamente 1 de las 3 Manos de un Bloque de
  // Pica-pica (ver CONTEXT.md/Pica-pica) — una vez que ya jugó la suya en
  // este Bloque, no tiene que poder volver a elegirse hasta el próximo
  // Bloque de Pica-pica. Se identifica cada pareja por jugadorEquipo1Id
  // (único entre las 3). Arranca con lo que ya está persistido server-side
  // (parejasYaJugadasInicial) para no perderlo en un reload a mitad de
  // Bloque; de ahí en más este componente la lleva sola, sumando cada Mano
  // que confirma (ver flush) y vaciándola al salir de Pica-pica (ver el
  // useEffect más abajo) o al corregir el Bloque a mano (ver corregirBloque).
  const [parejasYaJugadas, setParejasYaJugadas] = useState<Set<string>>(
    () => new Set(parejasYaJugadasInicial),
  );
  const [, startTransition] = useTransition();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVueloRef = useRef(false);
  // Promesa del flush actualmente en vuelo, para que un llamador que
  // necesita la garantía real de "ya no queda nada por mandar" (ver
  // corregirBloque más abajo) pueda esperarla en vez de que
  // flush() le devuelva un no-op inmediato mientras el anterior todavía
  // está en curso.
  const flushEnVueloPromiseRef = useRef<Promise<void> | null>(null);
  const yaRecuperoRef = useRef(false);
  const pendienteRef = useRef(pendiente);
  pendienteRef.current = pendiente;
  const confirmadoRef = useRef(confirmado);
  confirmadoRef.current = confirmado;
  // El flush manda la pareja activa vigente en el momento en que se manda
  // (no la de cuando arrancó el toque) — ver ticket #30.
  const parejaActivaRef = useRef(parejaActiva);
  parejaActivaRef.current = parejaActiva;

  const actualizarPendiente = useCallback(
    (actualizar: (anterior: Pendiente) => Pendiente) => {
      setPendiente((anterior) => {
        const nuevo = actualizar(anterior);
        guardarPendiente(partidaId, nuevo);
        return nuevo;
      });
    },
    [partidaId],
  );

  const flush = useCallback(async (): Promise<void> => {
    if (enVueloRef.current) {
      // Ya hay un flush en curso — esperarlo de verdad (no no-opear) y
      // reintentar después: puede haber quedado algo pendiente nuevo
      // mientras esperábamos, o el llamador (ver corregirBloque más abajo)
      // necesita la garantía real de que ya no queda nada por mandar antes
      // de seguir.
      await flushEnVueloPromiseRef.current;
      return flush();
    }

    const snapshot = pendienteRef.current;
    if (snapshot.equipo1 === 0 && snapshot.equipo2 === 0) return;

    enVueloRef.current = true;
    let liberar = () => {};
    flushEnVueloPromiseRef.current = new Promise<void>((resolve) => {
      liberar = resolve;
    });

    try {
      for (let intento = 0; ; intento += 1) {
        try {
          const resultado = await cargarResultadoDeManoAction({
            grupoId,
            partidaId,
            deltaEquipo1: snapshot.equipo1,
            deltaEquipo2: snapshot.equipo2,
            parejaActivaParticipanteId: parejaActivaRef.current?.jugadorEquipo1Id,
          });

          if (!resultado.ok) {
            // Rechazo de dominio limpio (ej. la Partida ya se cerró en otra
            // pestaña) — no tiene sentido reintentar, y tampoco dejar este
            // pendiente guardado: reintentaría para siempre (cada tap nuevo,
            // cada reload) contra algo que nunca va a dejar de rechazarse.
            setError(resultado.message);
            actualizarPendiente(() => ({ equipo1: 0, equipo2: 0 }));
            return;
          }

          setError(null);
          // Puntaje confirmado directo de la respuesta — no esperar al
          // refresco del Server Component (ver comentario del useState de
          // `confirmado` arriba).
          setConfirmado({ equipo1: resultado.equipo1Puntos, equipo2: resultado.equipo2Puntos });
          // `pendienteRef.current` recién se pone al día en el próximo
          // render — leerlo acá, justo después de `actualizarPendiente`,
          // daría un valor viejo. El propio callback de `setState` sí
          // recibe el valor real y actual, así que de ahí sacamos si queda
          // algo pendiente por mandar.
          let quedaPendiente = false;
          actualizarPendiente((anterior) => {
            const nuevo = {
              equipo1: anterior.equipo1 - snapshot.equipo1,
              equipo2: anterior.equipo2 - snapshot.equipo2,
            };
            quedaPendiente = nuevo.equipo1 !== 0 || nuevo.equipo2 !== 0;
            return nuevo;
          });

          // Toques que llegaron mientras este flush estaba en vuelo no se
          // pierden (se restó solo el snapshot de arriba) — mandarlos ya
          // mismo en vez de esperar un toque nuevo. Sin await: no hace
          // falta que ESTE flush espere al siguiente, ya libera su lugar
          // en el finally de abajo.
          if (quedaPendiente) {
            void flush();
          } else {
            // La Mano quedó del todo confirmada (no una recarga parcial de
            // taps que llegaron mientras este flush estaba en vuelo, ver
            // arriba) — recién ahí tiene sentido pedir de nuevo la pareja
            // activa para la Mano siguiente (ver ticket #30), y recién ahí
            // esa pareja pasa a estar jugada dentro de este Bloque (no
            // puede volver a elegirse hasta el próximo Bloque de Pica-pica).
            const parejaRecienJugada = parejaActivaRef.current;
            setParejaActiva(null);
            if (parejaRecienJugada) {
              setParejasYaJugadas((anterior) => new Set(anterior).add(parejaRecienJugada.jugadorEquipo1Id));
            }
          }
          return;
        } catch {
          if (intento < REINTENTOS_FLUSH) {
            await esperar(BACKOFF_MS[intento]);
            continue;
          }
          setError("No se pudo guardar la Mano. Volvé a tocar para reintentar.");
          return;
        }
      }
    } finally {
      enVueloRef.current = false;
      liberar();
    }
  }, [grupoId, partidaId, actualizarPendiente]);

  const cortarDebounce = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setDebounceActivo(false);
  }, []);

  // Orquesta la corrección manual de Bloque completa (ver CorregirBloque
  // más abajo): deshabilita los botones de puntaje del resto del
  // componente por toda la duración de la operación (no solo mientras se
  // resuelve el flush previo), corta cualquier debounce que hubiera
  // quedado corriendo (el flush de abajo lo asienta igual, pero sin esto
  // el indicador circular se queda pintando un ciclo que ya no tiene nada
  // pendiente detrás) y recién ahí flushea y pide la corrección.
  const corregirBloque = useCallback(
    async (tipo: TipoDeBloque): Promise<ResultadoCorregirBloque> => {
      setCorrigiendoBloque(true);
      try {
        cortarDebounce();
        await flush();
        // El flush de arriba ya manda cualquier toque pendiente con la
        // pareja activa que tenía ANTES de esta corrección (la que
        // corresponde a esa Mano) — recién ahora, con eso ya resuelto, se
        // limpia: si no había nada pendiente, flush() no la reseteó sola
        // (ver ticket #30), y de cualquier forma el Bloque está a punto de
        // cambiar de tipo. Se vacían también las parejas ya jugadas — una
        // corrección manual arranca el Bloque de cero (ver ticket #21),
        // incluso si el tipo corregido es el mismo que ya estaba vigente.
        setParejaActiva(null);
        setParejasYaJugadas(new Set());
        return await corregirBloqueAction({ grupoId, partidaId, tipo });
      } finally {
        setCorrigiendoBloque(false);
      }
    },
    [flush, grupoId, partidaId, cortarDebounce],
  );

  // Un Bloque de Pica-pica nuevo siempre llega después de estar en Ronda
  // (la Fase alternada nunca pasa de Pica-pica a Pica-pica directo, ver
  // calcularBloqueSiguiente) — así que alcanza con vaciar acá cada vez que
  // el tipo vigente NO es Pica-pica: para cuando vuelva a serlo, ya va a
  // estar vacío. Ronda no usa este estado para nada.
  useEffect(() => {
    if (tipoDeBloqueActual !== "pica_pica") {
      setParejasYaJugadas(new Set());
    }
  }, [tipoDeBloqueActual]);

  // Al montar: recién acá se lee sessionStorage (solo corre en el cliente,
  // después de hidratar — ver el comentario del useState de arriba). Si
  // quedó algo pendiente de una recarga anterior, se aplica y se manda ya
  // mismo, sin esperar el debounce de nuevo (ver ADR 0005).
  useEffect(() => {
    if (yaRecuperoRef.current) return;
    yaRecuperoRef.current = true;
    const guardado = leerPendienteGuardado(partidaId);
    if (guardado.equipo1 !== 0 || guardado.equipo2 !== 0) {
      setPendiente(guardado);
      pendienteRef.current = guardado;
      startTransition(() => {
        void flush();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reiniciarDebounce = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setDebounceActivo(true);
    setCicloDebounce((n) => n + 1);
    debounceRef.current = setTimeout(() => {
      // El indicador se apaga apenas se cumple la ventana — no espera a
      // que la Mano termine de confirmarse contra el servidor, solo
      // representa el tiempo de espera en sí.
      setDebounceActivo(false);
      startTransition(() => {
        void flush();
      });
    }, ventanaInactividadSegundos * 1000);
  }, [ventanaInactividadSegundos, flush]);

  const tocarMas = (num: 1 | 2) => {
    setError(null);
    actualizarPendiente((anterior) =>
      num === 1 ? { ...anterior, equipo1: anterior.equipo1 + 1 } : { ...anterior, equipo2: anterior.equipo2 + 1 },
    );

    const puntosConfirmados = num === 1 ? confirmadoRef.current.equipo1 : confirmadoRef.current.equipo2;
    const pendienteEquipo = num === 1 ? pendienteRef.current.equipo1 : pendienteRef.current.equipo2;
    if (puntosConfirmados + pendienteEquipo + 1 >= PUNTOS_PARA_GANAR) {
      // Llegar a 30 corta el debounce y flushea de inmediato — no tiene
      // sentido esperar una ventana de corrección para confirmar que la
      // Partida ya terminó (ver ADR 0005).
      cortarDebounce();
      startTransition(() => {
        void flush();
      });
      return;
    }

    reiniciarDebounce();
  };

  const tocarMenos = (num: 1 | 2) => {
    const pendienteEquipo = num === 1 ? pendienteRef.current.equipo1 : pendienteRef.current.equipo2;

    if (pendienteEquipo > 0) {
      // Cancela un toque de "+" todavía sin mandar — nunca toca el
      // servidor, y sigue siendo parte de la misma Mano en curso.
      setError(null);
      let quedaAlgoPendiente = false;
      actualizarPendiente((anterior) => {
        const nuevo =
          num === 1 ? { ...anterior, equipo1: anterior.equipo1 - 1 } : { ...anterior, equipo2: anterior.equipo2 - 1 };
        quedaAlgoPendiente = nuevo.equipo1 !== 0 || nuevo.equipo2 !== 0;
        return nuevo;
      });
      if (quedaAlgoPendiente) {
        reiniciarDebounce();
      } else {
        // Se canceló el último toque pendiente — no queda nada que
        // flushear, no tiene sentido seguir esperando.
        cortarDebounce();
      }
      return;
    }

    // Ya no hay nada pendiente sin mandar para este Equipo: es una
    // corrección de un punto ya confirmado (ver CONTEXT.md/Mano) — acción
    // inmediata, sin debounce, nunca toca el Bloque.
    startTransition(() => {
      void (async () => {
        const resultado = await corregirPuntoAction({ grupoId, partidaId, equipo: num });
        if (resultado.ok) {
          setConfirmado({ equipo1: resultado.equipo1Puntos, equipo2: resultado.equipo2Puntos });
        }
      })();
    });
  };

  const esPicaPica = tipoDeBloqueActual === "pica_pica";

  // Si ya jugaron 2 de las 3 parejas en este Bloque, la que queda es la
  // única posible para la Mano que sigue — se elige sola, sin depender de
  // un toque más del Anotador (se ahorra ese toque). No hace nada mientras
  // ya hay una pareja activa (no hay que pisarla) ni si todavía quedan 2 o
  // más disponibles (ahí sí hay algo para elegir).
  useEffect(() => {
    if (!esPicaPica || parejaActiva) return;
    const disponibles = parejasPicaPica.filter((p) => !parejasYaJugadas.has(p.jugadorEquipo1Id));
    if (disponibles.length === 1) {
      setParejaActiva(disponibles[0]);
    }
  }, [esPicaPica, parejaActiva, parejasPicaPica, parejasYaJugadas]);

  // Elegir la pareja activa tocando los avatares (ver ADR 0006, ticket
  // #30): tocar a un integrante de la pareja ya elegida la deselecciona;
  // tocar a un integrante de otra pareja cambia la selección. Solo importa
  // durante Pica-pica — en Ronda los avatares ni siquiera son tocables (ver
  // Marcador más abajo).
  const tocarAvatar = useCallback(
    (participanteId: string) => {
      if (
        parejaActiva &&
        (parejaActiva.jugadorEquipo1Id === participanteId || parejaActiva.jugadorEquipo2Id === participanteId)
      ) {
        setParejaActiva(null);
        return;
      }
      const pareja = parejasPicaPica.find(
        (p) => p.jugadorEquipo1Id === participanteId || p.jugadorEquipo2Id === participanteId,
      );
      // Ya jugó su Mano en este Bloque (ver Marcador: el avatar queda
      // deshabilitado) — no hay nada que elegir hasta el próximo Bloque de
      // Pica-pica.
      if (pareja && parejasYaJugadas.has(pareja.jugadorEquipo1Id)) {
        return;
      }
      setParejaActiva(pareja ?? null);
    },
    [parejaActiva, parejasPicaPica, parejasYaJugadas],
  );

  // Todos los avatares se oscurecen salvo los 2 de la pareja activa —
  // incluida la primera Mano del Bloque, antes de elegir nada (ver
  // Marcador: ahí no hay ningún id en idsActivos todavía). Los de una
  // pareja que ya jugó su Mano en este Bloque quedan además deshabilitados
  // y tachados (idsYaJugados).
  const idsActivos = useMemo(
    () => (esPicaPica && parejaActiva ? new Set([parejaActiva.jugadorEquipo1Id, parejaActiva.jugadorEquipo2Id]) : new Set<string>()),
    [esPicaPica, parejaActiva],
  );
  const idsYaJugados = useMemo(() => {
    if (!esPicaPica) return new Set<string>();
    const ids = new Set<string>();
    for (const pareja of parejasPicaPica) {
      if (parejasYaJugadas.has(pareja.jugadorEquipo1Id)) {
        ids.add(pareja.jugadorEquipo1Id);
        ids.add(pareja.jugadorEquipo2Id);
      }
    }
    return ids;
  }, [esPicaPica, parejasPicaPica, parejasYaJugadas]);

  const colorBadge = tipoDeBloqueActual === "pica_pica" ? "text-accent2" : "text-accent";

  return (
    <>
      <p className="flex shrink-0 items-center justify-center gap-2 text-center text-sm font-display font-bold text-ink">
        <span>
          Mano actual: <span className={colorBadge}>{NOMBRE_DE_BLOQUE[tipoDeBloqueActual]}</span>
        </span>
        {debounceActivo && (
          <IndicadorDebounce cicloId={cicloDebounce} segundos={ventanaInactividadSegundos} claseColor={colorBadge} />
        )}
      </p>

      <CorregirBloque onElegir={corregirBloque} />

      <div className="flex min-h-0 flex-1 justify-around gap-4">
        <Marcador
          miembros={equipo1.miembros}
          puntos={confirmado.equipo1 + pendiente.equipo1}
          equipo={1}
          deshabilitado={corrigiendoBloque || (esPicaPica && !parejaActiva)}
          tocable={esPicaPica}
          idsActivos={idsActivos}
          idsYaJugados={idsYaJugados}
          onTocarAvatar={tocarAvatar}
          onMas={() => tocarMas(1)}
          onMenos={() => tocarMenos(1)}
        />
        <Marcador
          miembros={equipo2.miembros}
          puntos={confirmado.equipo2 + pendiente.equipo2}
          equipo={2}
          deshabilitado={corrigiendoBloque || (esPicaPica && !parejaActiva)}
          tocable={esPicaPica}
          idsActivos={idsActivos}
          idsYaJugados={idsYaJugados}
          onTocarAvatar={tocarAvatar}
          onMas={() => tocarMas(2)}
          onMenos={() => tocarMenos(2)}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="shrink-0 rounded-2xl border-2 border-danger-border bg-danger-soft p-3 text-center text-sm font-bold text-danger"
        >
          {error}
        </p>
      )}
    </>
  );
}

// Corrección manual del Bloque (ver CONTEXT.md/Bloque, ticket #21). Toda
// esta pantalla ya es exclusiva del Anotador (ver page.tsx), así que no
// hace falta ningún chequeo de visibilidad extra acá.
//
// No usa <form action={...}> con useActionState (a diferencia de
// EditarEstadisticas) porque necesita coordinarse con el debounce: si hay
// toques todavía sin mandar (ver flush en MarcadorEnVivo) cuando se pide
// la corrección, hay que mandarlos primero — si no, esa Mano pendiente se
// termina cargando contra el Bloque *nuevo* (ya corregido) en vez del que
// tenía cuando el Anotador la empezó a anotar. Toda esa orquestación (flush
// previo + deshabilitar los botones de puntaje mientras dura) vive en
// `onElegir` (ver corregirBloque en MarcadorEnVivo) — este componente solo
// se ocupa de la UI y de su propio estado de pendiente/error.
function CorregirBloque({ onElegir }: { onElegir: (tipo: TipoDeBloque) => Promise<ResultadoCorregirBloque> }) {
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const corregir = async (tipo: TipoDeBloque) => {
    setError(null);
    setPendiente(true);
    try {
      const resultado = await onElegir(tipo);
      if (!resultado.ok) {
        setError(resultado.message);
      }
    } catch {
      // onElegir puede rechazar (no solo devolver {ok:false}) si la propia
      // request de red falla — sin este catch, este botón quedaba
      // deshabilitado para siempre (setPendiente(false) nunca corría) y la
      // promesa rechazada quedaba sin manejar.
      setError("No se pudo aplicar la corrección. Volvé a intentar.");
    } finally {
      setPendiente(false);
    }
  };

  return (
    <details className="shrink-0">
      <summary className="w-fit cursor-pointer list-none text-xs font-bold text-accent hover:text-accent-dark">
        Corregir Mano actual
      </summary>
      <div className="mt-2 flex flex-col gap-2 rounded-2xl border-2 border-line bg-surface p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void corregir("ronda")}
            disabled={pendiente}
            className="flex-1 rounded-xl border-2 border-line bg-bg p-2 text-xs font-display font-bold text-ink disabled:opacity-50"
          >
            Ronda
          </button>
          <button
            type="button"
            onClick={() => void corregir("pica_pica")}
            disabled={pendiente}
            className="flex-1 rounded-xl border-2 border-line bg-bg p-2 text-xs font-display font-bold text-ink disabled:opacity-50"
          >
            Pica-pica
          </button>
        </div>
        {error && <p className="text-xs font-bold text-danger">{error}</p>}
      </div>
    </details>
  );
}

// Anillo circular que se va pintando a lo largo de la ventana de
// inactividad del Grupo — puramente decorativo, no decide nada por su
// cuenta (el debounce real vive en reiniciarDebounce/flush). `cicloId`
// como key fuerza que la animación CSS (ver globals.css) arranque de cero
// cada vez que el debounce se reinicia, en vez de continuar desde donde
// venía.
function IndicadorDebounce({
  segundos,
  cicloId,
  claseColor,
}: {
  segundos: number;
  cicloId: number;
  claseColor: string;
}) {
  return (
    <svg key={cicloId} width="14" height="14" viewBox="0 0 20 20" className={`shrink-0 ${claseColor}`}>
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <circle
        cx="10"
        cy="10"
        r="8"
        pathLength={100}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        style={{
          strokeDasharray: 100,
          strokeDashoffset: 100,
          transform: "rotate(-90deg)",
          transformOrigin: "50% 50%",
          animation: `truco-pintar-debounce ${segundos}s linear forwards`,
        }}
      />
    </svg>
  );
}

function Marcador({
  miembros,
  puntos,
  equipo,
  deshabilitado,
  tocable,
  idsActivos,
  idsYaJugados,
  onTocarAvatar,
  onMas,
  onMenos,
}: {
  miembros: ParticipanteBasico[];
  puntos: number;
  equipo: 1 | 2;
  deshabilitado?: boolean;
  tocable: boolean;
  idsActivos: Set<string>;
  idsYaJugados: Set<string>;
  onTocarAvatar: (participanteId: string) => void;
  onMas: () => void;
  onMenos: () => void;
}) {
  const malasOBuenas = puntos > CORTE_MALAS_BUENAS ? "buenas" : "malas";
  const esBuenas = malasOBuenas === "buenas";
  const puntosDeLaFase = esBuenas ? puntos - CORTE_MALAS_BUENAS : puntos;
  const rol = ROL_DE_EQUIPO[equipo];

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-2 rounded-2xl border-2 border-line bg-surface p-4 shadow-pop">
      <span
        className={`flex h-9 min-w-[4.5rem] shrink-0 items-center justify-center rounded-full border-2 px-3 font-bold ${rol.colorClase}`}
      >
        {rol.texto}
      </span>
      <div className="flex shrink-0 flex-wrap justify-center gap-1">
        {miembros.map((miembro) => {
          if (!tocable) {
            // Ronda: los 6 siempre resaltados en su estilo de siempre —
            // nadie se oscurece, no hay pareja que elegir (ver
            // CONTEXT.md/Ronda).
            const claseRonda = `flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${
              equipo === 1 ? "border-accent bg-accent-soft text-accent" : "border-accent2 bg-accent2-soft text-accent2"
            }`;
            return (
              <span key={miembro.participanteId} className={claseRonda}>
                {inicialesDeParticipante(miembro)}
              </span>
            );
          }

          const yaJugada = idsYaJugados.has(miembro.participanteId);
          const activo = idsActivos.has(miembro.participanteId);

          // Pica-pica (ver ticket #30, corrección de UI): por default (ni
          // bien empieza el Bloque, antes de elegir nada) los 6 quedan
          // oscurecidos por igual — recién la pareja elegida se resalta.
          // La que ya jugó su Mano en este Bloque queda además
          // deshabilitada y tachada, para que sea explícito que no se
          // puede volver a elegir hasta el próximo Bloque de Pica-pica.
          if (yaJugada) {
            return (
              <button
                key={miembro.participanteId}
                type="button"
                disabled
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-line bg-bg text-xs font-bold text-muted line-through opacity-60"
              >
                {inicialesDeParticipante(miembro)}
              </button>
            );
          }

          const claseAvatar = `flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-opacity ${
            equipo === 1 ? "border-accent bg-accent-soft text-accent" : "border-accent2 bg-accent2-soft text-accent2"
          } ${activo ? "" : "opacity-30"}`;

          return (
            <button
              key={miembro.participanteId}
              type="button"
              onClick={() => onTocarAvatar(miembro.participanteId)}
              className={claseAvatar}
            >
              {inicialesDeParticipante(miembro)}
            </button>
          );
        })}
      </div>
      <p
        className={`shrink-0 rounded-full px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ${
          esBuenas ? "bg-accent2" : "bg-muted"
        }`}
      >
        {malasOBuenas}
      </p>
      <p className={`my-1 shrink-0 font-display text-5xl font-extrabold ${esBuenas ? "text-accent" : "text-ink"}`}>
        {puntos}
      </p>
      <div className="flex min-h-0 flex-1 flex-col items-center">
        <FosforosTally puntos={puntosDeLaFase} colorClase={esBuenas ? "bg-accent2" : "bg-ink"} />
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onMenos}
          disabled={deshabilitado}
          className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-line bg-surface text-xl font-bold text-ink shadow-pop-sm disabled:opacity-50"
        >
          −
        </button>
        <button
          type="button"
          onClick={onMas}
          disabled={deshabilitado}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-xl font-bold text-white shadow-pop-accent-sm disabled:opacity-50"
        >
          +
        </button>
      </div>
    </div>
  );
}
