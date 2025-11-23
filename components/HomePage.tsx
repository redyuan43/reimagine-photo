import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, AnimatePresence } from 'framer-motion';
import { ArrowUpTrayIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { FloatingPhoto } from './FloatingPhoto';

interface HomePageProps {
  onFileUpload: (file: File) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onFileUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileUpload(file);
  };

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const smoothX = useSpring(mouseX, { stiffness: 40, damping: 30 });
  const smoothY = useSpring(mouseY, { stiffness: 40, damping: 30 });

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    mouseX.set((clientX - centerX) / centerX);
    mouseY.set((clientY - centerY) / centerY);
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden bg-white"
      onMouseMove={handleMouseMove}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files[0]) onFileUpload(e.dataTransfer.files[0]);
      }}
    >
      {/* Background: Floating Photos */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <FloatingPhoto
          src="https://picsum.photos/300/400?random=1"
          size="w-32 h-40 md:w-48 md:h-60"
          initialPos={{ x: '10%', y: '15%' }}
          parallax={{ x: smoothX, y: smoothY, factor: 40 }}
          rotation={-6}
          duration={12}
          delay={0}
        />
        <FloatingPhoto
          src="https://picsum.photos/400/300?random=2"
          size="w-40 h-28 md:w-64 md:h-44"
          initialPos={{ x: '80%', y: '75%' }}
          parallax={{ x: smoothX, y: smoothY, factor: 60 }}
          rotation={4}
          duration={15}
          delay={1}
        />
        <FloatingPhoto
          src="https://picsum.photos/300/300?random=3"
          size="w-24 h-24 md:w-40 md:h-40"
          initialPos={{ x: '15%', y: '80%' }}
          parallax={{ x: smoothX, y: smoothY, factor: 20 }}
          rotation={-12}
          duration={18}
          delay={2}
          blur={true}
        />
        <FloatingPhoto
          src="https://picsum.photos/300/350?random=4"
          size="w-28 h-36 md:w-44 md:h-56"
          initialPos={{ x: '85%', y: '20%' }}
          parallax={{ x: smoothX, y: smoothY, factor: 50 }}
          rotation={8}
          duration={14}
          delay={0.5}
        />
      </div>

      {/* Drag Mask */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-xl m-4 rounded-3xl border-2 border-blue-500 border-dashed"
          >
            <ArrowUpTrayIcon className="w-24 h-24 text-blue-600 animate-bounce" />
            <p className="text-3xl font-bold text-blue-600 mt-6">Release to Magic Edit</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <motion.div
        className="relative z-20 max-w-4xl mx-auto text-center px-4"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 border border-white/60 backdrop-blur-md shadow-sm mb-8"
          whileHover={{ scale: 1.05 }}
        >
          <SparklesIcon className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-medium bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Professional Studio
          </span>
        </motion.div>

        <h1 className="text-6xl md:text-8xl font-bold text-zinc-900 mb-8 tracking-tighter leading-tight">
          <span className="block">Reimagine Photos</span>
          <span className="block bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            With Intelligent Tech
          </span>
        </h1>

        <p className="text-xl text-zinc-500 font-light mb-12 max-w-2xl mx-auto leading-relaxed">
          Experience next-generation photo retouching with professional models.
          <br className="hidden md:block" />
          4K Upscaling. High-Fidelity Editing. Instant Magic.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <motion.button
            onClick={() => fileInputRef.current?.click()}
            whileHover={{ scale: 1.02, boxShadow: '0 20px 40px -10px rgba(79, 70, 229, 0.3)' }}
            whileTap={{ scale: 0.98 }}
            className="group relative w-full sm:w-auto min-w-[200px] h-16 bg-zinc-900 text-white rounded-2xl font-medium text-lg overflow-hidden shadow-xl transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center justify-center gap-3">
              <ArrowUpTrayIcon className="w-6 h-6" />
              <span>Upload Photo</span>
            </div>
          </motion.button>

          <p className="text-sm text-zinc-400 mt-4 sm:mt-0 sm:ml-4">
            Supports JPG, PNG, WEBP, RAW
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept="image/*,.heic,.heif,.dng,.cr2,.cr3,.nef,.arw,.orf,.rw2,.raf,.sr2"
        />
      </motion.div>
    </div>
  );
};