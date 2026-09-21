// Marca de tally clásica: 4 fósforos armando un cuadrado (izquierda, arriba,
// derecha, abajo) + 1 diagonal que lo cierra al llegar a 5. CSS puro, sin
// imágenes: ver la discusión de performance que llevó a este cambio.
//
// Todo en porcentaje (grosor y diagonal relativos al propio cuadrado, no
// píxeles fijos) a propósito: el contenedor es un grid de MAX_GRUPOS filas
// fijas (minmax(0,1fr) reparte el alto disponible en partes iguales), no
// una fila por grupo presente — el tamaño de cada cuadrado tiene que ser
// siempre el mismo (el que le toca cuando hay 3), no agrandarse cuando hay
// menos de 3 grupos. Los grupos de más (si puntos < 15) simplemente dejan
// filas vacías abajo. (Se probó flex-1 + aspect-square antes: el ancho
// colapsaba a 0 en este layout — el grid con filas explícitas resuelve el
// alto de cada fila antes de derivar el ancho del cuadrado, sin esa
// ambigüedad circular.)
const PUNTOS_POR_GRUPO = 5;
const PUNTOS_MAXIMOS_POR_FASE = 15;
const MAX_GRUPOS = PUNTOS_MAXIMOS_POR_FASE / PUNTOS_POR_GRUPO;
const GROSOR = "10%";
const LARGO_DIAGONAL = "141.5%"; // lado * √2, como porcentaje del propio cuadrado

const GrupoDeFosforos = ({ marcas, colorClase }: { marcas: number; colorClase: string }) => {
  return (
    <div className="relative mx-auto aspect-square h-full max-w-full">
      {marcas >= 1 && (
        <span className={`absolute left-0 top-0 h-full ${colorClase}`} style={{ width: GROSOR }} />
      )}
      {marcas >= 2 && (
        <span className={`absolute left-0 top-0 w-full ${colorClase}`} style={{ height: GROSOR }} />
      )}
      {marcas >= 3 && (
        <span className={`absolute right-0 top-0 h-full ${colorClase}`} style={{ width: GROSOR }} />
      )}
      {marcas >= 4 && (
        <span className={`absolute bottom-0 left-0 w-full ${colorClase}`} style={{ height: GROSOR }} />
      )}
      {marcas >= 5 && (
        <span
          className={`absolute left-1/2 top-1/2 ${colorClase}`}
          style={{ width: LARGO_DIAGONAL, height: GROSOR, transform: "translate(-50%, -50%) rotate(-45deg)" }}
        />
      )}
    </div>
  );
};

export const FosforosTally = ({ puntos, colorClase }: { puntos: number; colorClase: string }) => {
  const gruposConMarca = Math.ceil(puntos / PUNTOS_POR_GRUPO);

  if (gruposConMarca === 0) {
    // No es null: FosforosTally pasó a ser flex-item directo de quien lo
    // usa (ver abajo), no un hijo dentro de un wrapper flex-1 — sin este
    // spacer, con 0 puntos el resto de la tarjeta perdería el espacio
    // flexible que antes reservaba ese wrapper aunque no hubiera nada que
    // dibujar, y el contenido de abajo (los botones de +/-) subiría.
    return <div className="min-h-0 w-full flex-1" />;
  }

  return (
    <div
      // min-h-0 flex-1 en vez de h-full: h-full (porcentaje) encadenado a
      // través de varios niveles de flexbox no se resuelve en iOS Safari
      // (bug de WebKit ya reportado: "100% height doesn't work within a
      // flex item in a flex-item child", bugs.webkit.org #137730) — ahí el
      // cuadrado de fósforos terminaba con alto 0, invisible, aunque en
      // Chrome/Android se veía bien. Como flex-item directo (participa del
      // flex-grow del contenedor que lo usa, en vez de leer un porcentaje
      // de su altura) el alto se resuelve igual en los dos.
      className="grid min-h-0 w-full flex-1 gap-2"
      style={{
        gridTemplateRows: `repeat(${MAX_GRUPOS}, minmax(0, 1fr))`,
        gridTemplateColumns: "minmax(0, 1fr)",
      }}
    >
      {Array.from({ length: gruposConMarca }, (_, indiceGrupo) => {
        const marcas = Math.min(puntos - indiceGrupo * PUNTOS_POR_GRUPO, PUNTOS_POR_GRUPO);
        return <GrupoDeFosforos key={indiceGrupo} marcas={marcas} colorClase={colorClase} />;
      })}
    </div>
  );
};
