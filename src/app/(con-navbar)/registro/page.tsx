import { callbackUrlSeguro } from "@/lib/callback-url";
import { FormularioRegistro } from "./formulario";

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl: callbackUrlCrudo } = await searchParams;
  const callbackUrl = callbackUrlSeguro(callbackUrlCrudo);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 p-6">
      <h1 className="font-display text-3xl font-bold text-ink">Crear cuenta</h1>

      <FormularioRegistro callbackUrl={callbackUrl} />

      <a
        href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
        className="text-center text-sm font-bold text-accent no-underline hover:text-accent-dark"
      >
        Ya tengo cuenta, iniciar sesión
      </a>
    </main>
  );
}
