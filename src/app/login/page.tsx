import { callbackUrlSeguro } from "@/lib/callback-url";
import { loguearConGoogleAction } from "./actions";
import { FormularioLogin } from "./formulario";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl: callbackUrlCrudo } = await searchParams;
  const callbackUrl = callbackUrlSeguro(callbackUrlCrudo);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Iniciar sesión</h1>

      <FormularioLogin callbackUrl={callbackUrl} />

      <form action={loguearConGoogleAction}>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <button type="submit" className="w-full rounded border p-2">
          Continuar con Google
        </button>
      </form>

      <a
        href={`/registro?callbackUrl=${encodeURIComponent(callbackUrl)}`}
        className="text-center text-sm underline"
      >
        No tengo cuenta, crear una
      </a>
    </main>
  );
}
