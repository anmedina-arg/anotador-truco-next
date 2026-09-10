"use client";

import { useActionState } from "react";
import { loguearConCredenciales } from "./actions";

export function FormularioLogin({ callbackUrl }: { callbackUrl: string }) {
  const [estado, accion, pendiente] = useActionState(loguearConCredenciales, undefined);

  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <input
        name="email"
        type="email"
        placeholder="Email"
        required
        className="rounded border p-2"
      />
      <input
        name="password"
        type="password"
        placeholder="Contraseña"
        required
        className="rounded border p-2"
      />
      {estado?.message && <p className="text-sm text-red-600">{estado.message}</p>}
      <button
        type="submit"
        disabled={pendiente}
        className="rounded bg-black p-2 text-white disabled:opacity-50"
      >
        Iniciar sesión
      </button>
    </form>
  );
}
