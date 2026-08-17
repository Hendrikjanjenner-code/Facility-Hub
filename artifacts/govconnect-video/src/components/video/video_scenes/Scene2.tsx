import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 3200),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        className="font-display font-bold text-[7vw] tracking-tight leading-none text-center"
        initial={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
        animate={
          phase >= 2 ? { opacity: 0, y: '-5vh', scale: 1.1, filter: 'blur(10px)' } :
          phase >= 1 ? { opacity: 1, scale: 1, filter: 'blur(0px)' } : 
          { opacity: 0, scale: 0.8, filter: 'blur(10px)' }
        }
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      >
        Eén platform.
      </motion.div>

      <motion.div
        className="absolute w-full px-[10vw] text-center flex flex-col items-center"
        initial={{ opacity: 0, y: '5vh' }}
        animate={
          phase >= 3 ? { opacity: 1, y: 0 } : 
          { opacity: 0, y: '5vh' }
        }
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="font-display font-semibold text-[4vw] leading-tight text-white mb-[3vh]">
          De dagelijkse cockpit
          <br />
          <span className="text-white/60">voor facilitair Nederland.</span>
        </div>
        <motion.div 
          className="w-[12vw] h-[0.5vh] bg-accent rounded-full"
          initial={{ scaleX: 0 }}
          animate={phase >= 3 ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 1, delay: 0.5, ease: 'circOut' }}
        />
      </motion.div>
    </motion.div>
  );
}
