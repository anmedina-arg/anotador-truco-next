'use client';

// Sin uso por ahora a propósito, no es código huérfano: es la base visual
// (fósforos) para el rediseño de la pantalla del marcador (sesión de UX,
// "no elimines el componente con los fosforos"). Se retoma cuando le toque
// su turno en la secuencia de pantallas.

import { useState } from "react";
import { FosforosTally } from "./fosforos-tally";

export const Anotador = (): any => {

  const [state, setState] = useState(0);

  const good = state > 15 ? 'buenas' : 'malas';
  const puntosDeLaFase = good === 'buenas' ? state - 15 : state;

  const add = () => {
    if (state < 30) {
      setState(state + 1)
    }

  };

  const remove = () => {
    if (state > 0) {
      setState(state - 1)
    }
    return
  };

  return (
    <div>
      <h1>{good}</h1>
      <div className="flex justify-around text-3xl">
        <span>{state}</span>
        <button onClick={add}>+</button>
        <button onClick={remove}>-</button>
      </div>
      <div onClick={add} className="border-2 border-black h-screen w-40 self-center p-2">
        <div className="mx-auto flex h-full w-full flex-col items-center">
          <FosforosTally puntos={puntosDeLaFase} colorClase={good === 'buenas' ? 'bg-accent2' : 'bg-ink'} />
        </div>
      </div>
    </div>
  )
};

export default Anotador;