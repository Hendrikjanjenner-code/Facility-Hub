import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';

import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

const SCENE_DURATIONS = {
  hook: 6000,
  platform: 6000,
  modules1: 10000,
  modules2: 10000,
  modules3: 10000,
  outro: 7000,
};

// Use LetShare4Gov's restrained cubic-bezier for all transitions
const customEase = [0.25, 1, 0.5, 1] as const;

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({
    durations: SCENE_DURATIONS,
  });

  return (
    <div
      className="w-full h-screen overflow-hidden relative font-body"
      style={{ backgroundColor: 'var(--ls4g-bg)', color: 'var(--ls4g-text)' }}
    >
      {/* Geometric Panel Background inspired by logo */}
      <motion.div
        className="absolute inset-0 z-0 flex items-center justify-center opacity-5 overflow-hidden"
      >
        <motion.div 
          className="absolute w-[120vw] h-[150vh] origin-center"
          animate={{ rotate: currentScene % 2 === 0 ? -15 : -10 }}
          transition={{ duration: 3, ease: customEase }}
        >
          {/* Panel 1 */}
          <motion.div
            className="absolute top-0 bottom-0 left-[20%] w-[15vw]"
            style={{ backgroundColor: 'var(--ls4g-dark)' }}
            animate={{ x: ['0vw', '5vw', '-5vw', '10vw', '0vw', '-10vw'][currentScene] }}
            transition={{ duration: 2.5, ease: customEase }}
          />
          {/* Panel 2 */}
          <motion.div
            className="absolute top-0 bottom-0 left-[35%] w-[20vw]"
            style={{ backgroundColor: 'var(--ls4g-blue)' }}
            animate={{ x: ['0vw', '-5vw', '5vw', '-10vw', '5vw', '10vw'][currentScene] }}
            transition={{ duration: 2.8, ease: customEase }}
          />
          {/* Panel 3 */}
          <motion.div
            className="absolute top-0 bottom-0 left-[55%] w-[10vw]"
            style={{ backgroundColor: 'var(--ls4g-blue-dark)' }}
            animate={{ x: ['0vw', '10vw', '-10vw', '0vw', '-5vw', '5vw'][currentScene] }}
            transition={{ duration: 3.1, ease: customEase }}
          />
        </motion.div>
      </motion.div>

      {/* Sidebar motif element (persists but changes width) */}
      <motion.div 
        className="absolute top-0 bottom-0 left-0 z-10 border-r"
        style={{ 
          backgroundColor: 'var(--ls4g-dark-surface)',
          borderColor: 'var(--ls4g-dark)'
        }}
        animate={{
          width: ['0vw', '100vw', '15vw', '15vw', '15vw', '0vw'][currentScene],
          opacity: currentScene === 0 || currentScene === 5 ? 0 : 1
        }}
        transition={{ duration: 1.2, ease: customEase }}
      >
        <motion.div 
          className="absolute top-[4vh] left-[3vw] flex flex-col gap-[2vh]"
          animate={{ opacity: (currentScene >= 2 && currentScene <= 4) ? 1 : 0 }}
          transition={{ delay: 0.5 }}
        >
          {/* Fake sidebar items */}
          <div className="w-[8vw] h-[1.5vh] rounded-sm mb-[2vh]" style={{ backgroundColor: 'var(--ls4g-blue-dark)' }} />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-[1vw]">
              <div className="w-[1.2vw] h-[1.2vw] rounded-sm opacity-50" style={{ backgroundColor: 'var(--ls4g-blue)' }} />
              <div className="w-[6vw] h-[1vh] rounded-sm opacity-20" style={{ backgroundColor: 'var(--ls4g-white)' }} />
            </div>
          ))}
        </motion.div>
      </motion.div>

      <div className="relative z-20 w-full h-full">
        <AnimatePresence mode="popLayout">
          {currentScene === 0 && <Scene1 key="hook" />}
          {currentScene === 1 && <Scene2 key="platform" />}
          {currentScene === 2 && <Scene3 key="modules1" />}
          {currentScene === 3 && <Scene4 key="modules2" />}
          {currentScene === 4 && <Scene5 key="modules3" />}
          {currentScene === 5 && <Scene6 key="outro" />}
        </AnimatePresence>
      </div>
    </div>
  );
}
