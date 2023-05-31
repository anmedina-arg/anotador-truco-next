'use client';

import { useEffect, useState } from "react";
import Image from 'next/image';

const fosforo1 = require('../../public/fosforos-main/fosforos-1.png');
const fosforo2 = require('../../public/fosforos-main/fosforos-2.png');
const fosforo3 = require('../../public/fosforos-main/fosforos-3.png');
const fosforo4 = require('../../public/fosforos-main/fosforos-4.png');
const fosforo5 = require('../../public/fosforos-main/fosforos-5.png');
const fosforo6 = require('../../public/fosforos-main/fosforos-6.png');
const fosforo7 = require('../../public/fosforos-main/fosforos-7.png');
const fosforo8 = require('../../public/fosforos-main/fosforos-8.png');
const fosforo9 = require('../../public/fosforos-main/fosforos-9.png');
const fosforo10 = require('../../public/fosforos-main/fosforos-10.png');
const fosforo11 = require('../../public/fosforos-main/fosforos-11.png');
const fosforo12 = require('../../public/fosforos-main/fosforos-12.png');
const fosforo13 = require('../../public/fosforos-main/fosforos-13.png');
const fosforo14 = require('../../public/fosforos-main/fosforos-14.png');
const fosforo15 = require('../../public/fosforos-main/fosforos-15.png');

export const Anotador = (): any => {

  const [state, setState] = useState(0);

  const [good, setGood] = useState('malas')

  const fosforos = () => {
    if (good === 'buenas') {
      return `fosoro${state - 15}`;
    } else {
      return `fosforo${state}`;
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