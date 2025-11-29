
import React from 'react';
import { motion } from 'framer-motion';

interface DNALoaderProps {
  embedded?: boolean;
  scanning?: boolean;
  text?: string;
}

export const DNALoader: React.FC<DNALoaderProps> = ({ 
  embedded = false, 
  scanning = false,
  text = "Initializing Core" 
}) => {
  const bgClass = scanning
    ? 'absolute inset-0 z-20 bg-black/80 backdrop-blur-md'
    : embedded
      ? 'absolute inset-0 z-50 bg-black/80 backdrop-blur-md'
      : 'fixed inset-0 z-[100] bg-[#0a0a0c]';

  const BlinkingSmileIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" />
      <motion.circle cx="9.5" cy="9.75" r="0.9" fill="currentColor" style={{ transformOrigin: 'center' }} animate={{ scaleY: [1, 0.15, 1, 1, 1, 1] }} transition={{ duration: 1.8, repeat: Infinity, times: [0, 0.12, 0.24, 0.5, 0.6, 1] }} />
      <motion.circle cx="14.5" cy="9.75" r="0.9" fill="currentColor" style={{ transformOrigin: 'center' }} animate={{ scaleY: [1, 1, 1, 1, 0.15, 1] }} transition={{ duration: 1.8, repeat: Infinity, times: [0, 0.5, 0.6, 0.72, 0.84, 1] }} />
      <path d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <motion.div
      className={`flex flex-col items-center justify-center ${bgClass}`}
      initial={embedded || scanning ? { opacity: 0 } : undefined}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeInOut' } }}
    >
      <BlinkingSmileIcon className="w-12 h-12 text-amber-400" />
      <motion.p 
        className="mt-6 text-zinc-300 text-sm font-medium text-center px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        {text}
      </motion.p>
    </motion.div>
  );
};
