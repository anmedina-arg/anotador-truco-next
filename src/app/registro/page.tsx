import { registrarYLoguear } from "./actions";

export default function RegistroPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Crear cuenta</h1>

      <form action={registrarYLoguear} className="flex flex-col gap-3">
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
        <button type="submit" className="rounded bg-black p-2 text-white">
          Crear cuenta
        </button>
      </form>

      <a href="/login" className="text-center text-sm underline">
        Ya tengo cuenta, iniciar sesión
      </a>
    </main>
  );
}
