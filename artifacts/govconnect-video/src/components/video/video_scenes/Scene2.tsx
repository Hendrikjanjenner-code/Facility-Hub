import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const customEase = [0.25, 1, 0.5, 1] as const;

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
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ backgroundColor: 'var(--ls4g-dark)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: customEase }}
    >
      <motion.div
        className="font-display font-bold text-[7vw] tracking-tight leading-none text-center"
        style={{ color: 'var(--ls4g-white)' }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={
          phase >= 2 ? { opacity: 0, y: '-5vh', scale: 1.05 } :
          phase >= 1 ? { opacity: 1, scale: 1 } : 
          { opacity: 0, scale: 0.95 }
        }
        transition={{ duration: 1.2, ease: customEase }}
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
        transition={{ duration: 1.2, ease: customEase }}
      >
        <div className="font-display font-semibold text-[4vw] leading-tight mb-[3vh]" style={{ color: 'var(--ls4g-white)' }}>
          De dagelijkse cockpit
          <br />
          <span style={{ color: 'var(--ls4g-text-muted)' }}>voor facilitair Nederland.</span>
        </div>
        <motion.div 
          className="w-[12vw] h-[0.5vh] rounded-full"
          style={{ backgroundColor: 'var(--ls4g-blue)' }}
          initial={{ scaleX: 0 }}
          animate={phase >= 3 ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 1, delay: 0.5, ease: customEase }}
        />
      </motion.div>
    </motion.div>
  );
}
