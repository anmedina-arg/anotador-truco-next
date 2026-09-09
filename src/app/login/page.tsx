import { loguearConCredenciales, loguearConGoogle } from "./actions";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Iniciar sesión</h1>

      <form action={loguearConCredenciales} className="flex flex-col gap-3">
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
        <button type="submit" className="rounded bg-black p-2 text-white">
          Iniciar sesión
        </button>
      </form>

      <form action={loguearConGoogle}>
        <button type="submit" className="w-full rounded border p-2">
          Continuar con Google
        </button>
      </form>

      <a href="/registro" className="text-center text-sm underline">
        No tengo cuenta, crear una
      </a>
    </main>
  );
}
