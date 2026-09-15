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
        className="rounded-2xl border-2 border-line bg-surface p-3 text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <input
        name="password"
        type="password"
        placeholder="Contraseña"
        required
        className="rounded-2xl border-2 border-line bg-surface p-3 text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {estado?.message && <p className="text-sm font-bold text-danger">{estado.message}</p>}
      <button
        type="submit"
        disabled={pendiente}
        className="rounded-2xl bg-accent p-3 font-display font-bold text-white shadow-pop-accent disabled:opacity-50"
      >
        Iniciar sesión
      </button>
    </form>
  );
}
