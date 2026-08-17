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

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({
    durations: SCENE_DURATIONS,
  });

  return (
    <div
      className="w-full h-screen overflow-hidden relative font-body text-text-primary"
      style={{ backgroundColor: 'var(--color-bg-light)' }}
    >
      {/* Persistent Grid Background */}
      <motion.div
        className="absolute inset-0 z-0 opacity-40"
        style={{
          backgroundImage: 'linear-gradient(var(--color-sidebar-muted) 1px, transparent 1px), linear-gradient(90deg, var(--color-sidebar-muted) 1px, transparent 1px)',
          backgroundSize: '4vw 4vw',
          opacity: 0.05
        }}
        animate={{ backgroundPosition: ['0vw 0vw', '4vw 4vw'] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
      />
      
      {/* Dynamic Accent / Background Shape */}
      <motion.div
        className="absolute z-0 rounded-full blur-3xl opacity-30"
        style={{ backgroundColor: 'var(--color-primary)' }}
        animate={{
          x: ['-20vw', '50vw', '70vw', '20vw', '80vw', '30vw'][currentScene],
          y: ['-20vh', '30vh', '-10vh', '60vh', '10vh', '40vh'][currentScene],
          width: ['60vw', '80vw', '50vw', '60vw', '70vw', '50vw'][currentScene],
          height: ['60vw', '80vw', '50vw', '60vw', '70vw', '50vw'][currentScene],
        }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Sidebar motif element (persists but changes width) */}
      <motion.div 
        className="absolute top-0 bottom-0 left-0 z-10 shadow-2xl"
        style={{ backgroundColor: 'var(--color-sidebar)' }}
        animate={{
          width: ['0vw', '100vw', '15vw', '15vw', '15vw', '0vw'][currentScene],
          opacity: currentScene === 0 || currentScene === 5 ? 0 : 1
        }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div 
          className="absolute top-[4vh] left-[3vw] flex flex-col gap-[2vh]"
          animate={{ opacity: (currentScene >= 2 && currentScene <= 4) ? 1 : 0 }}
          transition={{ delay: 0.5 }}
        >
          {/* Fake sidebar items */}
          <div className="w-[8vw] h-[1.5vh] bg-white/10 rounded-sm mb-[2vh]" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-[1vw]">
              <div className="w-[1.2vw] h-[1.2vw] bg-white/20 rounded-sm" />
              <div className="w-[6vw] h-[1vh] bg-white/10 rounded-sm" />
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
