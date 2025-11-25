import React, { useRef, useState, useMemo } from 'react';
import { motion, useMotionValue, useSpring, AnimatePresence } from 'framer-motion';
import { PhotoIcon, PaperAirplaneIcon, SparklesIcon, MoonIcon, SunIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { FloatingPhoto } from './FloatingPhoto';

interface HomePageProps {
  onStart: (file: File, prompt: string) => void;
  lang: 'zh' | 'en';
  setLang: (lang: 'zh' | 'en') => void;
}

// Generate stable rain systems config
const generateRainSystems = () => Array.from({ length: 60 }).map(() => ({
  left: Math.random() * 100,
  depth: Math.random() * 15,
  delay: -Math.random() * 10, // Negative delay = Start in progress
  duration: 1.2 + Math.random() * 0.8,
  scale: 0.5 + Math.random() * 0.5
}));

export const HomePage: React.FC<HomePageProps> = ({ onStart, lang, setLang }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Theme State
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [transitionMode, setTransitionMode] = useState<'light' | 'dark' | null>(null);
  const [rippleOrigin, setRippleOrigin] = useState({ x: 0, y: 0 });

  // Input State
  const [promptText, setPromptText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  // Global Start Time for Syncing Rain & Floating Photos across layers
  const [startTime] = useState(Date.now());
  
  // Memoize rain systems at the top level so they are identical across renders/layers
  const rainSystems = useMemo(() => generateRainSystems(), []);

  // Translation Dictionary
  const t = useMemo(() => ({
    en: {
      badge: 'Professional Studio',
      h1a: 'Reimagine Photos',
      h1b: 'With Intelligent Tech',
      sub: 'Experience next-generation photo retouching with professional models.\n4K Upscaling. High-Fidelity Editing. Instant Magic.',
      dragTip: 'Release to Magic Edit',
      describePlaceholder: 'Describe your idea...',
      example: 'Example',
      examplePrompt: 'Remove the background and add a neon glow',
      supports: 'Supports JPG, PNG, WEBP, RAW'
    },
    zh: {
      badge: '专业工作室',
      h1a: '重想照片',
      h1b: '由智能科技加持',
      sub: '使用专业模型体验下一代照片润饰。\n4K超分、高清编辑、即时魔法。',
      dragTip: '松开以魔法编辑',
      describePlaceholder: '描述你的想法...',
      example: '示例',
      examplePrompt: '封面标题“幕布日记”，丝绒幕布配暖色聚光与居中衬线字',
      supports: '支持 JPG、PNG、WEBP、RAW'
    },
  }), []);

  const dict = t[lang];

  // Drag & Drop State
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // Mouse Parallax
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

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onStart(e.dataTransfer.files[0], promptText);
      e.dataTransfer.clearData();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setSelectedFile(file);
        setFilePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = () => {
      if (selectedFile) {
          onStart(selectedFile, promptText);
      } else {
          // Trigger file select if no file yet
          fileInputRef.current?.click();
      }
  };

  const handleIconClick = () => {
      fileInputRef.current?.click();
  };

  // Theme Toggle Logic with Ripple
  const toggleTheme = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    setRippleOrigin({ x, y });
    setTransitionMode(mode === 'light' ? 'dark' : 'light');
  };

  const finishTransition = () => {
    if (transitionMode) {
      setMode(transitionMode);
      setTransitionMode(null);
    }
  };

  // Helper to render the full UI content
  const renderContent = (theme: 'light' | 'dark', isOverlay = false) => {
    const isDarkTheme = theme === 'dark';
    const subTextClass = isDarkTheme ? 'text-zinc-400' : 'text-zinc-600';
    
    const animInitial = isOverlay ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 };
    const animAnimate = { opacity: 1, y: 0 };

    return (
      <div
        className={`min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden ${
          isDarkTheme ? 'bg-[#0a0a0c] text-zinc-100' : 'bg-[#FDFDFE] text-zinc-900'
        }`}
      >
        {/* --- Top Right Controls --- */}
        <div className="fixed top-6 right-6 z-40 flex items-center gap-3">
          <div className={`flex items-center p-1.5 rounded-full border shadow-sm backdrop-blur-md transition-colors ${isDarkTheme ? 'bg-zinc-800/40 border-zinc-700' : 'bg-white/60 border-zinc-200'}`}>
            <button
                onClick={toggleTheme}
                className={`p-2 rounded-full transition-all duration-300 relative overflow-hidden ${isDarkTheme ? 'bg-zinc-700 text-yellow-300' : 'bg-orange-100 text-orange-500'}`}
            >
                <AnimatePresence mode="wait" initial={false}>
                    {isDarkTheme ? (
                        <motion.div key="moon" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                            <MoonIcon className="w-5 h-5" />
                        </motion.div>
                    ) : (
                        <motion.div key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                            <SunIcon className="w-5 h-5" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </button>
            <div className={`w-px h-4 mx-2 ${isDarkTheme ? 'bg-zinc-700' : 'bg-zinc-300'}`}></div>
            <button
                onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all duration-300 ${
                    isDarkTheme ? 'text-zinc-300 hover:bg-zinc-700' : 'text-zinc-600 hover:bg-zinc-100'
                }`}
            >
                {lang === 'zh' ? '中' : 'EN'}
            </button>
          </div>
        </div>

        {/* --- Rain Effect --- */}
        <RainOverlay dark={isDarkTheme} startTime={startTime} systems={rainSystems} />

        {/* --- Background Floating Photos --- */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <FloatingPhoto src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80" size="w-32 h-40 md:w-48 md:h-60" initialPos={{ x: '10%', y: '15%' }} parallax={{ x: smoothX, y: smoothY, factor: 40 }} rotation={-6} duration={12} delay={0} startTime={startTime} variant="vertical" />
            <FloatingPhoto src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=400&q=80" size="w-40 h-28 md:w-64 md:h-44" initialPos={{ x: '80%', y: '75%' }} parallax={{ x: smoothX, y: smoothY, factor: -60 }} rotation={4} duration={15} delay={1} startTime={startTime} variant="circular" />
            <FloatingPhoto src="https://images.unsplash.com/photo-1518098268026-4e1816a46545?auto=format&fit=crop&w=300&q=80" size="w-24 h-24 md:w-40 md:h-40" initialPos={{ x: '15%', y: '80%' }} parallax={{ x: smoothX, y: smoothY, factor: 20 }} rotation={-12} duration={18} delay={2} blur={true} startTime={startTime} variant="figure8" />
            <FloatingPhoto src="https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=300&q=80" size="w-28 h-36 md:w-44 md:h-56" initialPos={{ x: '85%', y: '20%' }} parallax={{ x: smoothX, y: smoothY, factor: -50 }} rotation={8} duration={14} delay={0.5} startTime={startTime} variant="circular" />
        </div>

        {/* --- Drag Overlay --- */}
        <AnimatePresence>
            {isDragging && (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`absolute inset-0 z-50 flex flex-col items-center justify-center ${isDarkTheme ? 'bg-zinc-900/90' : 'bg-white/90'} backdrop-blur-xl m-4 rounded-3xl border-2 border-blue-500 border-dashed`}
            >
                <ArrowUpTrayIcon className="w-24 h-24 text-blue-600 animate-bounce" />
                <p className="text-3xl font-bold text-blue-600 mt-6">{dict.dragTip}</p>
            </motion.div>
            )}
        </AnimatePresence>

        {/* --- Main Content --- */}
        <motion.div
            className="relative z-20 max-w-3xl mx-auto text-center px-4 w-full"
            initial={animInitial}
            animate={animAnimate}
            transition={{ duration: 0.8, ease: 'easeOut' }}
        >
            <motion.div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-md shadow-sm mb-8 transition-colors duration-500 ${isDarkTheme ? 'bg-zinc-800/60 border-zinc-700' : 'bg-white/60 border-white/60'}`} whileHover={{ scale: 1.05 }}>
                <SparklesIcon className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-medium bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-transparent">{dict.badge}</span>
            </motion.div>

            <h1 className="text-6xl md:text-8xl font-bold mb-8 tracking-tighter leading-tight drop-shadow-sm">
                <span className="block">{dict.h1a}</span>
                <span className="block bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent pb-2">{dict.h1b}</span>
            </h1>

            <p className={`text-xl ${subTextClass} font-light mb-12 max-w-2xl mx-auto leading-relaxed`}>
                {dict.sub.split('\n')[0]}<br className="hidden md:block" />{dict.sub.split('\n')[1]}
            </p>

            {/* --- New Input Bar --- */}
            <div className="flex flex-col items-center gap-4 w-full">
                <motion.div 
                    className={`relative w-full max-w-xl flex items-center gap-2 p-2 rounded-full shadow-2xl border transition-all duration-300 z-30 ${
                        isDarkTheme ? 'bg-[#1E1E1E] border-zinc-700' : 'bg-white border-gray-200'
                    }`}
                    whileHover={{ scale: 1.01 }}
                >
                    {/* Upload Icon / File Preview */}
                    <button 
                        onClick={handleIconClick}
                        className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-colors overflow-hidden ${
                            selectedFile 
                                ? 'bg-zinc-900 border border-zinc-600' 
                                : (isDarkTheme ? 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700' : 'bg-gray-100 text-gray-500 hover:text-black hover:bg-gray-200')
                        }`}
                        title="Upload Photo"
                    >
                        {filePreview ? (
                            <img src={filePreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <PhotoIcon className="w-5 h-5" />
                        )}
                    </button>

                    {/* Text Input */}
                    <input 
                        type="text" 
                        value={promptText}
                        onChange={(e) => setPromptText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                        placeholder={dict.describePlaceholder}
                        className={`flex-1 bg-transparent border-none outline-none text-sm px-2 ${
                            isDarkTheme ? 'text-white placeholder-zinc-500' : 'text-gray-900 placeholder-gray-400'
                        }`}
                    />

                    {/* Send Button */}
                    <button 
                        onClick={handleSubmit}
                        className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-transform hover:scale-105 ${
                            selectedFile ? 'bg-white text-black shadow-md' : (isDarkTheme ? 'bg-zinc-700 text-zinc-500' : 'bg-gray-200 text-gray-400')
                        }`}
                        disabled={!selectedFile && !promptText}
                    >
                        <PaperAirplaneIcon className="w-5 h-5 -ml-0.5" />
                    </button>
                </motion.div>

                {/* Helper Text / Examples */}
                <div className={`flex flex-col md:flex-row items-center gap-2 text-xs ${isDarkTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    <span className="font-medium bg-zinc-800/50 px-2 py-0.5 rounded text-zinc-400">{dict.example}</span>
                    <span className="cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => setPromptText(dict.examplePrompt)}>
                        {dict.examplePrompt}
                    </span>
                </div>
            </div>

            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/*,.heic,.heif,.dng,.cr2,.cr3,.nef,.arw,.orf,.rw2,.raf,.sr2" />
        </motion.div>
      </div>
    );
  };

  return (
    <div className="relative w-full min-h-screen overflow-hidden" onMouseMove={handleMouseMove} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      {renderContent(mode)}
      {transitionMode && (
        <motion.div key="ripple-overlay" className="absolute inset-0 z-50 overflow-hidden pointer-events-none" initial={{ clipPath: `circle(0px at ${rippleOrigin.x}px ${rippleOrigin.y}px)` }} animate={{ clipPath: `circle(150% at ${rippleOrigin.x}px ${rippleOrigin.y}px)` }} transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }} onAnimationComplete={finishTransition}>
          {renderContent(transitionMode, true)}
        </motion.div>
      )}
    </div>
  );
};

// --- Synchronized Rain System ---
interface RainOverlayProps { dark?: boolean; startTime: number; systems: { left: number; depth: number; delay: number; duration: number; scale: number }[]; }
const RainOverlay: React.FC<RainOverlayProps> = ({ dark, startTime, systems }) => {
  const rgb = dark ? '255, 255, 255' : '124, 58, 237';
  const syncOffset = useMemo(() => { const mountTime = Date.now(); return (mountTime - startTime) / 1000; }, [startTime]);
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <style>{`@keyframes dropFall { 0% { transform: translateY(-120vh); opacity: 0; } 5% { opacity: ${dark ? 0.3 : 0.6}; } 70% { transform: translateY(0); opacity: ${dark ? 0.3 : 0.6}; } 71% { opacity: 0; } 100% { transform: translateY(0); opacity: 0; } } @keyframes splashPop { 0% { opacity: 0; transform: scale(0) rotateX(70deg); } 70% { opacity: 0; transform: scale(0) rotateX(70deg); } 71% { opacity: 1; transform: scale(0.5) rotateX(70deg); } 90% { opacity: 0; transform: scale(2) rotateX(70deg); } 100% { opacity: 0; transform: scale(2) rotateX(70deg); } }`}</style>
      {systems.map((sys, idx) => {
         const effectiveDelay = sys.delay - syncOffset;
         return (
            <div key={`rain-${idx}`} style={{ position: 'absolute', left: `${sys.left}%`, bottom: `${sys.depth}%`, width: '0', height: '0', zIndex: Math.floor(sys.depth), transform: `scale(${sys.scale})` }}>
                <div style={{ position: 'absolute', left: '0', bottom: '0', width: '1px', height: '15vh', background: `linear-gradient(to bottom, transparent, rgba(${rgb}, 0.5))`, animation: `dropFall ${sys.duration}s linear infinite`, animationDelay: `${effectiveDelay}s` }} />
                <div style={{ position: 'absolute', left: '-15px', bottom: '-10px', width: '30px', height: '30px', borderRadius: '50%', border: `2px solid rgba(${rgb}, 0.3)`, boxShadow: `0 0 0 4px rgba(${rgb}, 0.1)`, animation: `splashPop ${sys.duration}s ease-out infinite`, animationDelay: `${effectiveDelay}s` }} />
            </div>
         );
      })}
    </div>
  );
};