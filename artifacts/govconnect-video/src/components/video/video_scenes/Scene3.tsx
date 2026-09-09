import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Headphones, CalendarDays } from 'lucide-react';

const customEase = [0.25, 1, 0.5, 1] as const;

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
      exit={{ opacity: 0, y: '-5vh' }}
      transition={{ duration: 0.8, ease: customEase }}
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
          transition={{ duration: 0.8, ease: customEase }}
        >
          <div className="flex items-center gap-[1.5vw] mb-[2vh]">
            <div className="p-[1.5vw] rounded-xl" style={{ backgroundColor: 'var(--ls4g-blue)', color: 'var(--ls4g-white)' }}>
              <Headphones className="w-[3vw] h-[3vw]" />
            </div>
            <h2 className="font-display font-semibold text-[3.5vw]" style={{ color: 'var(--ls4g-dark)' }}>
              Servicedesk
            </h2>
          </div>
          <p className="font-body text-[1.8vw] max-w-[40vw]" style={{ color: 'var(--ls4g-text-muted)' }}>
            Slimme meldingen met automatische SLA-bewaking en routering.
          </p>
          
          {/* UI Mockup snippet */}
          <motion.div 
            className="mt-[4vh] rounded-xl shadow-lg border p-[2vw] w-[50vw]"
            style={{ backgroundColor: 'var(--ls4g-white)', borderColor: 'var(--ls4g-border)' }}
            initial={{ opacity: 0, scale: 0.95, rotateX: 5 }}
            animate={phase >= 2 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.95, rotateX: 5 }}
            transition={{ duration: 1.2, ease: customEase }}
          >
            <div className="flex justify-between items-center mb-[2vh] pb-[2vh] border-b" style={{ borderColor: 'var(--ls4g-border)' }}>
              <div className="font-semibold text-[1.2vw]" style={{ color: 'var(--ls4g-dark)' }}>Melding #8234 - Lekkage</div>
              <div className="px-[1vw] py-[0.5vh] rounded-full text-[1vw] font-semibold" style={{ backgroundColor: 'var(--ls4g-dark-surface)', color: 'var(--ls4g-white)' }}>
                SLA: 2 uur resterend
              </div>
            </div>
            <div className="w-[80%] h-[1vh] rounded-full mb-[1.5vh]" style={{ backgroundColor: 'var(--ls4g-border)' }} />
            <div className="w-[60%] h-[1vh] rounded-full" style={{ backgroundColor: 'var(--ls4g-border)' }} />
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
          transition={{ duration: 1, ease: customEase }}
        >
          <div className="flex items-center gap-[1.5vw] mb-[2vh]">
            <div className="p-[1.5vw] rounded-xl" style={{ backgroundColor: 'var(--ls4g-blue-dark)', color: 'var(--ls4g-white)' }}>
              <CalendarDays className="w-[3vw] h-[3vw]" />
            </div>
            <h2 className="font-display font-semibold text-[3.5vw]" style={{ color: 'var(--ls4g-dark)' }}>
              Reserveringen & werkplekken
            </h2>
          </div>
          <p className="font-body text-[1.8vw] max-w-[40vw]" style={{ color: 'var(--ls4g-text-muted)' }}>
            Visueel boeken op de plattegrond of via de app.
          </p>
          
          <motion.div 
            className="mt-[4vh] rounded-xl shadow-lg border p-[2vw] w-[50vw] flex gap-[2vw]"
            style={{ backgroundColor: 'var(--ls4g-white)', borderColor: 'var(--ls4g-border)' }}
            initial={{ opacity: 0, scale: 0.95, rotateX: -5 }}
            animate={phase >= 4 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.95, rotateX: -5 }}
            transition={{ duration: 1.2, ease: customEase }}
          >
            {/* Calendar grid mockup */}
            <div className="grid grid-cols-5 gap-[0.5vw] w-[20vw]">
              {[...Array(15)].map((_, i) => (
                <div key={i} className={`h-[3vw] rounded-md ${i === 7 || i === 12 ? '' : ''}`} style={{ backgroundColor: i === 7 || i === 12 ? 'var(--ls4g-blue)' : 'var(--ls4g-bg)' }} />
              ))}
            </div>
            <div className="flex-1 flex flex-col justify-center gap-[1.5vh]">
              <div className="w-[80%] h-[1.5vh] rounded-full" style={{ backgroundColor: 'var(--ls4g-border)' }} />
              <div className="w-[60%] h-[1.5vh] rounded-full" style={{ backgroundColor: 'var(--ls4g-bg)' }} />
              <div className="w-full h-[4vh] rounded-md mt-[1vh]" style={{ backgroundColor: 'var(--ls4g-blue)', opacity: 0.1 }} />
            </div>
          </motion.div>
        </motion.div>

      </div>
    </motion.div>
  );
}
