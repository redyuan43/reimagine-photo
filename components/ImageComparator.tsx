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
  const widthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  // Observe container size to keep slider aligned when layout changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      const newW = Math.max(0, rect.width);
      const prevW = widthRef.current;
      widthRef.current = newW;
      setWidth(newW);
      // Preserve slider position as a percentage when width changes
      const prevX = x.get();
      const ratio = prevW > 0 ? prevX / prevW : 0.5;
      const nextX = enableSlider ? Math.max(0, Math.min(newW, ratio * newW)) : 0;
      x.set(nextX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [enableSlider]);

  // Clamp x while dragging within current bounds

  // Handle Drag Events
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      // Calculate X relative to container, clamped within bounds
      const newX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      x.set(newX);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, x]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none group bg-zinc-900"
    >
      {/* Bottom Image (Modified) */}
      {modifiedImage && (
        <img
          src={modifiedImage}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          alt="Modified"
        />
      )}
      {enableSlider && (
        <div className="absolute top-4 right-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-white text-xs font-medium border border-white/20 pointer-events-none">
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
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            alt="Original"
          />
        )}
        {enableSlider && (
          <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-white text-xs font-medium border border-white/20 pointer-events-none">
            Before
          </div>
        )}
      </motion.div>

      {/* Slider Handle */}
      {enableSlider && (
        <motion.div
          className="absolute top-0 bottom-0 w-0.5 bg-white cursor-ew-resize shadow-[0_0_10px_rgba(0,0,0,0.3)] z-10 touch-none"
          style={{ x }}
          onPointerDown={(e) => {
            setIsDragging(true);
            e.preventDefault(); // Prevent text selection or default touch actions
            e.stopPropagation();
          }}
        >
          {/* Handle Icon */}
          <div className="absolute top-1/2 -left-4 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center transform -translate-y-1/2 cursor-ew-resize hover:scale-110 transition-transform">
            <div className="flex gap-0.5 pointer-events-none">
              <ChevronDoubleRightIcon className="w-4 h-4 text-zinc-400 rotate-180" />
              <ChevronDoubleRightIcon className="w-4 h-4 text-zinc-400" />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
