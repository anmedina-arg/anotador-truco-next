import { Navbar } from "@/components/navbar";

// Agrupa las pantallas que todavía no pasaron por el rediseño de UX (Login y
// Home tienen su propio chrome, ver esos archivos). El Navbar vive acá y no
// en cada page.tsx a propósito: así también envuelve el not-found.tsx de
// este grupo cuando alguna página llama notFound() antes de llegar a
// renderizar su propio JSX (grupo/Partida inexistente, no sos miembro, etc.)
export default function ConNavbarLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
