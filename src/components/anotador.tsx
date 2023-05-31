'use client';

import { useEffect, useState } from "react";
import Image from 'next/image';

export const Anotador = (): any => {

  const [state, setState] = useState(0);

  const [good, setGood] = useState('malas')

  const fosforos = () => {
    if (good === 'buenas') {
      return `/fosforos-main/fosforos-${state - 15}.png`;
    } else {
      return `/fosforos-main/fosforos-${state}.png`;
    };
  };

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

  useEffect(() => {
    if (state > 15) {
      setGood('buenas')
    } else {
      setGood('malas')
    };
  }, [state])


  return (
    <div>
      <h1>{good}</h1>
      <div className="flex justify-around text-3xl">
        <span>{state}</span>
        <button onClick={add}>+</button>
        <button onClick={remove}>-</button>
      </div>
      <div onClick={add} className="border-2 border-black h-screen w-40 self-center">
        {
          state === 0
            ?
            <></>
            : <Image src={fosforos()} alt='fosforo 1' width={100} height={100} className="m-auto mt-2" />
        }
      </div>
    </div>
  )
};

export default Anotador;