"use client";

import { useEffect, useState } from "react";
import { nombreDeParticipante, type ParticipanteBasico } from "@/domain/participantes";

export type ParejaPicaPica = { jugadorEquipo1Id: string; jugadorEquipo2Id: string };

const PAREJAS_REQUERIDAS = 3;

// Armado de las 3 parejas fijas de Pica-pica (ver CONTEXT.md/Pica-pica, ADR
// 0006) por toque, estilo memotest: tocar a alguien sin pareja lo deja
// "seleccionado"; tocar después a alguien del otro Equipo confirma la
// pareja; tocar una pareja ya armada la deshace. Se resetea entero cada vez
// que cambia la composición de los Equipos — un Participante remapeado a
// otro Equipo (o sacado/agregado) podría dejar una pareja ya armada
// apuntando a alguien que ya no corresponde.
export function usePicaPicaParejas(equipo1: ParticipanteBasico[], equipo2: ParticipanteBasico[]) {
  const [parejas, setParejas] = useState<ParejaPicaPica[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const idsEquipo1 = new Set(equipo1.map((m) => m.participanteId));
  const claveEquipos =
    equipo1.map((m) => m.participanteId).sort().join() +
    "|" +
    equipo2.map((m) => m.participanteId).sort().join();

  useEffect(() => {
    setParejas([]);
    setSeleccionado(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveEquipos]);

  function tocar(participanteId: string) {
    const indiceExistente = parejas.findIndex(
      (p) => p.jugadorEquipo1Id === participanteId || p.jugadorEquipo2Id === participanteId,
    );
    if (indiceExistente !== -1) {
      setParejas((anterior) => anterior.filter((_, i) => i !== indiceExistente));
      return;
    }

    if (!seleccionado) {
      setSeleccionado(participanteId);
      return;
    }
    if (seleccionado === participanteId) {
      setSeleccionado(null);
      return;
    }

    const tocadoEsEquipo1 = idsEquipo1.has(participanteId);
    const seleccionadoEsEquipo1 = idsEquipo1.has(seleccionado);
    if (tocadoEsEquipo1 === seleccionadoEsEquipo1) {
      // Mismo Equipo que el ya seleccionado — no forma pareja válida (tiene
      // que ser 1 de cada lado), así que solo cambia la selección.
      setSeleccionado(participanteId);
      return;
    }

    const jugadorEquipo1Id = tocadoEsEquipo1 ? participanteId : seleccionado;
    const jugadorEquipo2Id = tocadoEsEquipo1 ? seleccionado : participanteId;
    setParejas((anterior) => [...anterior, { jugadorEquipo1Id, jugadorEquipo2Id }]);
    setSeleccionado(null);
  }

  return { parejas, seleccionado, tocar, completas: parejas.length === PAREJAS_REQUERIDAS };
}

// El armado se muestra en un modal (en vez de inline en la lista) para no
// depender de scrollear hasta abajo, sobre todo cuando la lista de
// candidatos crece — se abre solo cuando los dos Equipos quedan completos y
// se cierra si deja de estarlo (alguien reasignado a último momento no deja
// un modal abierto con parejas que ya no corresponden).
export function useModalDeParejas(equiposCompletos: boolean) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    setAbierto(equiposCompletos);
  }, [equiposCompletos]);

  return { abierto, abrir: () => setAbierto(true), cerrar: () => setAbierto(false) };
}

// Mismo color por posición de pareja (1/2/3) en los dos lados — le deja ver
// al Anotador, de un vistazo, cuál enfrenta a cuál sin tener que leer los
// nombres.
const COLORES_PAREJA = [
  "border-accent bg-accent text-white",
  "border-accent2 bg-accent2 text-white",
  "border-ink bg-ink text-white",
];

