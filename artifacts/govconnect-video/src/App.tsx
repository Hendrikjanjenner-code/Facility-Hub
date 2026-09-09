import VideoTemplate from '@/components/video/VideoTemplate';
import { MotionConfig } from 'framer-motion';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <VideoTemplate />
    </MotionConfig>
  );
}
