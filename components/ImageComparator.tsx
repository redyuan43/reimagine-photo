import React, { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { ChevronDoubleRightIcon } from '@heroicons/react/24/outline';

interface ImageComparatorProps {
  originalImage: string | null;
  modifiedImage: string | null;
  enableSlider?: boolean;
}

export const ImageComparator: React.FC<ImageComparatorProps> = ({
  originalImage,
  modifiedImage,
  enableSlider = false,
}) => {
  const [width, setWidth] = useState(0);
  const x = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const w = containerRef.current.offsetWidth;
      setWidth(w);
      x.set(enableSlider ? w / 2 : 0);
    }
  }, [x, enableSlider]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full max-w-4xl max-h-[80vh] select-none group ${
        enableSlider ? 'cursor-ew-resize' : ''
      }`}
      onPointerMove={(e) => {
        if (!enableSlider || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const newX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        x.set(newX);
      }}
    >
      {/* Bottom Image (Modified) */}
      {modifiedImage && (
        <img
          src={modifiedImage}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          alt="Modified"
        />
      )}
      {enableSlider && (
        <div className="absolute top-4 right-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-white text-xs font-medium border border-white/20">
          After
        </div>
      )}

      {/* Top Image (Original) - Clipped */}
      <motion.div
        className="absolute inset-0 w-full h-full overflow-hidden"
        style={{
          clipPath: useTransform(x, (val) =>
            enableSlider ? `inset(0 ${width - val}px 0 0)` : `inset(0 ${width}px 0 0)`
          ),
        }}
      >
        {originalImage && (
          <img
            src={originalImage}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            alt="Original"
          />
        )}
        {enableSlider && (
          <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-white text-xs font-medium border border-white/20">
            Before
          </div>
        )}
      </motion.div>

      {/* Slider Handle */}
      {enableSlider && (
        <motion.div
          className="absolute top-0 bottom-0 w-0.5 bg-white cursor-ew-resize shadow-[0_0_10px_rgba(0,0,0,0.3)] z-10"
          style={{ x }}
        >
          <div className="absolute top-1/2 -left-4 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center transform -translate-y-1/2">
            <div className="flex gap-0.5">
              <ChevronDoubleRightIcon className="w-4 h-4 text-zinc-400 rotate-180" />
              <ChevronDoubleRightIcon className="w-4 h-4 text-zinc-400" />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
