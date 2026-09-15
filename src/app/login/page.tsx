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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 p-6">
      <h1 className="font-display text-3xl font-bold text-ink">Iniciar sesión</h1>

      <FormularioLogin callbackUrl={callbackUrl} />

      <form action={loguearConGoogleAction}>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <button
          type="submit"
          className="w-full rounded-2xl border-2 border-line bg-surface p-3 font-display font-bold text-ink shadow-pop"
        >
          Continuar con Google
        </button>
      </form>

      <a
        href={`/registro?callbackUrl=${encodeURIComponent(callbackUrl)}`}
        className="text-center text-sm font-bold text-accent no-underline hover:text-accent-dark"
      >
        No tengo cuenta, crear una
      </a>
    </main>
  );
}
