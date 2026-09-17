"use client";

import { useActionState } from "react";
import {
  actualizarVentanaInactividadAction,
  type EstadoEditarVentanaInactividad,
} from "./actions";

// A diferencia de los umbrales de Pica-pica (sin pantalla de edición, ver
// ADR 0004), esta sí es editable por el admin en cualquier momento (ticket
// #23) — un cambio acá aplica de inmediato a cualquier pantalla del
// tanteador que se abra o recargue después, pero no empuja el valor nuevo a
// una pestaña que ya tenía el tanteador abierto (ver el comentario de
// actualizarVentanaInactividad en domain/grupos.ts).
export function EditarVentanaInactividad({
  grupoId,
  ventanaInactividadSegundos,
}: {
  grupoId: string;
  ventanaInactividadSegundos: number;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoEditarVentanaInactividad, FormData>(
    actualizarVentanaInactividadAction,
    undefined,
  );

  return (
    <details>
      <summary className="w-fit cursor-pointer list-none text-sm font-bold text-accent hover:text-accent-dark">
        Editar ventana de inactividad
      </summary>
      <form action={accion} className="mt-2 flex flex-col gap-3 rounded-2xl border-2 border-line bg-bg p-3">
        <input type="hidden" name="grupoId" value={grupoId} />
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">
          Segundos sin tocar hasta que se considera terminada una Mano
          <input
            type="number"
            name="ventanaInactividadSegundos"
            min={5}
            max={60}
            defaultValue={ventanaInactividadSegundos}
            className="rounded-xl border-2 border-line p-2 text-sm font-bold text-ink"
          />
        </label>
        {estado?.message && <p className="text-sm font-bold text-danger">{estado.message}</p>}
        <button
          type="submit"
          disabled={pendiente}
          className="w-fit rounded-2xl bg-accent px-4 py-2 text-sm font-display font-bold text-white shadow-pop-accent-sm disabled:opacity-50"
        >
          Guardar
        </button>
      </form>
    </details>
  );
}
