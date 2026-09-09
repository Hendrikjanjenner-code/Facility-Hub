import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Leaf } from 'lucide-react';

const customEase = [0.25, 1, 0.5, 1] as const;

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 4500), // second module
      setTimeout(() => setPhase(4), 5200),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 pl-[18vw] pr-[5vw] flex items-center"
      initial={{ opacity: 0, x: '5vw' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, y: '-5vh' }}
      transition={{ duration: 0.8, ease: customEase }}
    >
      <div className="w-full flex flex-col justify-center h-full relative">
        
        {/* Module 5: Contracten */}
        <motion.div
          className="absolute top-[15vh] w-full"
          initial={{ opacity: 0, y: '5vh' }}
          animate={
            phase >= 3 ? { opacity: 0.2, y: '-2vh', scale: 0.95 } :
            phase >= 1 ? { opacity: 1, y: 0, scale: 1 } : 
            { opacity: 0, y: '5vh' }
          }
          transition={{ duration: 0.8, ease: customEase }}
        >
          <div className="flex items-center gap-[1.5vw] mb-[2vh]">
            <div className="p-[1.5vw] rounded-xl" style={{ backgroundColor: 'var(--ls4g-blue)', color: 'var(--ls4g-white)' }}>
              <ShoppingCart className="w-[3vw] h-[3vw]" />
            </div>
            <h2 className="font-display font-semibold text-[3.5vw]" style={{ color: 'var(--ls4g-dark)' }}>
              Contracten & Webshop
            </h2>
          </div>
          <p className="font-body text-[1.8vw]" style={{ color: 'var(--ls4g-text-muted)' }}>
            Centraal inkopen met real-time budgetbewaking.
          </p>
          
          <motion.div 
            className="mt-[4vh] rounded-xl shadow-lg border p-[2vw] w-[50vw]"
            style={{ backgroundColor: 'var(--ls4g-white)', borderColor: 'var(--ls4g-border)' }}
            initial={{ opacity: 0, scale: 0.95, rotateX: 5 }}
            animate={phase >= 2 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.95, rotateX: 5 }}
            transition={{ duration: 1.2, ease: customEase }}
          >
            <div className="flex justify-between mb-[2vh]">
              <div className="font-semibold text-[1.2vw]" style={{ color: 'var(--ls4g-dark)' }}>Afdeling IT Budget</div>
              <div className="font-semibold text-[1.2vw]" style={{ color: 'var(--ls4g-blue-dark)' }}>€ 14.500 / € 20.000</div>
            </div>
            {/* Progress bar */}
            <div className="w-full h-[2vh] rounded-full overflow-hidden mb-[2vh]" style={{ backgroundColor: 'var(--ls4g-bg)' }}>
              <motion.div 
                className="h-full"
                style={{ backgroundColor: 'var(--ls4g-blue)' }}
                initial={{ width: 0 }}
                animate={phase >= 2 ? { width: '72%' } : { width: 0 }}
                transition={{ duration: 1.5, delay: 0.5, ease: customEase }}
              />
            </div>
            <div className="flex gap-[1vw]">
              <div className="flex-1 h-[4vh] rounded-md" style={{ backgroundColor: 'var(--ls4g-bg)' }} />
              <div className="flex-1 h-[4vh] rounded-md" style={{ backgroundColor: 'var(--ls4g-bg)' }} />
              <div className="flex-1 h-[4vh] rounded-md" style={{ backgroundColor: 'var(--ls4g-bg)' }} />
            </div>
          </motion.div>
        </motion.div>

        {/* Module 6: Duurzaamheid */}
        <motion.div
          className="absolute top-[45vh] w-full"
          initial={{ opacity: 0, y: '8vh' }}
          animate={
            phase >= 3 ? { opacity: 1, y: 0 } : 
            { opacity: 0, y: '8vh' }
          }
          transition={{ duration: 1, ease: customEase }}
        >
          <div className="flex items-center gap-[1.5vw] mb-[2vh]">
            <div className="p-[1.5vw] rounded-xl" style={{ backgroundColor: 'var(--ls4g-blue-dark)', color: 'var(--ls4g-white)' }}>
              <Leaf className="w-[3vw] h-[3vw]" />
            </div>
            <h2 className="font-display font-semibold text-[3.5vw]" style={{ color: 'var(--ls4g-dark)' }}>
              Duurzaamheid
            </h2>
          </div>
          <p className="font-body text-[1.8vw] max-w-[40vw]" style={{ color: 'var(--ls4g-text-muted)' }}>
            Inzicht in energieverbruik, CO2-reductie en afvalstromen.
          </p>
          
          <motion.div 
            className="mt-[4vh] rounded-xl shadow-lg border p-[2vw] w-[50vw] flex gap-[2vw]"
            style={{ backgroundColor: 'var(--ls4g-white)', borderColor: 'var(--ls4g-border)' }}
            initial={{ opacity: 0, scale: 0.95, rotateX: -5 }}
            animate={phase >= 4 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.95, rotateX: -5 }}
            transition={{ duration: 1.2, ease: customEase }}
          >
            {/* KPI Cards */}
            <div className="flex-1 border rounded-lg p-[1.5vw] flex flex-col items-center" style={{ borderColor: 'var(--ls4g-border)' }}>
              <div className="text-[1vw] mb-[1vh]" style={{ color: 'var(--ls4g-text-muted)' }}>CO2 Reductie</div>
              <div className="text-[2.5vw] font-bold" style={{ color: 'var(--ls4g-dark)' }}>-14%</div>
            </div>
            <div className="flex-1 border rounded-lg p-[1.5vw] flex flex-col items-center" style={{ borderColor: 'var(--ls4g-border)' }}>
              <div className="text-[1vw] mb-[1vh]" style={{ color: 'var(--ls4g-text-muted)' }}>Energielabel</div>
              <div className="text-[2.5vw] font-bold" style={{ color: 'var(--ls4g-blue)' }}>A++</div>
            </div>
          </motion.div>
        </motion.div>

      </div>
    </motion.div>
  );
}
