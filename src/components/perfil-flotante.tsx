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
    <details className="fixed right-4 top-4 z-10 w-10">
      <summary
        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full bg-accent font-display font-bold text-white shadow-pop-accent-sm"
        aria-label="Mi perfil"
      >
        {inicial}
      </summary>
      <div className="absolute right-0 mt-2 flex w-44 flex-col gap-1 rounded-2xl border-2 border-line bg-surface p-2 text-sm font-bold shadow-pop">
        <a href="/" className="rounded-xl px-2 py-1.5 text-ink no-underline hover:bg-accent-soft hover:text-accent">
          Inicio
        </a>
        {/* Ver mi perfil: contenido todavía sin definir — se agrega el link
            cuando esa pantalla exista, por ahora es solo un placeholder. */}
        <span className="rounded-xl px-2 py-1.5 text-muted">Ver mi perfil</span>
        <a href="/grupos" className="rounded-xl px-2 py-1.5 text-ink no-underline hover:bg-accent-soft hover:text-accent">
          Mis Grupos
        </a>
        <a href="/grupos/nuevo" className="rounded-xl px-2 py-1.5 text-ink no-underline hover:bg-accent-soft hover:text-accent">
          Crear Grupo
        </a>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-xl px-2 py-1.5 text-left text-danger hover:bg-danger-soft"
          >
            Salir
          </button>
        </form>
      </div>
    </details>
  );
}

export default PerfilFlotante;
