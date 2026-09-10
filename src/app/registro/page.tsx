"use client";

import { useActionState } from "react";
import { registrarYLoguear } from "./actions";

export default function RegistroPage() {
  const [estado, accion, pendiente] = useActionState(registrarYLoguear, undefined);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Crear cuenta</h1>

      <form action={accion} className="flex flex-col gap-3">
        <input
          name="nombre"
          type="text"
          placeholder="Nombre"
          required
          className="rounded border p-2"
        />
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
          minLength={8}
          className="rounded border p-2"
        />
        {estado?.message && <p className="text-sm text-red-600">{estado.message}</p>}
        <button
          type="submit"
          disabled={pendiente}
          className="rounded bg-black p-2 text-white disabled:opacity-50"
        >
          Crear cuenta
        </button>
      </form>

      <a href="/login" className="text-center text-sm underline">
        Ya tengo cuenta, iniciar sesión
      </a>
    </main>
  );
}
