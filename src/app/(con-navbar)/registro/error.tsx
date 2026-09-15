"use client";

export default function ErrorRegistro({ error }: { error: Error }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6 text-center">
      <p className="font-bold text-danger">{error.message}</p>
      <a href="/registro" className="font-bold text-accent no-underline hover:text-accent-dark">
        Volver a intentar
      </a>
    </main>
  );
}
