import { auth, signOut } from "@/auth";

export async function Navbar() {
  const session = await auth();

  return (
    <nav className="flex items-center justify-between border-b p-4">
      <a href="/" className="font-bold">
        Anotador de Truco
      </a>

      {session?.user ? (
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
          className="flex items-center gap-3"
        >
          <span className="text-sm">{session.user.name ?? session.user.email}</span>
          <button type="submit" className="rounded border px-3 py-1">
            Salir
          </button>
        </form>
      ) : (
        <div className="flex gap-3">
          <a href="/login" className="underline">
            Iniciar sesión
          </a>
          <a href="/registro" className="underline">
            Crear cuenta
          </a>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
