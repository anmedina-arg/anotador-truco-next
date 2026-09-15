"use client";

import { useActionState } from "react";
import { invitarPorEmailAction, regenerarCodigoInvitacionAction, type EstadoInvitarPorEmail } from "./actions";
import { LinkInvitacion } from "./link-invitacion";

// <details>/<summary> en vez de un modal a propósito — mismo mecanismo que
// PerfilFlotante para un menú chico que se abre/cierra sin JS extra. Dentro
// van las dos opciones juntas (no una sub-navegación): invitar por email a
// alguien ya registrado, o copiar el link para compartir por mensaje.
export function Invitar({ grupoId, codigo }: { grupoId: string; codigo: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoInvitarPorEmail, FormData>(
    invitarPorEmailAction,
    undefined,
  );

  return (
    <details className="group">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-2xl bg-accent px-4 py-3 font-display font-bold text-white shadow-pop-accent">
        Invitar
      </summary>
      <div className="mt-3 flex flex-col gap-4 rounded-2xl border-2 border-line bg-surface p-4 shadow-pop">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold text-ink">Invitar a alguien que ya usa la app</p>
          <form action={accion} className="flex gap-2">
            <input type="hidden" name="grupoId" value={grupoId} />
            <input
              type="email"
              name="email"
              placeholder="email@ejemplo.com"
              required
              className="flex-1 rounded-2xl border-2 border-line p-3 text-sm text-ink"
            />
            <button
              type="submit"
              disabled={pendiente}
              className="shrink-0 rounded-2xl bg-accent px-4 py-3 text-sm font-display font-bold text-white shadow-pop-accent-sm disabled:opacity-50"
            >
              Agregar
            </button>
          </form>
          {estado?.message && <p className="text-sm font-bold text-danger">{estado.message}</p>}
        </div>

        <div className="flex flex-col gap-2 border-t-2 border-line pt-4">
          <p className="text-sm font-bold text-ink">O copiá el link para compartir por mensaje</p>
          <LinkInvitacion codigo={codigo} />
          <form action={regenerarCodigoInvitacionAction}>
            <input type="hidden" name="grupoId" value={grupoId} />
            <button type="submit" className="text-sm font-bold text-muted hover:text-accent">
              Generar un código nuevo (invalida el anterior)
            </button>
          </form>
        </div>
      </div>
    </details>
  );
}
