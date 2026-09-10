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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Crear cuenta</h1>

      <FormularioRegistro callbackUrl={callbackUrl} />

      <a
        href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
        className="text-center text-sm underline"
      >
        Ya tengo cuenta, iniciar sesión
      </a>
    </main>
  );
}
