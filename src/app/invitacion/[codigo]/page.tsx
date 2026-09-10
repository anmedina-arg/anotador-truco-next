import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { unirseAGrupo, CodigoInvitacionInvalidoError } from "@/domain/grupos";

export default async function InvitacionPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  let grupoId: string;
  try {
    const grupo = await unirseAGrupo({
      codigoInvitacion: codigo,
      participanteId: session.user.id,
    });
    grupoId = grupo.id;
  } catch (error) {
    if (error instanceof CodigoInvitacionInvalidoError) {
      return (
        <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6 text-center">
          <p>Este link de invitación no es válido — puede que ya no exista o el admin lo haya regenerado.</p>
          <a href="/grupos" className="underline">
            Ir a mis Grupos
          </a>
        </main>
      );
    }
    throw error;
  }

  redirect(`/grupos/${grupoId}`);
}
