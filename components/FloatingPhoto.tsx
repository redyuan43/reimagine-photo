import React from 'react';
import { motion, useTransform, MotionValue } from 'framer-motion';

interface FloatingPhotoProps {
  src: string;
  size: string;
  initialPos: { x: string; y: string };
  parallax?: { x: MotionValue<number>; y: MotionValue<number>; factor: number };
  rotation: number;
  duration: number;
  delay?: number;
  blur?: boolean;
}

export const FloatingPhoto: React.FC<FloatingPhotoProps> = ({
  src,
  size,
  initialPos,
  parallax,
  rotation,
  duration,
  delay = 0,
  blur = false
}) => {
  return (
    <motion.div
      className={`absolute rounded-2xl shadow-2xl overflow-hidden border-4 border-white bg-white ${size}`}
      style={{
        left: initialPos.x,
        top: initialPos.y,
        x: parallax ? useTransform(parallax.x, (v) => v * parallax.factor) : 0,
        y: parallax ? useTransform(parallax.y, (v) => v * parallax.factor) : 0,
        opacity: blur ? 0.6 : 0.9,
        filter: blur ? 'blur(2px)' : 'none',
        zIndex: blur ? 0 : 10,
      }}
      animate={{
        y: [0, -20, 0],
        rotate: [rotation - 2, rotation + 2, rotation - 2],
        scale: [1, 1.02, 1],
      }}
      transition={{
        duration: duration,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: delay,
      }}
    >
      <img src={src} className="w-full h-full object-cover" alt="Floating decoration" draggable="false" />
      <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
    </motion.div>
  );
};
