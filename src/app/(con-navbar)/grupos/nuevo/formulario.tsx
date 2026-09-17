"use client";

import { useActionState } from "react";
import { crearGrupoAction } from "./actions";

export function FormularioNuevoGrupo() {
  const [estado, accion, pendiente] = useActionState(crearGrupoAction, undefined);

  return (
    <form action={accion} className="flex flex-col gap-3">
      <input
        name="nombre"
        type="text"
        placeholder="Nombre del Grupo"
        required
        className="rounded-2xl border-2 border-line bg-surface p-3 text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />

      {/* Opcionales: umbrales de la Fase alternada de Pica-pica (ver
          CONTEXT.md/Fase, ticket #22) — 5 y 20 precargados como default
          visible. Deliberadamente sin pantalla para editarlos después de
          creado el Grupo (ver ADR 0004). */}
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs font-bold text-muted">
          Umbral inicio Pica-pica
          <input
            name="umbralInicioPicaPica"
            type="number"
            min={1}
            max={28}
            defaultValue={5}
            className="rounded-2xl border-2 border-line bg-surface p-3 text-ink focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-bold text-muted">
          Umbral fin Pica-pica
          <input
            name="umbralFinPicaPica"
            type="number"
            min={2}
            max={29}
            defaultValue={20}
            className="rounded-2xl border-2 border-line bg-surface p-3 text-ink focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      {estado?.message && <p className="text-sm font-bold text-danger">{estado.message}</p>}
      <button
        type="submit"
        disabled={pendiente}
        className="rounded-2xl bg-accent p-3 font-display font-bold text-white shadow-pop-accent disabled:opacity-50"
      >
        Crear Grupo
      </button>
    </form>
  );
}
