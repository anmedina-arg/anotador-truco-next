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