export function ArmadoDeParejasPicaPica({
  equipo1,
  equipo2,
  parejas,
  seleccionado,
  onTocar,
}: {
  equipo1: ParticipanteBasico[];
  equipo2: ParticipanteBasico[];
  parejas: ParejaPicaPica[];
  seleccionado: string | null;
  onTocar: (participanteId: string) => void;
}) {
  function indiceDePareja(participanteId: string) {
    return parejas.findIndex(
      (p) => p.jugadorEquipo1Id === participanteId || p.jugadorEquipo2Id === participanteId,
    );
  }

  function BotonParticipante({ miembro }: { miembro: ParticipanteBasico }) {
    const indice = indiceDePareja(miembro.participanteId);
    const emparejado = indice !== -1;
    const clase = emparejado
      ? COLORES_PAREJA[indice]
      : seleccionado === miembro.participanteId
        ? "border-accent bg-accent-soft text-accent ring-2 ring-accent"
        : "border-line bg-bg text-ink";

    return (
      <button
        type="button"
        onClick={() => onTocar(miembro.participanteId)}
        className={`rounded-2xl border-2 px-3 py-2 text-left text-sm font-bold transition-colors ${clase}`}
      >
        {nombreDeParticipante(miembro)}
        {emparejado && <span className="ml-1 text-xs opacity-80">Pareja {indice + 1}</span>}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border-2 border-line bg-surface p-3">
      <p className="text-sm font-bold text-ink">
        Armá las parejas de Pica-pica — tocá a alguien de cada lado para emparejarlos ({parejas.length} de 3
        parejas armadas)
      </p>
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          {equipo1.map((miembro) => (
            <BotonParticipante key={miembro.participanteId} miembro={miembro} />
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          {equipo2.map((miembro) => (
            <BotonParticipante key={miembro.participanteId} miembro={miembro} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Resumen + disparador para reabrir el modal una vez que ya se cerró (o
// para volver a editar el armado sin tener que esperar a que se abra solo).
export function ResumenDeParejasPicaPica({
  parejas,
  onAbrir,
}: {
  parejas: ParejaPicaPica[];
  onAbrir: () => void;
}) {
  const completas = parejas.length === PAREJAS_REQUERIDAS;

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex items-center justify-between rounded-2xl border-2 border-line bg-surface p-3 text-sm font-bold text-ink"
    >
      <span>Parejas de Pica-pica</span>
      <span className={completas ? "text-accent2" : "text-danger"}>
        {parejas.length} de 3 armadas — Editar
      </span>
    </button>
  );
}

export function ModalDeParejasPicaPica({
  abierto,
  onCerrar,
  equipo1,
  equipo2,
  parejas,
  seleccionado,
  onTocar,
  textoConfirmar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  equipo1: ParticipanteBasico[];
  equipo2: ParticipanteBasico[];
  parejas: ParejaPicaPica[];
  seleccionado: string | null;
  onTocar: (participanteId: string) => void;
  // Texto del botón de confirmar una vez armadas las 3 parejas — "Crear
  // Partida"/"Confirmar Siguiente equipo" según el formulario. Ese mismo
  // toque cierra el modal Y envía el formulario en un solo paso (evita el
  // scroll + toque aparte al botón de submit de más abajo).
  textoConfirmar: string;
}) {
  if (!abierto) return null;

  const completas = parejas.length === PAREJAS_REQUERIDAS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onCerrar}
    >
      <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <ArmadoDeParejasPicaPica
          equipo1={equipo1}
          equipo2={equipo2}
          parejas={parejas}
          seleccionado={seleccionado}
          onTocar={onTocar}
        />
        <button
          type={completas ? "submit" : "button"}
          onClick={onCerrar}
          className="mt-3 w-full rounded-2xl bg-accent p-3 font-display font-bold text-white shadow-pop-accent"
        >
          {completas ? textoConfirmar : "Listo"}
        </button>
      </div>
    </div>
  );
}

// Las parejas armadas por toque no son inputs nativos — viajan como pares de
// inputs ocultos (mismo índice en los dos nombres) para que la Server
// Action las lea con formData.getAll, igual que ya hace equipoDesafiante.
export function InputsOcultosDeParejas({ parejas }: { parejas: ParejaPicaPica[] }) {
  return (
    <>
      {parejas.map((pareja, indice) => (
        <span key={indice}>
          <input type="hidden" name="picaPicaJugador1" value={pareja.jugadorEquipo1Id} />
          <input type="hidden" name="picaPicaJugador2" value={pareja.jugadorEquipo2Id} />
        </span>
      ))}
    </>
  );
}
