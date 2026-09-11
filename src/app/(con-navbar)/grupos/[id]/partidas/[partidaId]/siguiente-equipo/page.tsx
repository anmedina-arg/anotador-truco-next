import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerPartidaConEquipos, esAnotadorDePartida } from "@/domain/partidas";
import { listarMiembrosDeGrupo, ordenarPorFrecuencia } from "@/domain/grupos";
import { FormularioSiguienteEquipo } from "./formulario";

export default async function SiguienteEquipoPage({
  params,
}: {
  params: Promise<{ id: string; partidaId: string }>;
}) {
  const { id: grupoId, partidaId } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const partida = await obtenerPartidaConEquipos(partidaId);
  if (!partida || partida.grupoId !== grupoId) {
    notFound();
  }
  // Mismo criterio que el resto de esta Partida: solo su Anotador puede
  // verla, sea cual sea su estado (ver ticket #1, historia 26).
  if (!esAnotadorDePartida(partida, session.user.id)) {
    notFound();
  }
  if (partida.estado !== "finalizada") {
    notFound();
  }

  const equipoGanador = partida.equipoGanador === 1 ? partida.equipo1 : partida.equipo2;
  const idsGanador = new Set(equipoGanador.map((p) => p.participanteId));

  const miembros = await listarMiembrosDeGrupo(grupoId);
  const candidatos = ordenarPorFrecuencia(miembros).filter((m) => !idsGanador.has(m.participanteId));

  // Solo hace falta elegir un nuevo Anotador si el actual (quien está viendo
  // esta pantalla, ya que es el único que puede) quedó del lado que se
  // reemplaza — ver decisión del ticket #13.
  const necesitaElegirAnotador = !idsGanador.has(session.user.id);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <a href={`/grupos/${grupoId}/partidas/${partidaId}`} className="text-sm underline">
        ← Volver
      </a>
      <h1 className="text-2xl font-bold">Siguiente equipo</h1>

      <FormularioSiguienteEquipo
        grupoId={grupoId}
        partidaId={partidaId}
        equipoGanador={equipoGanador}
        candidatos={candidatos}
        necesitaElegirAnotador={necesitaElegirAnotador}
      />
    </main>
  );
}
