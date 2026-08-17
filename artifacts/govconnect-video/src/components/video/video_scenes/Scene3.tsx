import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Headphones, CalendarDays } from 'lucide-react';

export function Scene3() {
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
        
        {/* Module 1: Servicedesk */}
        <motion.div
          className="absolute top-[15vh] w-full"
          initial={{ opacity: 0, y: '5vh' }}
          animate={
            phase >= 3 ? { opacity: 0.2, y: '-2vh', scale: 0.95 } : // fade back when second module appears
            phase >= 1 ? { opacity: 1, y: 0, scale: 1 } : 
            { opacity: 0, y: '5vh' }
          }
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-[1.5vw] mb-[2vh]">
            <div className="bg-primary/10 p-[1.5vw] rounded-xl text-primary">
              <Headphones className="w-[3vw] h-[3vw]" />
            </div>
            <h2 className="font-display font-bold text-[3.5vw] text-sidebar">
              Servicedesk
            </h2>
          </div>
          <p className="font-body text-[1.8vw] text-sidebar-muted/70 max-w-[40vw]">
            Slimme meldingen met automatische SLA-bewaking en routering.
          </p>
          
          {/* UI Mockup snippet */}
          <motion.div 
            className="mt-[4vh] bg-white rounded-xl shadow-xl border border-black/5 p-[2vw] w-[50vw]"
            initial={{ opacity: 0, scale: 0.9, rotateX: 10 }}
            animate={phase >= 2 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.9, rotateX: 10 }}
            transition={{ duration: 1, type: 'spring', bounce: 0.3 }}
          >
            <div className="flex justify-between items-center mb-[2vh] pb-[2vh] border-b border-black/5">
              <div className="font-bold text-[1.2vw]">Melding #8234 - Lekkage</div>
              <div className="bg-red-100 text-red-700 px-[1vw] py-[0.5vh] rounded-full text-[1vw] font-bold">
                SLA: 2 uur resterend
              </div>
            </div>
            <div className="w-[80%] h-[1vh] bg-black/5 rounded-full mb-[1.5vh]" />
            <div className="w-[60%] h-[1vh] bg-black/5 rounded-full" />
          </motion.div>
        </motion.div>

        {/* Module 2: Reserveringen & werkplekken */}
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
              <CalendarDays className="w-[3vw] h-[3vw]" />
            </div>
            <h2 className="font-display font-bold text-[3.5vw] text-sidebar">
              Reserveringen & werkplekken
            </h2>
          </div>
          <p className="font-body text-[1.8vw] text-sidebar-muted/70 max-w-[40vw]">
            Visueel boeken op de plattegrond of via de app.
          </p>
          
          <motion.div 
            className="mt-[4vh] bg-white rounded-xl shadow-xl border border-black/5 p-[2vw] w-[50vw] flex gap-[2vw]"
            initial={{ opacity: 0, scale: 0.9, rotateX: -10 }}
            animate={phase >= 4 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.9, rotateX: -10 }}
            transition={{ duration: 1, type: 'spring', bounce: 0.3 }}
          >
            {/* Calendar grid mockup */}
            <div className="grid grid-cols-5 gap-[0.5vw] w-[20vw]">
              {[...Array(15)].map((_, i) => (
                <div key={i} className={`h-[3vw] rounded-md ${i === 7 || i === 12 ? 'bg-primary' : 'bg-black/5'}`} />
              ))}
            </div>
            <div className="flex-1 flex flex-col justify-center gap-[1.5vh]">
              <div className="w-[80%] h-[1.5vh] bg-black/10 rounded-full" />
              <div className="w-[60%] h-[1.5vh] bg-black/5 rounded-full" />
              <div className="w-full h-[4vh] bg-primary/10 rounded-md mt-[1vh] border border-primary/20" />
            </div>
          </motion.div>
        </motion.div>

      </div>
    </motion.div>
  );
}
