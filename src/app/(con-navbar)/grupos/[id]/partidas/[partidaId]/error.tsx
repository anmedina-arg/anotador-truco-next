"use client";

import { useParams } from "next/navigation";

// Mismo patrón que grupos/nuevo/error.tsx, registro/error.tsx y
// login/error.tsx — acá cubre sobre todo el reclamo de Anotador
// (reclamarAnotadorAction, ticket #33): sus errores "de verdad" (Partida
// inexistente/no en_curso/ajeno a los 6) no deberían poder pasar desde la
// UI real, pero si alguna vez pasan (uso indebido, bug), esto evita la
// pantalla de crash genérica de Next.js.
export default function ErrorPartida({ error }: { error: Error }) {
  const params = useParams<{ id: string }>();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6 text-center">
      <p className="font-bold text-danger">{error.message}</p>
      <a href={`/grupos/${params.id}`} className="font-bold text-accent no-underline hover:text-accent-dark">
        Volver al Grupo
      </a>
    </main>
  );
}
