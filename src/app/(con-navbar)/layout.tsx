import { auth } from "@/auth";
import { PerfilFlotante } from "@/components/perfil-flotante";

// Agrupa las pantallas que todavía no pasaron por el rediseño completo de UX
// (Login y Home tienen su propio chrome, ver esos archivos). El círculo vive
// acá y no en cada page.tsx a propósito: así también envuelve el
// not-found.tsx de este grupo cuando alguna página llama notFound() antes de
// llegar a renderizar su propio JSX (grupo/Partida inexistente, no sos
// miembro, etc.). Registro no exige sesión para renderizar su formulario, así
// que si alguien ya logueado entra ahí de todos modos ve el círculo como
// cualquier otra pantalla de este grupo — no hay nada que lo evite.
//
// Sin padding-top acá a propósito: varias pantallas del grupo usan
// min-h-screen + centrado vertical (Registro, Crear Grupo, not-found) y un
// wrapper con pt-* les corre el contenido sin achicar ese min-height, lo que
// las descentra y las hace desbordar la altura de la pantalla. La única
// pantalla con contenido pegado arriba a la derecha (el link "Crear Grupo"
// en /grupos) resuelve su propio padding-top localmente.
export default async function ConNavbarLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    return <>{children}</>;
  }

  return (
    <>
      <PerfilFlotante nombre={session.user.name} email={session.user.email} />
      {children}
    </>
  );
}
