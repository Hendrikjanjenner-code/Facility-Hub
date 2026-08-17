import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, ClipboardList } from 'lucide-react';

export function Scene4() {
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
        
        {/* Module 3: Vastgoed */}
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
              <Building2 className="w-[3vw] h-[3vw]" />
            </div>
            <h2 className="font-display font-bold text-[3.5vw] text-sidebar">
              Vastgoed & Gebouwbeheer
            </h2>
          </div>
          <p className="font-body text-[1.8vw] text-sidebar-muted/70 max-w-[40vw]">
            Interactief vlekkenplan en waterdicht sleutelbeheer.
          </p>
          
          {/* UI Mockup snippet: Vlekkenplan / floorplan */}
          <motion.div 
            className="mt-[4vh] bg-white rounded-xl shadow-xl border border-black/5 p-[2vw] w-[50vw] h-[20vh] relative overflow-hidden"
            initial={{ opacity: 0, scale: 0.9, rotateX: 10 }}
            animate={phase >= 2 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.9, rotateX: 10 }}
            transition={{ duration: 1, type: 'spring', bounce: 0.3 }}
          >
            {/* Fake floorplan */}
            <div className="absolute inset-0 m-[2vw] border-2 border-black/10 rounded flex gap-[1vw] p-[1vw]">
              <div className="flex-1 bg-blue-50 border border-blue-200 rounded flex items-center justify-center text-blue-400 font-mono text-[1vw]">Zuidvleugel</div>
              <div className="flex-1 flex flex-col gap-[1vw]">
                <div className="flex-1 bg-green-50 border border-green-200 rounded flex items-center justify-center text-green-400 font-mono text-[1vw]">Vergader 1</div>
                <div className="flex-1 bg-orange-50 border border-orange-200 rounded flex items-center justify-center text-orange-400 font-mono text-[1vw]">Kantine</div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Module 4: MJOP */}
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
              <ClipboardList className="w-[3vw] h-[3vw]" />
            </div>
            <h2 className="font-display font-bold text-[3.5vw] text-sidebar">
              MJOP
            </h2>
          </div>
          <p className="font-body text-[1.8vw] text-sidebar-muted/70 max-w-[40vw]">
            NEN 2767 conditiemeting en financiële scenarioplanning.
          </p>
          
          <motion.div 
            className="mt-[4vh] bg-white rounded-xl shadow-xl border border-black/5 p-[2vw] w-[50vw]"
            initial={{ opacity: 0, scale: 0.9, rotateX: -10 }}
            animate={phase >= 4 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.9, rotateX: -10 }}
            transition={{ duration: 1, type: 'spring', bounce: 0.3 }}
          >
            {/* Chart mockup */}
            <div className="flex items-end gap-[1vw] h-[10vh] border-b-2 border-black/5 pb-[1vh]">
              {[30, 45, 60, 40, 80, 50, 70].map((h, i) => (
                <motion.div 
                  key={i} 
                  className={`flex-1 rounded-t-sm ${i === 4 ? 'bg-primary' : 'bg-black/10'}`}
                  initial={{ height: 0 }}
                  animate={phase >= 4 ? { height: `${h}%` } : { height: 0 }}
                  transition={{ duration: 0.8, delay: phase >= 4 ? i * 0.1 : 0, ease: 'circOut' }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-[1vh] font-mono text-[0.8vw] text-black/40">
              <span>2024</span>
              <span>2025</span>
              <span>2026</span>
              <span>2027</span>
              <span>2028</span>
              <span>2029</span>
              <span>2030</span>
            </div>
          </motion.div>
        </motion.div>

      </div>
    </motion.div>
  );
}
