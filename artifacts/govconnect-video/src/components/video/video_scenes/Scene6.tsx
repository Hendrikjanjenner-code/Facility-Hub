import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const customEase = [0.25, 1, 0.5, 1] as const;

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000), // Logo animation completes
      setTimeout(() => setPhase(3), 3500), // Subtitle
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ backgroundColor: 'var(--ls4g-bg)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: customEase }}
    >
      <div className="flex flex-col items-center">
        
        {/* LetShare4Gov Animated Logo */}
        <div className="flex items-center gap-[2vw] mb-[3vh]">
          {/* Logo Mark */}
          <div className="relative w-[10vw] h-[10vw] flex items-center justify-center">
            {/* Dark base panel */}
            <motion.div
              className="absolute left-[1vw] w-[4vw] h-[8vw] origin-left"
              style={{ backgroundColor: 'var(--ls4g-dark)', clipPath: 'polygon(0% 10%, 100% 0%, 100% 90%, 0% 100%)' }}
              initial={{ opacity: 0, x: '-5vw', skewY: 10 }}
              animate={phase >= 1 ? { opacity: 1, x: 0, skewY: 0 } : {}}
              transition={{ duration: 1.2, ease: customEase }}
            />
            {/* Deep Blue middle panel */}
            <motion.div
              className="absolute left-[3vw] w-[4vw] h-[8vw] origin-left mix-blend-multiply"
              style={{ backgroundColor: 'var(--ls4g-blue-dark)', clipPath: 'polygon(0% 15%, 100% 5%, 100% 85%, 0% 95%)' }}
              initial={{ opacity: 0, x: '-5vw', skewY: 10 }}
              animate={phase >= 1 ? { opacity: 0.9, x: 0, skewY: 0 } : {}}
              transition={{ duration: 1.2, delay: 0.2, ease: customEase }}
            />
            {/* Bright Blue front panel */}
            <motion.div
              className="absolute left-[5vw] w-[4vw] h-[8vw] origin-left"
              style={{ backgroundColor: 'var(--ls4g-blue)', clipPath: 'polygon(0% 20%, 100% 10%, 100% 80%, 0% 90%)' }}
              initial={{ opacity: 0, x: '-5vw', skewY: 10 }}
              animate={phase >= 1 ? { opacity: 1, x: 0, skewY: 0 } : {}}
              transition={{ duration: 1.2, delay: 0.4, ease: customEase }}
            />
          </div>

          {/* Wordmark */}
          <div className="font-display font-bold text-[7vw] tracking-tight flex" style={{ color: 'var(--ls4g-dark)' }}>
            <motion.div
              initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }}
              animate={phase >= 2 ? { opacity: 1, clipPath: 'inset(0 0% 0 0)' } : {}}
              transition={{ duration: 1, ease: customEase }}
            >
              LetShare
            </motion.div>
            <motion.div
              style={{ color: 'var(--ls4g-blue)' }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={phase >= 2 ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.8, ease: customEase }}
            >
              4
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: '2vw' }}
              animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.8, delay: 1, ease: customEase }}
            >
              Gov
            </motion.div>
          </div>
        </div>

        <motion.div
          className="font-body text-[2.5vw] font-medium"
          style={{ color: 'var(--ls4g-text-muted)' }}
          initial={{ opacity: 0, y: '3vh' }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: '3vh' }}
          transition={{ duration: 0.8, ease: customEase }}
        >
          De dagelijkse cockpit voor facilitair Nederland.
        </motion.div>
      </div>
    </motion.div>
  );
}
