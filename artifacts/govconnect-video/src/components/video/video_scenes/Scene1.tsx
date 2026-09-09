import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const customEase = [0.25, 1, 0.5, 1] as const;

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
      className="absolute inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'var(--ls4g-bg)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.8, ease: customEase }}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        
        {/* Element 1: Losse lijstjes */}
        <motion.div
          className="absolute shadow-sm p-[2vw] rounded-md transform -rotate-6"
          style={{ backgroundColor: 'var(--ls4g-white)', border: '1px solid var(--ls4g-border)' }}
          initial={{ opacity: 0, y: '15vh', x: '-15vw', rotate: -10 }}
          animate={
            phase >= 4 ? { opacity: 0, y: '30vh', rotate: -20, scale: 0.95 } :
            phase >= 1 ? { opacity: 1, y: '-5vh', x: '-10vw', rotate: -3 } : 
            { opacity: 0, y: '15vh', x: '-15vw', rotate: -10 }
          }
          transition={{ duration: 1.2, ease: customEase }}
        >
          <div className="font-display font-semibold text-[2.5vw]" style={{ color: 'var(--ls4g-text-muted)' }}>Losse lijstjes...</div>
          <div className="w-[10vw] h-[1vh] mt-[1vh] rounded-sm" style={{ backgroundColor: 'var(--ls4g-border)' }} />
          <div className="w-[14vw] h-[1vh] mt-[1vh] rounded-sm" style={{ backgroundColor: 'var(--ls4g-border)' }} />
          <div className="w-[12vw] h-[1vh] mt-[1vh] rounded-sm" style={{ backgroundColor: 'var(--ls4g-border)' }} />
        </motion.div>

        {/* Element 2: Mails */}
        <motion.div
          className="absolute shadow-md p-[2vw] rounded-lg transform rotate-3"
          style={{ backgroundColor: 'var(--ls4g-white)', border: '1px solid var(--ls4g-border)' }}
          initial={{ opacity: 0, y: '20vh', x: '10vw', rotate: 10 }}
          animate={
            phase >= 4 ? { opacity: 0, y: '30vh', rotate: 15, scale: 0.95 } :
            phase >= 2 ? { opacity: 1, y: '5vh', x: '10vw', rotate: 2 } : 
            { opacity: 0, y: '20vh', x: '10vw', rotate: 10 }
          }
          transition={{ duration: 1.2, ease: customEase }}
        >
          <div className="text-[1vw] font-mono mb-[1vh]" style={{ color: 'var(--ls4g-text-muted)' }}>From: beheerder@gemeente.nl</div>
          <div className="font-display font-semibold text-[3vw]" style={{ color: 'var(--ls4g-text)' }}>Eindeloze mails</div>
        </motion.div>

        {/* Element 3: Spreadsheets */}
        <motion.div
          className="absolute shadow-lg p-[2vw] rounded-lg"
          style={{ backgroundColor: 'var(--ls4g-dark)', color: 'var(--ls4g-white)' }}
          initial={{ opacity: 0, scale: 0.9, y: '-5vh' }}
          animate={
            phase >= 4 ? { opacity: 0, y: '20vh', scale: 1.1 } :
            phase >= 3 ? { opacity: 1, scale: 1, y: '-2vh', x: '-2vw', rotate: -1 } : 
            { opacity: 0, scale: 0.9, y: '-5vh' }
          }
          transition={{ duration: 1.2, ease: customEase }}
        >
          <div className="flex gap-[0.5vw] mb-[2vh]">
            <div className="w-[3vw] h-[3vh] rounded-sm" style={{ backgroundColor: 'var(--ls4g-dark-surface)' }} />
            <div className="w-[8vw] h-[3vh] rounded-sm" style={{ backgroundColor: 'var(--ls4g-blue)' }} />
            <div className="w-[5vw] h-[3vh] rounded-sm" style={{ backgroundColor: 'var(--ls4g-dark-surface)' }} />
          </div>
          <div className="font-display font-semibold text-[3.5vw] leading-tight" style={{ color: 'var(--ls4g-white)' }}>
            Versnipperde<br/>spreadsheets
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}
