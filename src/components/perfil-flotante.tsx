import { signOut } from "@/auth";

// Reemplaza al header/navbar clásico en las pantallas ya rediseñadas: un
// único punto de navegación global, flotante, para no competir con el
// contenido de la pantalla. Ver el acuerdo de diseño (sesión de UX).
export function PerfilFlotante({
  nombre,
  email,
}: {
  nombre?: string | null;
  email?: string | null;
}) {
  const inicial = (nombre || email || "?").trim().charAt(0).toUpperCase();

  return (
    <details className="fixed right-4 top-4 z-10">
      <summary
        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border bg-white"
        aria-label="Mi perfil"
      >
        {inicial}
      </summary>
      <div className="mt-2 flex w-44 flex-col gap-1 rounded border bg-white p-2 text-sm shadow-md">
        <a href="/" className="rounded px-2 py-1 hover:bg-gray-100">
          Inicio
        </a>
        {/* Ver mi perfil: contenido todavía sin definir — se agrega el link
            cuando esa pantalla exista, por ahora es solo un placeholder. */}
        <span className="rounded px-2 py-1 text-gray-400">Ver mi perfil</span>
        <a href="/grupos" className="rounded px-2 py-1 hover:bg-gray-100">
          Mis Grupos
        </a>
        <a href="/grupos/nuevo" className="rounded px-2 py-1 hover:bg-gray-100">
          Crear Grupo
        </a>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="w-full rounded px-2 py-1 text-left hover:bg-gray-100">
            Salir
          </button>
        </form>
      </div>
    </details>
  );
}

export default PerfilFlotante;
