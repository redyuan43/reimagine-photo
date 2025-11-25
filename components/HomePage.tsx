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
        draw() {
            if (isNightRef.current) {
                const dx = this.x - mouse.x;
                const dy = this.y - mouse.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const triggerRange = 40; // Slightly larger for easier interaction on web
                
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

                ctx!.fillStyle = `rgba(${this.color}, ${finalOpacity})`;
                ctx!.beginPath();
                ctx!.arc(this.x, this.y, currentSize, 0, Math.PI * 2);
                ctx!.fill();
            }
        }
    }

    class Flyer {
        x: number = 0;
        y: number = 0;
        vx: number = 0;
        vy: number = 0;
        len: number = 0;
        speed: number = 0;
        size: number = 0;
        angle: number = 0;
        life: number = 0;
        maxLife: number = 0;
        mode: 'meteor' | 'sakura' = 'meteor';
        
        // Sakura specifics
        speedY: number = 0;
        speedX: number = 0;
        sway: number = 0;
        swayAmp: number = 0;
        rotation: number = 0;
        rotationSpeed: number = 0;
        flip: number = 0;
        flipSpeed: number = 0;
        color: string = '';
        windVx: number = 0;
        windVy: number = 0;

        constructor() {
            this.reset();
        }

        reset() {
            this.mode = isNightRef.current ? 'meteor' : 'sakura';
            
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

        draw() {
            if (this.mode === 'meteor') {
                const opacity = Math.sin((Math.min(this.life, this.maxLife) / this.maxLife) * Math.PI);
                ctx!.save();
                ctx!.translate(this.x, this.y);
                ctx!.rotate(Math.atan2(this.vy, this.vx) - Math.PI);
                const gradient = ctx!.createLinearGradient(0, 0, this.len, 0);
                gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
                gradient.addColorStop(0.1, `rgba(255, 255, 255, ${opacity * 0.8})`);
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx!.fillStyle = gradient;
                ctx!.beginPath();
                ctx!.moveTo(0, 0);
                ctx!.lineTo(this.len, -1);
                ctx!.lineTo(this.len, 1);
                ctx!.closePath();
                ctx!.fill();
                ctx!.restore();
            } else {
                const flipScale = Math.abs(Math.cos(this.flip));
                ctx!.save();
                ctx!.translate(this.x, this.y);
                ctx!.rotate(this.rotation);
                ctx!.scale(flipScale, 1); 
                ctx!.fillStyle = this.color;
                ctx!.beginPath();
                const s = this.size;
                ctx!.moveTo(0, s * 0.8); 
                ctx!.bezierCurveTo(-s * 0.6, s * 0.5, -s, 0, 0, -s);
                ctx!.bezierCurveTo(s, 0, s * 0.6, s * 0.5, 0, s * 0.8);
                ctx!.fill();
                ctx!.restore();
            }
        }
    }

    class Particle {
        x: number;
        y: number;
        type: 'spark' | 'pollen';
        vx: number = 0;
        vy: number = 0;
        life: number = 0;
        decay: number = 0;
        gravity: number = 0;
        color: string = '';
        size: number = 0;

        constructor(x: number, y: number, type: 'spark' | 'pollen') {
            this.x = x;
            this.y = y;
            this.type = type;
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
        draw() {
            ctx!.globalAlpha = Math.max(0, this.life);
            ctx!.fillStyle = this.color;
            ctx!.beginPath();
            ctx!.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx!.fill();
            ctx!.globalAlpha = 1.0;
        }
    }

    const createBackground = () => {
        backgroundObjects = [];
        if (!isNightRef.current) return;
        const count = Math.floor((width * height) / 3000);
        for (let i = 0; i < count; i++) {
            backgroundObjects.push(new BgObject());
        }
    };

    const createParticles = (x: number, y: number, type: 'spark' | 'pollen') => {
        const count = type === 'spark' ? 30 : 40; 
        for (let i = 0; i < count; i++) {
            particles.push(new Particle(x, y, type));
        }
    };

    // --- EVENTS & LOOP ---
    const handleResize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        createBackground();
    };

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

    const handleClick = (e: MouseEvent) => {
        // Only trigger particles if we clicked directly on the background (not controls)
        // Note: React's event bubbling might handle this differently, but for canvas global listener:
        if ((e.target as HTMLElement).tagName !== 'CANVAS' && (e.target as HTMLElement).id !== 'root') return;
        
        const type = isNightRef.current ? 'spark' : 'pollen';
        createParticles(e.clientX, e.clientY, type);
    };

    const animate = () => {
        ctx.clearRect(0, 0, width, height);

        // Background Gradient
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

        backgroundObjects.forEach(obj => obj.draw());

        // Spawn flyers
        const spawnRate = isNightRef.current ? 0.0088 : 0.022; 
        if (Math.random() < spawnRate) {
            flyingObjects.push(new Flyer());
        }

        // Update flyers
        for (let i = flyingObjects.length - 1; i >= 0; i--) {
            flyingObjects[i].update();
            flyingObjects[i].draw();
            if (flyingObjects[i].checkStatus()) {
                flyingObjects.splice(i, 1);
            }
        }

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            particles[i].draw();
            if (particles[i].life <= 0) {
                particles.splice(i, 1);
            }
        }
        
        mouse.vx *= 0.8;
        mouse.vy *= 0.8;

        animationFrameId = requestAnimationFrame(animate);
    };

    // Initialize
    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    animate();

    // Export internal reset for theme toggle
    (canvas as any).__internalReset = () => {
        flyingObjects = [];
        particles = [];
        createBackground();
    };

    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('click', handleClick);
        cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // --- THEME SWITCH LOGIC ---
  const toggleTheme = (e: React.MouseEvent) => {
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const btnX = rect.left + rect.width / 2;
    const btnY = rect.top + rect.height / 2;
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    const maxRadius = Math.hypot(Math.max(btnX, width - btnX), Math.max(btnY, height - btnY)) * 1.2;
    const targetColor = isNight ? COLOR_DAY : COLOR_NIGHT;
    
    const transLayer = transitionLayerRef.current;
    if (transLayer) {
        transLayer.style.transition = 'none';
        transLayer.style.opacity = '1';
        transLayer.style.backgroundColor = targetColor;
        transLayer.style.clipPath = `circle(0px at ${btnX}px ${btnY}px)`;
        transLayer.offsetHeight; // Force reflow

        transLayer.style.transition = 'clip-path 0.8s ease-in-out';
        transLayer.style.clipPath = `circle(${maxRadius}px at ${btnX}px ${btnY}px)`;
        
        setTimeout(() => {
            const nextState = !isNight;
            setIsNight(nextState);
            isNightRef.current = nextState;
            
            // Reset Canvas Entities
            if (canvasRef.current && (canvasRef.current as any).__internalReset) {
                (canvasRef.current as any).__internalReset();
            }

            // Fade out transition layer
            transLayer.style.transition = 'opacity 0.8s ease';
            transLayer.style.opacity = '0';
            
            setTimeout(() => {
                transLayer.style.clipPath = `circle(0px at ${btnX}px ${btnY}px)`;
            }, 800);
        }, 800);
    }
  };


  // --- UI HANDLERS ---
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onStart(e.dataTransfer.files[0], promptText);
    }
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setSelectedFile(file);
        setFilePreview(URL.createObjectURL(file));
    }
  };
  const handleSubmit = () => {
      if (selectedFile) onStart(selectedFile, promptText);
      else fileInputRef.current?.click();
  };


  // --- RENDER ---
  return (
    <div 
        ref={containerRef}
        className="relative w-full h-full min-h-screen overflow-hidden transition-colors duration-1000"
        style={{ backgroundColor: isNight ? COLOR_NIGHT : COLOR_DAY }}
        onDragEnter={handleDragEnter} 
        onDragLeave={handleDragLeave} 
        onDragOver={handleDragOver} 
        onDrop={handleDrop}
    >
        {/* Transition Layer */}
        <div 
            ref={transitionLayerRef}
            className="absolute top-0 left-0 w-full h-full z-20 pointer-events-none opacity-0"
            style={{ clipPath: 'circle(0% at 50% 50%)' }}
        />

        {/* Canvas Background */}
        <canvas ref={canvasRef} className="block absolute top-0 left-0 z-0" />

        {/* Drag Overlay */}
        <AnimatePresence>
            {isDragging && (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`absolute inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-xl m-4 rounded-3xl border-2 border-dashed ${isNight ? 'bg-black/80 border-blue-500' : 'bg-white/80 border-blue-400'}`}
            >
                <ArrowUpTrayIcon className="w-24 h-24 text-blue-500 animate-bounce" />
                <p className="text-3xl font-bold text-blue-500 mt-6">{dict.dragTip}</p>
            </motion.div>
            )}
        </AnimatePresence>

        {/* --- UI LAYER --- */}
        <div className="absolute inset-0 z-30 pointer-events-none flex flex-col">
            
            {/* Top Right Controls */}
            <div className="flex justify-end p-6 pointer-events-auto gap-4">
                 <button 
                    ref={themeBtnRef}
                    onClick={toggleTheme}
                    className="w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border transition-all duration-300 hover:scale-110 hover:rotate-12 shadow-lg outline-none"
                    style={{ 
                        background: 'rgba(255, 255, 255, 0.1)', 
                        borderColor: 'rgba(255, 255, 255, 0.2)',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                        color: isNight ? '#FFF' : '#333'
                    }}
                 >
                    {isNight ? (
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                    ) : (
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                    )}
                 </button>

                 <button
                    onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                    className="px-4 h-12 rounded-full font-bold backdrop-blur-md border hover:bg-white/20 transition-all pointer-events-auto"
                    style={{ 
                        background: 'rgba(255, 255, 255, 0.1)', 
                        borderColor: 'rgba(255, 255, 255, 0.2)',
                        color: isNight ? '#FFF' : '#333'
                    }}
                 >
                    {lang === 'zh' ? '中' : 'EN'}
                </button>
            </div>

            {/* Center Content */}
            <div className="flex-1 flex flex-col items-center justify-center px-4 pointer-events-auto text-center -mt-20">
                
                {/* Title Section */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                    className="mb-12"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-md shadow-sm mb-6"
                         style={{ 
                             borderColor: isNight ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                             background: isNight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' 
                         }}
                    >
                        <SparklesIcon className="w-4 h-4 text-purple-400" />
                        <span className={`text-sm font-medium ${isNight ? 'text-gray-200' : 'text-gray-800'}`}>{dict.badge}</span>
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 drop-shadow-sm">
                        <span className={`block ${isNight ? 'text-white' : 'text-gray-900'}`}>{dict.h1a}</span>
                        <span className="block bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent pb-2">{dict.h1b}</span>
                    </h1>

                    <p className={`text-lg md:text-xl font-light max-w-2xl mx-auto leading-relaxed ${isNight ? 'text-gray-400' : 'text-gray-700'}`}>
                        {dict.sub.split('\n')[0]}<br className="hidden md:block" />{dict.sub.split('\n')[1]}
                    </p>
                </motion.div>

                {/* Input Bar */}
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="w-full max-w-xl flex flex-col items-center gap-4"
                >
                    <div 
                        className="relative w-full flex items-center gap-2 p-2 rounded-full shadow-2xl border transition-all duration-300 backdrop-blur-xl"
                        style={{
                            background: isNight ? 'rgba(30, 30, 30, 0.6)' : 'rgba(255, 255, 255, 0.7)',
                            borderColor: isNight ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                        }}
                    >
                        {/* Upload Button */}
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden transition-colors"
                            style={{
                                background: selectedFile ? '#333' : (isNight ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'),
                                color: isNight ? '#AAA' : '#666'
                            }}
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
                            className="flex-1 bg-transparent border-none outline-none text-sm px-2"
                            style={{
                                color: isNight ? '#FFF' : '#111',
                            }}
                        />

                        {/* Send Button */}
                        <button 
                            onClick={handleSubmit}
                            disabled={!selectedFile && !promptText}
                            className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-transform hover:scale-105 shadow-md ${
                                selectedFile ? 'bg-white text-black' : (isNight ? 'bg-zinc-700 text-zinc-400' : 'bg-white text-gray-400')
                            }`}
                        >
                            <PaperAirplaneIcon className="w-5 h-5 -ml-0.5" />
                        </button>
                    </div>

                    {/* Helper */}
                    <div className={`flex flex-col md:flex-row items-center gap-2 text-xs ${isNight ? 'text-gray-500' : 'text-gray-600'}`}>
                        <span className="font-medium px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">{dict.example}</span>
                        <span className="cursor-pointer hover:text-blue-500 transition-colors" onClick={() => setPromptText(dict.examplePrompt)}>
                            {dict.examplePrompt}
                        </span>
                    </div>

                </motion.div>
            </div>
            
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/*,.heic,.heif,.dng,.cr2,.cr3,.nef,.arw,.orf,.rw2,.raf,.sr2" />
        </div>
    </div>
  );
};
