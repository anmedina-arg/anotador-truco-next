"use client";

import { useActionState } from "react";
import { crearRevanchaAction } from "./actions";

export function BotonRevancha({ grupoId, partidaId }: { grupoId: string; partidaId: string }) {
  const [estado, accion, pendiente] = useActionState(crearRevanchaAction, undefined);

  return (
    <form action={accion} className="flex flex-col gap-2">
      <input type="hidden" name="grupoId" value={grupoId} />
      <input type="hidden" name="partidaId" value={partidaId} />

      {estado?.message && <p className="text-sm text-red-600">{estado.message}</p>}

      <button
        type="submit"
        disabled={pendiente}
        className="w-full rounded border p-2 text-sm disabled:opacity-50"
      >
        Revancha
      </button>
    </form>
  );
}
