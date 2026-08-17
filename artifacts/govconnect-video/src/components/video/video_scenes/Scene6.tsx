import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LayoutDashboard } from 'lucide-react';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center bg-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <motion.div
        className="flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={
          phase >= 1 ? { opacity: 1, scale: 1 } : 
          { opacity: 0, scale: 0.8 }
        }
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center gap-[2vw] mb-[3vh]">
          <div className="bg-primary text-white p-[2vw] rounded-2xl shadow-xl shadow-primary/20">
            <LayoutDashboard className="w-[6vw] h-[6vw]" />
          </div>
          <div className="font-display font-bold text-[7vw] text-sidebar tracking-tight">
            GovConnect <span className="text-primary">2.0</span>
          </div>
        </div>

        <motion.div
          className="font-body text-[2.5vw] text-sidebar-muted/70 text-center"
          initial={{ opacity: 0, y: '3vh' }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: '3vh' }}
          transition={{ duration: 0.8 }}
        >
          De dagelijkse cockpit voor facilitair Nederland.
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
