
import React, { useRef, useEffect, useState } from 'react';
import { 
  PencilIcon, 
  StopIcon, 
  ArrowLongLeftIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  ArrowUturnLeftIcon,
  XMarkIcon, 
  TrashIcon,
  Squares2X2Icon,
  HashtagIcon
} from '@heroicons/react/24/outline';

interface CanvasMaskEditorProps {
  imageSrc: string;
  onMaskGenerated: (maskBlob: Blob) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

type Tool = 'brush' | 'rect' | 'arrow' | 'text' | 'comment' | 'pan';
const COLORS = ['#FF4081', '#F44336', '#FFEB3B', '#2196F3', '#FFFFFF', '#000000'];

export const CanvasMaskEditor: React.FC<CanvasMaskEditorProps> = ({
  imageSrc,
  onMaskGenerated,
  onCancel,
  onSubmit
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  // Canvas State
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Tools & Settings
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState(COLORS[0]); // Default Pink
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [brushSize] = useState(8); // Fixed stroke width for annotations
  
  // Viewport State (Zoom/Pan)
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  // Text Input State
  const [textInput, setTextInput] = useState<{x: number, y: number, value: string} | null>(null);

  // History for Undo/Redo
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);

  // Temporary shape drawing
  const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
  const [tempSnapshot, setTempSnapshot] = useState<ImageData | null>(null);

  // Initialize Canvas
  useEffect(() => {
    const img = new Image();
    img.src = imageSrc;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (canvasRef.current && containerRef.current) {
        const canvas = canvasRef.current;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          setContext(ctx);
          
          // Initial Fit
          const containerAspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
          const imgAspect = img.naturalWidth / img.naturalHeight;
          let initScale = 1;
          
          if (imgAspect > containerAspect) {
            initScale = (containerRef.current.clientWidth * 0.95) / img.naturalWidth;
          } else {
            initScale = (containerRef.current.clientHeight * 0.95) / img.naturalHeight;
          }
          setScale(initScale);
          
          setOffset({
            x: (containerRef.current.clientWidth - img.naturalWidth * initScale) / 2,
            y: (containerRef.current.clientHeight - img.naturalHeight * initScale) / 2
          });

          const blankState = ctx.getImageData(0, 0, canvas.width, canvas.height);
          setHistory([blankState]);
          setHistoryStep(0);
        }
      }
    };
  }, [imageSrc]);

  // --- Coordinate Helpers ---
  const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current || !containerRef.current) return { x: 0, y: 0 };

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    return {
      x: (relX - offset.x) / scale,
      y: (relY - offset.y) / scale
    };
  };

  // --- Shape Drawing Functions ---
  const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
      const headlen = 25 / scale; // scale independent size
      const angle = Math.atan2(toY - fromY, toX - fromX);
      
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.lineWidth = 6 / scale;
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
      ctx.lineTo(toX, toY);
      ctx.fill();
  };

  const drawCommentMarker = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      const size = 40 / scale;
      
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3 / scale;
      
      ctx.beginPath();
      // Bubble shape
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x - size, y - size, x + size, y - size, x + size, y);
      ctx.bezierCurveTo(x + size, y + size, x - size/2, y + size, x - size/2, y + size * 1.3);
      ctx.lineTo(x, y + size/2);
      ctx.fill();
      ctx.stroke();
      
      // Plus sign
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4 / scale;
      ctx.beginPath();
      ctx.moveTo(x - size/4, y);
      ctx.lineTo(x + size/4, y);
      ctx.moveTo(x, y - size/4);
      ctx.lineTo(x, y + size/4);
      ctx.stroke();
      
      ctx.restore();
  };

  // --- Interaction Handlers ---
  const startAction = (e: React.MouseEvent | React.TouchEvent) => {
    // Pan override with Middle Mouse or Ctrl+Left
    if (tool === 'pan' || (e as React.MouseEvent).button === 1 || (e as React.MouseEvent).ctrlKey) {
        startPan(e);
        return;
    }

    // Finalize text if open
    if (textInput) {
        finalizeText();
        return;
    }

    if (!context || !canvasRef.current) return;
    const { x, y } = getCanvasCoordinates(e);
    
    if (tool === 'text') {
        setTextInput({ x, y, value: '' });
        return;
    }

    if (tool === 'comment') {
        saveSnapshot();
        drawCommentMarker(context, x, y);
        saveHistory();
        setHasChanges(true);
        generateMaskBlob();
        return;
    }
    
    setIsDrawing(true);
    setStartPos({ x, y });
    saveSnapshot();

    context.beginPath();
    context.moveTo(x, y);
    
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = brushSize / scale;
  };

  const moveAction = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPanning) {
        pan(e);
        return;
    }
    
    if (!isDrawing || !context || !startPos) return;
    const { x, y } = getCanvasCoordinates(e);

    if (tool === 'brush') {
        context.lineTo(x, y);
        context.stroke();
    } else if (tool === 'rect' || tool === 'arrow') {
        restoreSnapshot();
        if (tool === 'rect') {
            const w = x - startPos.x;
            const h = y - startPos.y;
            context.lineWidth = 6 / scale;
            context.strokeRect(startPos.x, startPos.y, w, h);
        } else if (tool === 'arrow') {
            drawArrow(context, startPos.x, startPos.y, x, y);
        }
    }
  };

  const endAction = () => {
    if (isPanning) {
        setIsPanning(false);
        return;
    }
    if (!isDrawing) return;
    
    setIsDrawing(false);
    setStartPos(null);
    setTempSnapshot(null);
    saveHistory();
    setHasChanges(true);
    generateMaskBlob();
  };

  // --- History & Snapshot Helpers ---
  const saveSnapshot = () => {
      if (context && canvasRef.current) {
          setTempSnapshot(context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height));
      }
  };

  const restoreSnapshot = () => {
      if (context && tempSnapshot) {
          context.putImageData(tempSnapshot, 0, 0);
      }
  };

  const saveHistory = () => {
      if (context && canvasRef.current) {
          const newState = context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
          const newHistory = history.slice(0, historyStep + 1);
          newHistory.push(newState);
          setHistory(newHistory);
          setHistoryStep(newHistory.length - 1);
      }
  };

  const undo = () => {
      if (historyStep > 0 && context) {
          const prev = history[historyStep - 1];
          context.putImageData(prev, 0, 0);
          setHistoryStep(prevStep => prevStep - 1);
          generateMaskBlob();
          if (historyStep - 1 === 0) setHasChanges(false);
      } else if (historyStep === 0 && context) {
          // Undo initial state (clear)
          const prev = history[0];
          context.putImageData(prev, 0, 0);
          setHasChanges(false);
      }
  };

  const clearCanvas = () => {
      if (context && canvasRef.current) {
          context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          saveHistory();
          generateMaskBlob();
          setHasChanges(false);
      }
  };

  // --- Text Input Logic ---
  const finalizeText = () => {
      if (!textInput || !context) return;
      if (textInput.value.trim()) {
          saveSnapshot();
          context.font = `bold ${32/scale}px sans-serif`;
          context.fillStyle = color;
          context.fillText(textInput.value, textInput.x, textInput.y + (32/scale));
          saveHistory();
          setHasChanges(true);
          generateMaskBlob();
      }
      setTextInput(null);
  };

  // --- Mask Generation (Inpainting Mask) ---
  const generateMaskBlob = () => {
    if (!canvasRef.current) return;
    // Create binary mask for inpainting
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvasRef.current.width;
    maskCanvas.height = canvasRef.current.height;
    const maskCtx = maskCanvas.getContext('2d');
    
    if (maskCtx) {
      maskCtx.fillStyle = '#000000';
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      maskCtx.drawImage(canvasRef.current, 0, 0);
      maskCtx.globalCompositeOperation = 'source-in';
      maskCtx.fillStyle = '#FFFFFF';
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    }

    maskCanvas.toBlob((blob) => {
      if (blob) onMaskGenerated(blob);
    }, 'image/png');
  };

  // --- Zoom/Pan ---
  const startPan = (e: React.MouseEvent | React.TouchEvent) => {
    setIsPanning(true);
    let cx, cy;
    if ('touches' in e) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else { cx = (e as React.MouseEvent).clientX; cy = (e as React.MouseEvent).clientY; }
    setLastMousePos({ x: cx, y: cy });
  };

  const pan = (e: React.MouseEvent | React.TouchEvent) => {
    let cx, cy;
    if ('touches' in e) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else { cx = (e as React.MouseEvent).clientX; cy = (e as React.MouseEvent).clientY; }
    setOffset(p => ({ x: p.x + (cx - lastMousePos.x), y: p.y + (cy - lastMousePos.y) }));
    setLastMousePos({ x: cx, y: cy });
  };
  
  const handleWheel = (e: React.WheelEvent) => {
     if (e.ctrlKey) {
         e.preventDefault();
         const delta = -e.deltaY * 0.001;
         setScale(s => Math.min(Math.max(0.1, s + delta), 5));
     }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[#121212] overflow-hidden select-none group">
      
      {/* Viewport */}
      <div 
        ref={containerRef}
        className="relative w-full h-full overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={startAction}
        onMouseMove={moveAction}
        onMouseUp={endAction}
        onMouseLeave={endAction}
        onTouchStart={startAction}
        onTouchMove={moveAction}
        onTouchEnd={endAction}
        style={{ cursor: tool === 'pan' || isPanning ? 'grab' : 'crosshair' }}
      >
        <div style={{ 
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            transition: isPanning ? 'none' : 'transform 0.1s ease-out'
        }}>
            <img ref={imageRef} src={imageSrc} className="absolute top-0 left-0 pointer-events-none" draggable={false} style={{maxWidth:'none'}}/>
            <canvas ref={canvasRef} className="absolute top-0 left-0" />
            
            {/* Text Input Overlay */}
            {textInput && (
                <input 
                    autoFocus
                    type="text"
                    value={textInput.value}
                    onChange={e => setTextInput({...textInput, value: e.target.value})}
                    onKeyDown={e => e.key === 'Enter' && finalizeText()}
                    onBlur={finalizeText}
                    placeholder="Type..."
                    className="absolute bg-transparent border border-blue-500 outline-none p-1 m-0 font-bold shadow-sm"
                    style={{
                        left: textInput.x,
                        top: textInput.y,
                        fontSize: `${32/scale}px`,
                        color: color,
                        minWidth: '150px'
                    }}
                />
            )}
        </div>
      </div>

      {/* --- Annanote Toolbar --- */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center bg-[#262626] rounded-full px-2 py-1.5 shadow-2xl border border-white/10 gap-1">
              
              {/* Grid / Drag Handle */}
              <div className="p-2 text-zinc-500 cursor-grab">
                  <Squares2X2Icon className="w-5 h-5" />
              </div>

              {/* Tool Group 1 */}
              <button
                onClick={() => setTool('comment')}
                className={`p-2 rounded-lg transition-all ${tool === 'comment' ? 'bg-[#333] text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                title="Add Comment"
              >
                  <ChatBubbleOvalLeftEllipsisIcon className="w-5 h-5" />
              </button>

              <button
                onClick={() => setTool('arrow')}
                className={`p-2 rounded-lg transition-all ${tool === 'arrow' ? 'bg-[#333] text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                title="Add Arrow"
              >
                  <ArrowLongLeftIcon className="w-5 h-5" />
              </button>

              <button
                onClick={() => setTool('rect')}
                className={`p-2 rounded-lg transition-all ${tool === 'rect' ? 'bg-[#333] text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                title="Add Rectangle"
              >
                  <StopIcon className="w-5 h-5" />
              </button>

              <button
                onClick={() => setTool('text')}
                className={`p-2 rounded-lg transition-all ${tool === 'text' ? 'bg-[#333] text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                title="Add Text"
              >
                  <HashtagIcon className="w-5 h-5" />
              </button>

              <button
                onClick={() => setTool('brush')}
                className={`p-2 rounded-lg transition-all ${tool === 'brush' ? 'bg-[#333] text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                title="Sketch"
              >
                  <PencilIcon className="w-5 h-5" />
              </button>

              {/* Color Picker */}
              <div className="relative mx-1">
                  <button 
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                  />
                  {showColorPicker && (
                      <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 bg-[#262626] p-2 rounded-xl shadow-xl border border-white/10 flex gap-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
                          {COLORS.map(c => (
                              <button 
                                key={c} 
                                onClick={() => { setColor(c); setShowColorPicker(false); }}
                                className="w-6 h-6 rounded-full border border-white/10 hover:scale-125 transition-transform"
                                style={{ backgroundColor: c }}
                              />
                          ))}
                      </div>
                  )}
              </div>

              {/* Divider */}
              <div className="w-px h-6 bg-white/10 mx-1"></div>

              {/* Actions */}
              <button 
                onClick={undo} 
                disabled={historyStep <= 0} 
                className="p-2 text-zinc-400 hover:text-white disabled:opacity-20 transition-colors"
                title="Undo"
              >
                  <ArrowUturnLeftIcon className="w-5 h-5" />
              </button>
              
              <button 
                onClick={clearCanvas} 
                className="p-2 text-zinc-400 hover:text-white transition-colors"
                title="Clear"
              >
                  <TrashIcon className="w-5 h-5" />
              </button>

              {/* Add to Chat Button */}
              <button 
                onClick={() => hasChanges && onSubmit()}
                disabled={!hasChanges}
                className="ml-1 px-4 py-1.5 bg-[#333] hover:bg-[#444] border border-white/10 rounded-full text-white text-xs font-medium flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                  + Add to chat
              </button>

              {/* Close */}
              <button onClick={onCancel} className="p-2 ml-1 text-zinc-400 hover:text-white">
                  <XMarkIcon className="w-5 h-5" />
              </button>
          </div>
          
          <div className="text-center mt-3 text-[10px] text-zinc-500 font-medium tracking-widest uppercase opacity-50">
              Draw to Annotate • Ctrl+Wheel to Zoom
          </div>
      </div>

    </div>
  );
};
