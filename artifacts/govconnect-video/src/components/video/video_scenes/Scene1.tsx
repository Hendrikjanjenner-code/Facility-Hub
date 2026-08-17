import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1600),
      setTimeout(() => setPhase(3), 2800),
      setTimeout(() => setPhase(4), 4800), // Exit phase
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        
        {/* Chaos Element 1: Lijstjes */}
        <motion.div
          className="absolute shadow-lg bg-yellow-50 border border-yellow-200 p-[2vw] rounded-md transform -rotate-6"
          initial={{ opacity: 0, y: '15vh', x: '-15vw', rotate: -20 }}
          animate={
            phase >= 4 ? { opacity: 0, y: '30vh', rotate: -40, scale: 0.8 } :
            phase >= 1 ? { opacity: 1, y: '-5vh', x: '-10vw', rotate: -6 } : 
            { opacity: 0, y: '15vh', x: '-15vw', rotate: -20 }
          }
          transition={{ duration: 0.8, type: 'spring', bounce: 0.4 }}
        >
          <div className="font-display font-bold text-[3vw] text-yellow-800">Losse lijstjes...</div>
          <div className="w-[10vw] h-[1vh] bg-yellow-200 mt-[1vh] rounded-sm" />
          <div className="w-[14vw] h-[1vh] bg-yellow-200 mt-[1vh] rounded-sm" />
          <div className="w-[12vw] h-[1vh] bg-yellow-200 mt-[1vh] rounded-sm" />
        </motion.div>

        {/* Chaos Element 2: Mails */}
        <motion.div
          className="absolute shadow-xl bg-white border border-gray-200 p-[2vw] rounded-lg transform rotate-3"
          initial={{ opacity: 0, y: '20vh', x: '10vw', rotate: 15 }}
          animate={
            phase >= 4 ? { opacity: 0, y: '30vh', rotate: 30, scale: 0.8 } :
            phase >= 2 ? { opacity: 1, y: '5vh', x: '10vw', rotate: 3 } : 
            { opacity: 0, y: '20vh', x: '10vw', rotate: 15 }
          }
          transition={{ duration: 0.8, type: 'spring', bounce: 0.4 }}
        >
          <div className="text-[1vw] text-gray-400 font-mono mb-[1vh]">From: beheerder@gemeente.nl</div>
          <div className="font-display font-bold text-[3.5vw] text-blue-900">Eindeloze mails</div>
        </motion.div>

        {/* Chaos Element 3: Spreadsheets */}
        <motion.div
          className="absolute shadow-2xl bg-green-50 border border-green-200 p-[2vw] rounded-sm"
          initial={{ opacity: 0, scale: 0.5, y: '-5vh' }}
          animate={
            phase >= 4 ? { opacity: 0, y: '20vh', scale: 1.2, filter: 'blur(20px)' } :
            phase >= 3 ? { opacity: 1, scale: 1, y: '-2vh', x: '-2vw', rotate: -2 } : 
            { opacity: 0, scale: 0.5, y: '-5vh' }
          }
          transition={{ duration: 0.9, type: 'spring', bounce: 0.3 }}
        >
          <div className="flex gap-[0.5vw] mb-[2vh]">
            <div className="w-[3vw] h-[3vh] bg-green-200 rounded-sm" />
            <div className="w-[8vw] h-[3vh] bg-green-200 rounded-sm" />
            <div className="w-[5vw] h-[3vh] bg-green-200 rounded-sm" />
          </div>
          <div className="font-display font-bold text-[4.5vw] text-green-900 leading-tight">
            Versnipperde<br/>spreadsheets
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}
