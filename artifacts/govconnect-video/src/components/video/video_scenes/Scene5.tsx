import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Leaf } from 'lucide-react';

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
      exit={{ opacity: 0, y: '-5vh', filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
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
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-[1.5vw] mb-[2vh]">
            <div className="bg-primary/10 p-[1.5vw] rounded-xl text-primary">
              <ShoppingCart className="w-[3vw] h-[3vw]" />
            </div>
            <h2 className="font-display font-bold text-[3.5vw] text-sidebar">
              Contracten & Webshop
            </h2>
          </div>
          <p className="font-body text-[1.8vw] text-sidebar-muted/70 max-w-[40vw]">
            Centraal inkopen met real-time budgetbewaking.
          </p>
          
          <motion.div 
            className="mt-[4vh] bg-white rounded-xl shadow-xl border border-black/5 p-[2vw] w-[50vw]"
            initial={{ opacity: 0, scale: 0.9, rotateX: 10 }}
            animate={phase >= 2 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.9, rotateX: 10 }}
            transition={{ duration: 1, type: 'spring', bounce: 0.3 }}
          >
            <div className="flex justify-between mb-[2vh]">
              <div className="font-bold text-[1.2vw]">Afdeling IT Budget</div>
              <div className="font-bold text-[1.2vw] text-primary">€ 14.500 / € 20.000</div>
            </div>
            {/* Progress bar */}
            <div className="w-full h-[2vh] bg-black/5 rounded-full overflow-hidden mb-[2vh]">
              <motion.div 
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={phase >= 2 ? { width: '72%' } : { width: 0 }}
                transition={{ duration: 1.5, delay: 0.5, ease: 'circOut' }}
              />
            </div>
            <div className="flex gap-[1vw]">
              <div className="flex-1 bg-black/5 h-[4vh] rounded-md" />
              <div className="flex-1 bg-black/5 h-[4vh] rounded-md" />
              <div className="flex-1 bg-black/5 h-[4vh] rounded-md" />
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
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-[1.5vw] mb-[2vh]">
            <div className="bg-primary/10 p-[1.5vw] rounded-xl text-primary">
              <Leaf className="w-[3vw] h-[3vw]" />
            </div>
            <h2 className="font-display font-bold text-[3.5vw] text-sidebar">
              Duurzaamheid
            </h2>
          </div>
          <p className="font-body text-[1.8vw] text-sidebar-muted/70 max-w-[40vw]">
            Inzicht in energieverbruik, CO2-reductie en afvalstromen.
          </p>
          
          <motion.div 
            className="mt-[4vh] bg-white rounded-xl shadow-xl border border-black/5 p-[2vw] w-[50vw] flex gap-[2vw]"
            initial={{ opacity: 0, scale: 0.9, rotateX: -10 }}
            animate={phase >= 4 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.9, rotateX: -10 }}
            transition={{ duration: 1, type: 'spring', bounce: 0.3 }}
          >
            {/* KPI Cards */}
            <div className="flex-1 border border-black/10 rounded-lg p-[1.5vw] flex flex-col items-center">
              <div className="text-[1vw] text-black/50 mb-[1vh]">CO2 Reductie</div>
              <div className="text-[2.5vw] font-bold text-green-600">-14%</div>
            </div>
            <div className="flex-1 border border-black/10 rounded-lg p-[1.5vw] flex flex-col items-center">
              <div className="text-[1vw] text-black/50 mb-[1vh]">Energielabel</div>
              <div className="text-[2.5vw] font-bold text-primary">A++</div>
            </div>
          </motion.div>
        </motion.div>

      </div>
    </motion.div>
  );
}
