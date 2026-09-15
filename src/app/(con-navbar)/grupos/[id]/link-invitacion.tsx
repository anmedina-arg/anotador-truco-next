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
        className="flex-1 rounded-2xl border-2 border-line bg-surface p-3 text-sm text-muted"
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
        className="rounded-2xl bg-accent px-4 py-3 text-sm font-display font-bold text-white shadow-pop-accent-sm"
      >
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
