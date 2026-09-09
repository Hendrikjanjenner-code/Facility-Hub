import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, ClipboardList } from 'lucide-react';

const customEase = [0.25, 1, 0.5, 1] as const;

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
      exit={{ opacity: 0, y: '-5vh' }}
      transition={{ duration: 0.8, ease: customEase }}
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
          transition={{ duration: 0.8, ease: customEase }}
        >
          <div className="flex items-center gap-[1.5vw] mb-[2vh]">
            <div className="p-[1.5vw] rounded-xl" style={{ backgroundColor: 'var(--ls4g-blue)', color: 'var(--ls4g-white)' }}>
              <Building2 className="w-[3vw] h-[3vw]" />
            </div>
            <h2 className="font-display font-semibold text-[3.5vw]" style={{ color: 'var(--ls4g-dark)' }}>
              Vastgoed & Gebouwbeheer
            </h2>
          </div>
          <p className="font-body text-[1.8vw] max-w-[40vw]" style={{ color: 'var(--ls4g-text-muted)' }}>
            Interactief vlekkenplan en waterdicht sleutelbeheer.
          </p>
          
          {/* UI Mockup snippet: Vlekkenplan / floorplan */}
          <motion.div 
            className="mt-[4vh] rounded-xl shadow-lg border p-[2vw] w-[50vw] h-[20vh] relative overflow-hidden"
            style={{ backgroundColor: 'var(--ls4g-white)', borderColor: 'var(--ls4g-border)' }}
            initial={{ opacity: 0, scale: 0.95, rotateX: 5 }}
            animate={phase >= 2 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.95, rotateX: 5 }}
            transition={{ duration: 1.2, ease: customEase }}
          >
            {/* Fake floorplan */}
            <div className="absolute inset-0 m-[2vw] border-2 rounded flex gap-[1vw] p-[1vw]" style={{ borderColor: 'var(--ls4g-border)' }}>
              <div className="flex-1 rounded flex items-center justify-center font-mono text-[1vw]" style={{ backgroundColor: 'var(--ls4g-bg)', border: '1px solid var(--ls4g-border)', color: 'var(--ls4g-text-muted)' }}>Zuidvleugel</div>
              <div className="flex-1 flex flex-col gap-[1vw]">
                <div className="flex-1 rounded flex items-center justify-center font-mono text-[1vw]" style={{ backgroundColor: 'var(--ls4g-bg)', border: '1px solid var(--ls4g-border)', color: 'var(--ls4g-text-muted)' }}>Vergader 1</div>
                <div className="flex-1 rounded flex items-center justify-center font-mono text-[1vw]" style={{ backgroundColor: 'var(--ls4g-bg)', border: '1px solid var(--ls4g-border)', color: 'var(--ls4g-text-muted)' }}>Kantine</div>
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
          transition={{ duration: 1, ease: customEase }}
        >
          <div className="flex items-center gap-[1.5vw] mb-[2vh]">
            <div className="p-[1.5vw] rounded-xl" style={{ backgroundColor: 'var(--ls4g-blue-dark)', color: 'var(--ls4g-white)' }}>
              <ClipboardList className="w-[3vw] h-[3vw]" />
            </div>
            <h2 className="font-display font-semibold text-[3.5vw]" style={{ color: 'var(--ls4g-dark)' }}>
              MJOP
            </h2>
          </div>
          <p className="font-body text-[1.8vw] max-w-[40vw]" style={{ color: 'var(--ls4g-text-muted)' }}>
            NEN 2767 conditiemeting en financiële scenarioplanning.
          </p>
          
          <motion.div 
            className="mt-[4vh] rounded-xl shadow-lg border p-[2vw] w-[50vw]"
            style={{ backgroundColor: 'var(--ls4g-white)', borderColor: 'var(--ls4g-border)' }}
            initial={{ opacity: 0, scale: 0.95, rotateX: -5 }}
            animate={phase >= 4 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.95, rotateX: -5 }}
            transition={{ duration: 1.2, ease: customEase }}
          >
            {/* Chart mockup */}
            <div className="flex items-end gap-[1vw] h-[10vh] border-b-2 pb-[1vh]" style={{ borderColor: 'var(--ls4g-border)' }}>
              {[30, 45, 60, 40, 80, 50, 70].map((h, i) => (
                <motion.div 
                  key={i} 
                  className="flex-1 rounded-t-sm"
                  style={{ backgroundColor: i === 4 ? 'var(--ls4g-blue)' : 'var(--ls4g-border)' }}
                  initial={{ height: 0 }}
                  animate={phase >= 4 ? { height: `${h}%` } : { height: 0 }}
                  transition={{ duration: 1, delay: phase >= 4 ? i * 0.1 : 0, ease: customEase }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-[1vh] font-mono text-[0.8vw]" style={{ color: 'var(--ls4g-text-muted)' }}>
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
