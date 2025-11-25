import React from 'react';
import { motion } from 'framer-motion';

interface DNALoaderProps {
  embedded?: boolean;
  text?: string;
}

export const DNALoader: React.FC<DNALoaderProps> = ({ 
  embedded = false, 
  text = "Initializing Core" 
}) => {
  // Generate particles for strands
  const particles = Array.from({ length: 15 });

  return (
    <motion.div
      className={`flex flex-col items-center justify-center ${
        embedded 
          ? 'absolute inset-0 z-50 bg-black/80 backdrop-blur-md' 
          : 'fixed inset-0 z-[100] bg-[#0a0a0c]'
      }`}
      initial={embedded ? { opacity: 0 } : undefined}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5, ease: "easeInOut" } }}
    >
      <div className="relative w-20 h-40 flex items-center justify-center scale-75 md:scale-100">
        <style>{`
          @keyframes moveStrand1 {
            0% { transform: translateX(-20px) scale(0.8); opacity: 0.5; z-index: 0; }
            25% { transform: translateX(0px) scale(1); opacity: 1; z-index: 10; }
            50% { transform: translateX(20px) scale(0.8); opacity: 0.5; z-index: 0; }
            75% { transform: translateX(0px) scale(0.6); opacity: 0.3; z-index: -10; }
            100% { transform: translateX(-20px) scale(0.8); opacity: 0.5; z-index: 0; }
          }
          @keyframes moveStrand2 {
             0% { transform: translateX(20px) scale(0.8); opacity: 0.5; z-index: 0; }
            25% { transform: translateX(0px) scale(0.6); opacity: 0.3; z-index: -10; }
            50% { transform: translateX(-20px) scale(0.8); opacity: 0.5; z-index: 0; }
            75% { transform: translateX(0px) scale(1); opacity: 1; z-index: 10; }
            100% { transform: translateX(20px) scale(0.8); opacity: 0.5; z-index: 0; }
          }
        `}</style>

        {/* Strand 1 (Blue) */}
        {particles.map((_, i) => (
          <div
            key={`s1-${i}`}
            className="absolute w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
            style={{
              top: `${i * 12}px`,
              animation: `moveStrand1 2s linear infinite`,
              animationDelay: `${-i * 0.15}s`
            }}
          />
        ))}

        {/* Strand 2 (Purple) */}
        {particles.map((_, i) => (
          <div
            key={`s2-${i}`}
            className="absolute w-3 h-3 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"
            style={{
              top: `${i * 12}px`,
              animation: `moveStrand2 2s linear infinite`,
              animationDelay: `${-i * 0.15}s`
            }}
          />
        ))}
      </div>
      
      <motion.p 
        className="mt-8 text-zinc-400 text-sm font-medium tracking-[0.2em] uppercase text-center px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {text}
      </motion.p>
    </motion.div>
  );
};