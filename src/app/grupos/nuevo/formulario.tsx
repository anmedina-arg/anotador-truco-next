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
        className="rounded border p-2"
      />
      {estado?.message && <p className="text-sm text-red-600">{estado.message}</p>}
      <button
        type="submit"
        disabled={pendiente}
        className="rounded bg-black p-2 text-white disabled:opacity-50"
      >
        Crear Grupo
      </button>
    </form>
  );
}
