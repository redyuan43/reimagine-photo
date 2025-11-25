
import React, { useMemo } from 'react';
import { motion, useTransform, MotionValue, useMotionValue } from 'framer-motion';

export type FloatingVariant = 'vertical' | 'circular' | 'figure8';

interface FloatingPhotoProps {
  src: string;
  size: string;
  initialPos: { x: string; y: string };
  parallax?: { x: MotionValue<number>; y: MotionValue<number>; factor: number };
  rotation: number;
  duration: number;
  delay?: number;
  blur?: boolean;
  startTime?: number;
  variant?: FloatingVariant;
}

// Inject styles once to avoid re-flow during renders
const ANIMATION_STYLES = `
  @keyframes float-vertical {
      0% { transform: translateY(0) rotate(0deg) scale(1); }
      50% { transform: translateY(-20px) rotate(2deg) scale(1.02); }
      100% { transform: translateY(0) rotate(0deg) scale(1); }
  }
  @keyframes float-circular {
      0% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(10px, -10px) rotate(1deg); }
      50% { transform: translate(0, -20px) rotate(0deg); }
      75% { transform: translate(-10px, -10px) rotate(-1deg); }
      100% { transform: translate(0, 0) rotate(0deg); }
  }
  @keyframes float-figure8 {
      0% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(15px, -10px) rotate(2deg); }
      50% { transform: translate(0, -20px) rotate(0deg); }
      75% { transform: translate(-15px, -10px) rotate(-2deg); }
      100% { transform: translate(0, 0) rotate(0deg); }
  }
`;

export const FloatingPhoto: React.FC<FloatingPhotoProps> = ({
  src,
  size,
  initialPos,
  parallax,
  rotation,
  duration,
  delay = 0,
  blur = false,
  startTime = Date.now(),
  variant = 'vertical'
}) => {
  // Calculate sync offset once and memoize it
  const syncDelay = useMemo(() => {
    const timeSinceStart = (Date.now() - startTime) / 1000;
    return delay - timeSinceStart;
  }, [startTime, delay]);

  const animName = `float-${variant}`;
  
  // Always call hooks unconditionally (React rules)
  const parallaxXTransform = useTransform(parallax?.x ?? useMotionValue(0), (v) => parallax ? v * (parallax.factor as number) : 0);
  const parallaxYTransform = useTransform(parallax?.y ?? useMotionValue(0), (v) => parallax ? v * (parallax.factor as number) : 0);

  return (
    <>
      {/* Render styles only if they don't exist (simple check or just always render in a way React handles well) 
          Putting it in a style tag with a distinct ID prevents duplication if handled manually, 
          but React handles deduplication of identical style tags reasonably well. 
          However, to be safe against "refresh" flicker, we rely on the classes being stable. 
      */}
      <style>{ANIMATION_STYLES}</style>

      <motion.div
        className={`absolute ${size}`}
        style={{
          left: initialPos.x,
          top: initialPos.y,
          x: parallaxXTransform,
          y: parallaxYTransform,
          opacity: blur ? 0.6 : 0.9,
          filter: blur ? 'blur(2px)' : 'none',
          zIndex: blur ? 0 : 10,
        }}
      >
        {/* Combined container with border and animation */}
        <div 
            className="w-full h-full relative rounded-2xl shadow-2xl overflow-hidden border-4 border-white bg-white"
            style={{
                animation: `${animName} ${duration}s ease-in-out infinite`,
                animationDelay: `${syncDelay}s`,
                transform: `rotate(${rotation}deg) translateZ(0)`,
                willChange: 'transform'
            }}
        >
            <img src={src} className="w-full h-full object-cover" alt="Floating decoration" draggable="false" />
            <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
        </div>
      </motion.div>
    </>
  );
};
