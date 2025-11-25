
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhotoIcon, PaperAirplaneIcon, SparklesIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

interface HomePageProps {
  onStart: (file: File, prompt: string) => void;
  lang: 'zh' | 'en';
  setLang: (lang: 'zh' | 'en') => void;
}

// --- CONSTANTS ---
const COLOR_NIGHT = '#050505';
const COLOR_DAY = '#87CEEB';

export const HomePage: React.FC<HomePageProps> = ({ onStart, lang, setLang }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transitionLayerRef = useRef<HTMLDivElement>(null);
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- STATE ---
  const [isNight, setIsNight] = useState(true);
  const isNightRef = useRef(true); // Ref for animation loop access
  const [promptText, setPromptText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // --- TRANSLATION ---
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

  // --- CANVAS ENGINE ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    
    let animationFrameId: number;
    
    // Mouse State
    let mouse = { x: -1000, y: -1000, vx: 0, vy: 0 };
    let lastMouse = { x: -1000, y: -1000 };

    // Entities
    let backgroundObjects: any[] = [];
    let flyingObjects: any[] = [];
    let particles: any[] = [];

    // --- CLASSES ---

    class BgObject {
        x: number = 0;
        y: number = 0;
        size: number = 0;
        baseSize: number = 0;
        maxOpacity: number = 0;
        opacity: number = 0;
        twinkleSpeed: number = 0;
        color: string = '255, 255, 255';
        glow: number = 0;
        pulsePhase: number = 0;

        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            if (isNightRef.current) {
                this.size = Math.random() * 1.5;
                this.baseSize = this.size; 
                this.maxOpacity = Math.random() * 0.8 + 0.2; 
                this.opacity = this.maxOpacity;
                this.twinkleSpeed = Math.random() * 0.02 + 0.005;
                this.color = '255, 255, 255';
                this.glow = 0; 
                this.pulsePhase = Math.random() * Math.PI * 2;
            }
        }
        draw(ctx: CanvasRenderingContext2D) {
            if (isNightRef.current) {
                const dx = this.x - mouse.x;
                const dy = this.y - mouse.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const triggerRange = 20; 
                
                if (dist < triggerRange) {
                    const speed = Math.sqrt(mouse.vx * mouse.vx + mouse.vy * mouse.vy);
                    const force = Math.min(speed * 0.2, 1.0) * (1 - dist / triggerRange);
                    this.glow += force * 0.8; 
                }
                if (this.glow > 1) this.glow = 1;
                if (this.glow > 0) {
                    this.glow -= 0.02;
                    if (this.glow < 0) this.glow = 0;
                }

                this.opacity += this.twinkleSpeed;
                if (this.opacity > 1 || this.opacity < 0.2) this.twinkleSpeed = -this.twinkleSpeed;

                let pulse = 1;
                if (this.glow > 0) {
                    pulse = 1 + Math.sin(Date.now() * 0.02 + this.pulsePhase) * 0.2 * this.glow;
                }

                const finalOpacity = Math.min(1, (this.opacity + this.glow * 1.8) * pulse); 
                const currentSize = (this.baseSize + (this.glow * 3.0)) * pulse;

                ctx.fillStyle = `rgba(${this.color}, ${finalOpacity})`;
                ctx.beginPath();
                ctx.arc(this.x, this.y, currentSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    class Flyer {
        mode: 'meteor' | 'sakura';
        x: number = 0; y: number = 0;
        vx: number = 0; vy: number = 0;
        len: number = 0; speed: number = 0; size: number = 0; angle: number = 0;
        life: number = 0; maxLife: number = 0;
        speedY: number = 0; speedX: number = 0; sway: number = 0; swayAmp: number = 0;
        rotation: number = 0; rotationSpeed: number = 0; flip: number = 0; flipSpeed: number = 0;
        color: string = ''; windVx: number = 0; windVy: number = 0;

        constructor() {
            this.mode = isNightRef.current ? 'meteor' : 'sakura';
            this.reset();
        }

        reset() {
            if (this.mode === 'meteor') {
                if (Math.random() < 0.5) {
                    this.x = Math.random() * width * 1.5 - width * 0.2; 
                    this.y = -150; 
                } else {
                    this.x = width + 150; 
                    this.y = Math.random() * height * 0.8; 
                }
                this.len = Math.random() * 80 + 200;
                this.speed = Math.random() * 4 + 8;
                this.size = Math.random() * 1 + 0.5;
                const angleBase = Math.PI * 0.75; 
                this.angle = angleBase + (Math.random() - 0.5) * 0.3;
                this.vx = Math.cos(this.angle) * this.speed;
                this.vy = Math.sin(this.angle) * this.speed;
                this.life = 0;
                this.maxLife = Math.random() * 50 + 80;
            } else {
                this.x = Math.random() * width;
                this.y = -30; 
                this.size = Math.random() * 5 + 4; 
                this.speedY = Math.random() * 0.7 + 0.8; 
                this.speedX = Math.random() * 0.2 - 0.1; 
                this.sway = Math.random() * 0.005 + 0.002; 
                this.swayAmp = Math.random() * 1.0 + 0.5; 
                this.rotation = Math.random() * Math.PI * 2;
                this.rotationSpeed = (Math.random() - 0.5) * 0.008; 
                this.flip = Math.random() * Math.PI; 
                this.flipSpeed = Math.random() * 0.008 + 0.002; 

                const red = 255;
                const green = Math.floor(Math.random() * 50 + 180); 
                const blue = Math.floor(Math.random() * 50 + 190);  
                this.color = `rgba(${red}, ${green}, ${blue}, ${Math.random() * 0.4 + 0.6})`;
                this.windVx = 0;
                this.windVy = 0;
            }
        }

        update() {
            if (this.mode === 'meteor') {
                this.x += this.vx;
                this.y += this.vy;
                this.life++;
            } else {
                const dx = this.x - mouse.x;
                const dy = this.y - mouse.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const influenceRadius = 150;

                if (dist < influenceRadius) {
                    const force = (influenceRadius - dist) / influenceRadius;
                    this.windVx += mouse.vx * force * 0.05;
                    this.windVy += mouse.vy * force * 0.05;
                }

                this.windVx *= 0.95;
                this.windVy *= 0.95;

                this.y += this.speedY + this.windVy; 
                this.x += this.speedX + Math.sin(this.y * this.sway) * this.swayAmp + this.windVx; 
                this.rotation += this.rotationSpeed;
                this.flip += this.flipSpeed;
            }
        }

        checkStatus() {
            if (this.mode === 'meteor') {
                const hitEdge = this.y >= height || this.x <= 0;
                const burnedOut = this.life >= this.maxLife;
                if (hitEdge) {
                    let exX = this.x; 
                    let exY = this.y;
                    if (this.y >= height) exY = height - 5;
                    if (this.x <= 0) exX = 5;
                    if ((exX > -50 && exX < width + 50 && exY > -50 && exY < height + 50)) {
                        createParticles(exX, exY, 'spark');
                    }
                    return true; 
                }
                if (burnedOut) return true;
                if (this.x < -this.len || this.y > height + this.len) return true;
            } else {
                const hitBottom = this.y >= height;
                const hitLeft = this.x <= 0 && this.y > 0;
                const hitRight = this.x >= width && this.y > 0;
                if (hitBottom || hitLeft || hitRight) {
                    let exX = Math.max(0, Math.min(width, this.x));
                    let exY = Math.max(0, Math.min(height, this.y));
                    createParticles(exX, exY, 'pollen');
                    return true;
                }
            }
            return false;
        }

        draw(ctx: CanvasRenderingContext2D) {
            if (this.mode === 'meteor') {
                const opacity = Math.sin((Math.min(this.life, this.maxLife) / this.maxLife) * Math.PI);
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(Math.atan2(this.vy, this.vx) - Math.PI);
                const gradient = ctx.createLinearGradient(0, 0, this.len, 0);
                gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
                gradient.addColorStop(0.1, `rgba(255, 255, 255, ${opacity * 0.8})`);
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(this.len, -1);
                ctx.lineTo(this.len, 1);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            } else {
                const flipScale = Math.abs(Math.cos(this.flip));
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.rotation);
                ctx.scale(flipScale, 1); 
                ctx.fillStyle = this.color;
                ctx.beginPath();
                const s = this.size;
                ctx.moveTo(0, s * 0.8); 
                ctx.bezierCurveTo(-s * 0.6, s * 0.5, -s, 0, 0, -s);
                ctx.bezierCurveTo(s, 0, s * 0.6, s * 0.5, 0, s * 0.8);
                ctx.fill();
                ctx.restore();
            }
        }
    }

    class Particle {
        x: number; y: number; type: string;
        vx: number; vy: number; life: number; decay: number; gravity: number;
        color: string; size: number;

        constructor(x: number, y: number, type: string) {
            this.x = x; this.y = y; this.type = type;
            const angle = Math.random() * Math.PI * 2;
            if (type === 'spark') {
                const speed = Math.random() * 4 + 2;
                this.vx = Math.cos(angle) * speed;
                this.vy = Math.sin(angle) * speed;
                this.life = 1.0;
                this.decay = Math.random() * 0.02 + 0.015;
                this.gravity = 0.08;
                const colors = ['#FFD700', '#FFA500', '#FFFFE0', '#B8860B'];
                this.color = colors[Math.floor(Math.random() * colors.length)];
                this.size = Math.random() * 2 + 1;
            } else {
                const speed = Math.random() * 3.5 + 1.0; 
                this.vx = Math.cos(angle) * speed;
                this.vy = Math.sin(angle) * speed - 2; 
                this.life = 1.0;
                this.decay = Math.random() * 0.015 + 0.005; 
                this.gravity = 0.1; 
                if (Math.random() < 0.3) {
                    this.color = 'rgba(255, 255, 255, 0.9)'; 
                } else {
                    this.color = `rgba(255, ${Math.floor(Math.random()*50 + 180)}, 220, 1)`; 
                }
                this.size = Math.random() * 2.5 + 1.0; 
            }
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.vy += this.gravity;
            this.vx *= 0.95; 
            this.vy *= 0.95;
            this.life -= this.decay;
        }
        draw(ctx: CanvasRenderingContext2D) {
            ctx.globalAlpha = Math.max(0, this.life);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }

    // --- LOGIC ---
    const createParticles = (x: number, y: number, type: string) => {
        const count = type === 'spark' ? 30 : 40;
        for (let i = 0; i < count; i++) {
            particles.push(new Particle(x, y, type));
        }
    };

    const createBackground = () => {
        backgroundObjects = [];
        if (!isNightRef.current) return;
        const count = Math.floor((width * height) / 3000);
        for (let i = 0; i < count; i++) {
            backgroundObjects.push(new BgObject());
        }
    };

    const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        createBackground();
    };

    const animate = () => {
        ctx.clearRect(0, 0, width, height);

        const gradient = ctx.createRadialGradient(width/2, height, 0, width/2, height/2, width);
        if (isNightRef.current) {
            gradient.addColorStop(0, 'rgba(27, 39, 53, 0.4)'); 
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 
        } else {
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)'); 
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        backgroundObjects.forEach(obj => obj.draw(ctx));

        // Spawn Rate
        const spawnRate = isNightRef.current ? 0.0088 : 0.022; 
        if (Math.random() < spawnRate) {
            flyingObjects.push(new Flyer());
        }

        for (let i = flyingObjects.length - 1; i >= 0; i--) {
            flyingObjects[i].update();
            flyingObjects[i].draw(ctx);
            if (flyingObjects[i].checkStatus()) {
                flyingObjects.splice(i, 1);
            }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            particles[i].draw(ctx);
            if (particles[i].life <= 0) {
                particles.splice(i, 1);
            }
        }
        
        mouse.vx *= 0.8;
        mouse.vy *= 0.8;

        animationFrameId = requestAnimationFrame(animate);
    };

    // --- INIT ---
    resize();
    animate();

    // Events
    const handleMouseMove = (e: MouseEvent) => {
        const currentX = e.clientX;
        const currentY = e.clientY;
        if (lastMouse.x !== -1000) {
            mouse.vx = currentX - lastMouse.x;
            mouse.vy = currentY - lastMouse.y;
        }
        mouse.x = currentX;
        mouse.y = currentY;
        lastMouse.x = currentX;
        lastMouse.y = currentY;
    };

    const handleWindowResize = () => resize();

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleWindowResize);
    
    // Global particle trigger hack for clicks outside button
    const handleClick = (e: MouseEvent) => {
         if (!(e.target as HTMLElement).closest('.theme-toggle')) {
            const type = isNightRef.current ? 'spark' : 'pollen';
            createParticles(e.clientX, e.clientY, type);
         }
    };
    window.addEventListener('click', handleClick);

    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('resize', handleWindowResize);
        window.removeEventListener('click', handleClick);
        cancelAnimationFrame(animationFrameId);
    };
  }, []); // Run once on mount

  // Sync ref with state for animation loop
  useEffect(() => {
    isNightRef.current = isNight;
    // We also need to re-trigger background creation if switching to night
    const canvas = canvasRef.current;
    if(canvas && isNight) {
        // Trigger resize logic implicitly to refill stars
        // Ideally we would expose createBackground but for now resize works
        window.dispatchEvent(new Event('resize')); 
    }
  }, [isNight]);


  // --- HANDLERS ---
  const handleThemeSwitch = (e: React.MouseEvent) => {
    if (!themeBtnRef.current || !transitionLayerRef.current) return;

    const rect = themeBtnRef.current.getBoundingClientRect();
    const btnX = rect.left + rect.width / 2;
    const btnY = rect.top + rect.height / 2;
    const maxRadius = Math.hypot(Math.max(btnX, window.innerWidth - btnX), Math.max(btnY, window.innerHeight - btnY)) * 1.2;
    const targetColor = isNight ? COLOR_DAY : COLOR_NIGHT;
    
    const layer = transitionLayerRef.current;
    
    layer.style.transition = 'none';
    layer.style.opacity = '1';
    layer.style.backgroundColor = targetColor;
    layer.style.clipPath = `circle(0px at ${btnX}px ${btnY}px)`;
    // Force reflow
    void layer.offsetHeight; 

    layer.style.transition = 'clip-path 0.8s ease-in-out';
    layer.style.clipPath = `circle(${maxRadius}px at ${btnX}px ${btnY}px)`;

    setTimeout(() => {
        setIsNight(!isNight);
        // Fade out layer
        layer.style.transition = 'opacity 0.8s ease';
        layer.style.opacity = '0';
        setTimeout(() => {
             layer.style.clipPath = `circle(0px at ${btnX}px ${btnY}px)`;
        }, 800);
    }, 800);
  };

  const handleDrag = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
  };
  const handleDragIn = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
          setIsDragging(true);
      }
  };
  const handleDragOut = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          handleFileSelect(file);
          e.dataTransfer.clearData();
      }
  };
  const handleFileSelect = (file: File) => {
    if (file.type.startsWith('image/')) {
        setSelectedFile(file);
        setFilePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = () => {
    if (selectedFile) {
        onStart(selectedFile, promptText);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden font-sans" style={{ backgroundColor: isNight ? COLOR_NIGHT : COLOR_DAY, transition: 'background-color 0.8s' }}>
      
      {/* 0. Canvas Layers */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0 block" />
      <div ref={transitionLayerRef} className="absolute inset-0 z-10 pointer-events-none opacity-0" />

      {/* 1. Theme Toggle */}
      <button 
        ref={themeBtnRef}
        onClick={handleThemeSwitch}
        className="theme-toggle absolute top-6 right-6 z-50 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-lg hover:scale-110 hover:rotate-12 transition-all"
      >
        {isNight ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
        ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
        )}
      </button>

      {/* 1.5 Lang Toggle */}
      <button 
        onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
        className="absolute top-6 right-20 z-50 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs font-bold shadow-lg hover:bg-white/20 transition-all"
      >
          {lang.toUpperCase()}
      </button>

      {/* 2. Main UI Content (Overlay) */}
      <div 
        className="absolute inset-0 z-30 flex flex-col items-center justify-center px-4"
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
         {/* Drag Overlay */}
         <AnimatePresence>
            {isDragging && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 bg-purple-600/20 backdrop-blur-sm border-4 border-purple-400 border-dashed m-4 rounded-3xl flex items-center justify-center"
                >
                    <div className="text-center text-white">
                        <ArrowUpTrayIcon className="w-16 h-16 mx-auto mb-4 animate-bounce" />
                        <h3 className="text-3xl font-bold">{dict.dragTip}</h3>
                    </div>
                </motion.div>
            )}
         </AnimatePresence>

         <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`w-full max-w-4xl text-center mb-10 transition-colors duration-700 ${isNight ? 'text-white' : 'text-zinc-800'}`}
         >
             <span className="inline-block px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold tracking-wider mb-6 backdrop-blur-md">
                {dict.badge}
             </span>
             <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 drop-shadow-lg">
                <span className="block mb-2">{dict.h1a}</span>
                <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    {dict.h1b}
                </span>
             </h1>
             <p className={`text-lg md:text-xl max-w-2xl mx-auto leading-relaxed opacity-80 whitespace-pre-line drop-shadow-md`}>
                {dict.sub}
             </p>
         </motion.div>

         {/* 3. Input & Upload Box */}
         <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="w-full max-w-2xl"
         >
             <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-2 rounded-2xl shadow-2xl flex flex-col md:flex-row gap-2">
                 {/* Upload Trigger */}
                 <div className="relative group flex-shrink-0">
                     <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
                        className="hidden"
                        accept="image/*"
                     />
                     <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full md:w-32 h-16 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 transition-all flex flex-col items-center justify-center text-white/80 group-hover:text-white overflow-hidden relative"
                     >
                         {filePreview ? (
                             <img src={filePreview} className="absolute inset-0 w-full h-full object-cover opacity-80" />
                         ) : (
                             <>
                                <PhotoIcon className="w-6 h-6 mb-1" />
                                <span className="text-xs font-medium opacity-70">Upload</span>
                             </>
                         )}
                     </button>
                 </div>

                 {/* Text Input */}
                 <div className="flex-1 relative">
                     <input 
                        type="text"
                        value={promptText}
                        onChange={(e) => setPromptText(e.target.value)}
                        placeholder={dict.describePlaceholder}
                        className="w-full h-16 bg-transparent text-white placeholder-white/40 px-4 text-lg outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                     />
                     {/* Suggestion Pill */}
                     {!promptText && (
                        <button 
                            onClick={() => setPromptText(dict.examplePrompt)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs text-white/60 hover:text-white transition-colors border border-white/5 truncate max-w-[120px]"
                        >
                            {dict.example}
                        </button>
                     )}
                 </div>

                 {/* Generate Button */}
                 <button 
                    onClick={handleSubmit}
                    disabled={!selectedFile}
                    className="h-16 px-8 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
                 >
                     <SparklesIcon className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                 </button>
             </div>
             <p className="text-center text-white/40 text-xs mt-4">
                 {dict.supports}
             </p>
         </motion.div>
      </div>

    </div>
  );
};
