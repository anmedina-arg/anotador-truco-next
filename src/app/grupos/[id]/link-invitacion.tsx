"use client";

import { useEffect, useState } from "react";

export function LinkInvitacion({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  const [link, setLink] = useState("");

  // El origen (dominio) solo se conoce en el navegador — se completa después
  // del primer render para no desalinear el HTML del servidor con el cliente.
  useEffect(() => {
    setLink(`${window.location.origin}/invitacion/${codigo}`);
  }, [codigo]);

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={link}
        className="flex-1 rounded border p-2 text-sm text-gray-500"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            // Clipboard API no disponible (ej. contexto sin HTTPS) — el link
            // ya está seleccionable a mano en el input de al lado.
          }
        }}
        className="rounded border px-3 py-2 text-sm"
      >
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
