import { inicialesDeParticipante, type ParticipanteBasico } from "@/domain/participantes";
import type { TipoDeBloque } from "@/domain/partidas";
import { FosforosTally } from "@/components/fosforos-tally";

// Compartido con MarcadorFinal (Partida finalizada/cancelada, ver page.tsx)
// para que el corte de malas/buenas no pueda divergir entre pantallas.
export const CORTE_MALAS_BUENAS = 15;

// Mismo rótulo/color en toda la app: Equipo 1 siempre es "Nosotros"
// (accent), Equipo 2 siempre es "Ellos" (accent2) — ver selección de
// equipos en Nueva Partida (formulario.tsx).
export const ROL_DE_EQUIPO: Record<1 | 2, { texto: string; colorClase: string }> = {
  1: { texto: "Nosotros", colorClase: "border-accent bg-accent text-white" },
  2: { texto: "Ellos", colorClase: "border-accent2 bg-accent2 text-white" },
};

// Ver CONTEXT.md/Bloque — nombre a mostrar del Bloque vigente, compartido
// por el badge "Mano actual" del marcador editable y del de solo lectura.
export const NOMBRE_DE_BLOQUE: Record<TipoDeBloque, string> = {
  ronda: "Ronda",
  pica_pica: "Pica-pica",
};

// Panel de un Equipo del marcador de una Partida en_curso: fósforos,
// puntaje, avatares (con el estado especial de Pica-pica — oscurecidos por
// default, la pareja activa resaltada, las ya jugadas tachadas, ver
// CONTEXT.md/Pica-pica y ticket #30). Extraído del tanteador del Anotador
// (ticket #33) para compartirlo con el marcador de solo lectura del resto
// del Grupo, sin duplicar este layout: `interactivo` decide si los
// avatares y los botones de +/- son controles reales (Anotador, con su
// propio debounce) o solo el mismo estado visual, sin ningún manejador
// (espectadores — nunca reciben onTocarAvatar/onMas/onMenos).
// interactivo:true exige los 3 manejadores (Anotador); interactivo:false
// no los acepta (espectadores) — un discriminated union en vez de
// opcionales sueltos, para que un futuro caller con interactivo:true y un
// manejador olvidado no compile, en vez de renderizar un botón que no
// hace nada al tocarlo.
type PropsMarcadorEquipo = {
  miembros: ParticipanteBasico[];
  puntos: number;
  equipo: 1 | 2;
  tocable: boolean;
  idsActivos: Set<string>;
  idsYaJugados: Set<string>;
} & (
  | {
      interactivo: true;
      deshabilitado?: boolean;
      onTocarAvatar: (participanteId: string) => void;
      onMas: () => void;
      onMenos: () => void;
    }
  | { interactivo: false }
);

export function MarcadorEquipo({
  miembros,
  puntos,
  equipo,
  tocable,
  idsActivos,
  idsYaJugados,
  ...resto
}: PropsMarcadorEquipo) {
  const interactivo = resto.interactivo;
  const deshabilitado = resto.interactivo ? resto.deshabilitado : undefined;
  const onTocarAvatar = resto.interactivo ? resto.onTocarAvatar : undefined;
  const onMas = resto.interactivo ? resto.onMas : undefined;
  const onMenos = resto.interactivo ? resto.onMenos : undefined;
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
            const claseTachada =
              "flex h-8 w-8 items-center justify-center rounded-full border-2 border-line bg-bg text-xs font-bold text-muted line-through opacity-60";
            return interactivo ? (
              <button key={miembro.participanteId} type="button" disabled className={claseTachada}>
                {inicialesDeParticipante(miembro)}
              </button>
            ) : (
              <span key={miembro.participanteId} className={claseTachada}>
                {inicialesDeParticipante(miembro)}
              </span>
            );
          }

          const claseAvatar = `flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-opacity ${
            equipo === 1 ? "border-accent bg-accent-soft text-accent" : "border-accent2 bg-accent2-soft text-accent2"
          } ${activo ? "" : "opacity-30"}`;

          return interactivo ? (
            <button
              key={miembro.participanteId}
              type="button"
              onClick={() => onTocarAvatar?.(miembro.participanteId)}
              className={claseAvatar}
            >
              {inicialesDeParticipante(miembro)}
            </button>
          ) : (
            <span key={miembro.participanteId} className={claseAvatar}>
              {inicialesDeParticipante(miembro)}
            </span>
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
      {interactivo && (
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
      )}
    </div>
  );
}
