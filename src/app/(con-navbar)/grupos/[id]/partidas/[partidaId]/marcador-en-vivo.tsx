"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { inicialesDeParticipante, type ParticipanteBasico } from "@/domain/participantes";
import { FosforosTally } from "@/components/fosforos-tally";
import { cargarResultadoDeManoAction, corregirPuntoAction } from "./actions";

const CORTE_MALAS_BUENAS = 15;
const PUNTOS_PARA_GANAR = 30;
const REINTENTOS_FLUSH = 2;
const BACKOFF_MS = [500, 1500];

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
  equipo1,
  equipo2,
}: {
  partidaId: string;
  grupoId: string;
  ventanaInactividadSegundos: number;
  equipo1: { miembros: ParticipanteBasico[]; puntosConfirmados: number };
  equipo2: { miembros: ParticipanteBasico[]; puntosConfirmados: number };
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
  const [, startTransition] = useTransition();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVueloRef = useRef(false);
  const yaRecuperoRef = useRef(false);
  const pendienteRef = useRef(pendiente);
  pendienteRef.current = pendiente;
  const confirmadoRef = useRef(confirmado);
  confirmadoRef.current = confirmado;

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

  const flush = useCallback(async () => {
    if (enVueloRef.current) return;
    const snapshot = pendienteRef.current;
    if (snapshot.equipo1 === 0 && snapshot.equipo2 === 0) return;

    enVueloRef.current = true;

    for (let intento = 0; ; intento += 1) {
      try {
        const resultado = await cargarResultadoDeManoAction({
          grupoId,
          partidaId,
          deltaEquipo1: snapshot.equipo1,
          deltaEquipo2: snapshot.equipo2,
        });

        if (!resultado.ok) {
          // Rechazo de dominio limpio (ej. la Partida ya se cerró en otra
          // pestaña) — no tiene sentido reintentar, y tampoco dejar este
          // pendiente guardado: reintentaría para siempre (cada tap nuevo,
          // cada reload) contra algo que nunca va a dejar de rechazarse.
          setError(resultado.message);
          actualizarPendiente(() => ({ equipo1: 0, equipo2: 0 }));
          enVueloRef.current = false;
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
        enVueloRef.current = false;

        // Toques que llegaron mientras este flush estaba en vuelo no se
        // pierden (se restó solo el snapshot de arriba) — mandarlos ya
        // mismo en vez de esperar un toque nuevo.
        if (quedaPendiente) {
          void flush();
        }
        return;
      } catch {
        if (intento < REINTENTOS_FLUSH) {
          await esperar(BACKOFF_MS[intento]);
          continue;
        }
        setError("No se pudo guardar la Mano. Volvé a tocar para reintentar.");
        enVueloRef.current = false;
        return;
      }
    }
  }, [grupoId, partidaId, actualizarPendiente]);

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
    debounceRef.current = setTimeout(() => {
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
      if (debounceRef.current) clearTimeout(debounceRef.current);
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
      actualizarPendiente((anterior) =>
        num === 1 ? { ...anterior, equipo1: anterior.equipo1 - 1 } : { ...anterior, equipo2: anterior.equipo2 - 1 },
      );
      reiniciarDebounce();
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

  return (
    <>
      <div className="flex min-h-0 flex-1 justify-around gap-4">
        <Marcador
          miembros={equipo1.miembros}
          puntos={confirmado.equipo1 + pendiente.equipo1}
          equipo={1}
          onMas={() => tocarMas(1)}
          onMenos={() => tocarMenos(1)}
        />
        <Marcador
          miembros={equipo2.miembros}
          puntos={confirmado.equipo2 + pendiente.equipo2}
          equipo={2}
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

function Marcador({
  miembros,
  puntos,
  equipo,
  onMas,
  onMenos,
}: {
  miembros: ParticipanteBasico[];
  puntos: number;
  equipo: 1 | 2;
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
        {miembros.map((miembro) => (
          <span
            key={miembro.participanteId}
            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${
              equipo === 1 ? "border-accent bg-accent-soft text-accent" : "border-accent2 bg-accent2-soft text-accent2"
            }`}
          >
            {inicialesDeParticipante(miembro)}
          </span>
        ))}
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
          className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-line bg-surface text-xl font-bold text-ink shadow-pop-sm"
        >
          −
        </button>
        <button
          type="button"
          onClick={onMas}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-xl font-bold text-white shadow-pop-accent-sm"
        >
          +
        </button>
      </div>
    </div>
  );
}
