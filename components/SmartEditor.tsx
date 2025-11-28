
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowPathIcon,
  AdjustmentsHorizontalIcon,
  CpuChipIcon,
  CheckCircleIcon,
  ArrowsPointingOutIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
  CheckIcon,
  PaperAirplaneIcon,
  ArrowUpTrayIcon,
  PaintBrushIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon
} from '@heroicons/react/24/outline';
import { ImageComparator } from './ImageComparator';
import { CanvasMaskEditor } from './CanvasMaskEditor';
import { DNALoader } from './DNALoader';
import { analyzeImage, editImage, urlToBlob } from '../services/gemini';
import { PlanItem } from '../types';

const MagicWandIcon = SparklesIcon;

interface SmartEditorProps {
  imagePreview: string | null;
  imageFile: File | null;
  initialPrompt?: string;
  onReset: () => void;
  lang: 'zh' | 'en';
}

export const SmartEditor: React.FC<SmartEditorProps> = ({
  imagePreview,
  imageFile,
  initialPrompt = '',
  onReset,
  lang
}) => {
  const [status, setStatus] = useState<'analyzing' | 'ready' | 'executing' | 'completed'>('analyzing');
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [isHighRes, setIsHighRes] = useState(false);
  const [currentActiveStepIndex, setCurrentActiveStepIndex] = useState(-1);
  
  // History Management
  const [imageHistory, setImageHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Masking State
  const [isMaskingMode, setIsMaskingMode] = useState(false);
  const [currentMaskBlob, setCurrentMaskBlob] = useState<Blob | null>(null);
  
  const listEndRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [leftPct, setLeftPct] = useState(42);
  const [isResizing, setIsResizing] = useState(false);

  // Translations
  const t = useMemo(() => ({
    en: {
        analyzing: 'Analyzing...',
        thinking: 'Identifying improvements...',
        confirm: 'Confirm Edits',
        processing: 'Processing Edits...',
        done: 'Done.',
        upscaling: 'Upscaling to 4K...',
        hdrReady: '4K HDR Ready',
        addCustom: 'Add custom requirement...',
        generate: 'Generate Magic Edit',
        crafting: 'Crafting your masterpiece...',
        manualTouchup: 'Manual Touch-up (Inpaint)',
        annotateGuide: 'Annotate image to guide the editor.',
        doneAddMore: 'Done! Add more edits below:',
        placeholderEdit: 'E.g., Make the sky bluer...',
        placeholderMask: 'Describe your annotation (Optional)...',
        maskTip: 'Use the toolbar on the image to draw and submit.',
        magicUpscale: '✨ Magic 4K Upscale',
        upscalingBtn: 'Upscaling...',
        enhanced: '4K Enhanced',
        download4k: 'Download 4K',
        downloadResult: 'Download Result',
        smartAssistant: 'Smart Assistant',
        newUpload: 'New Upload',
        addBack: 'Add Back',
        noSuggestions: 'Analysis complete. Add custom edits below.',
        issue: 'Issue Detected',
        userRequest: 'User Request',
        processingStep: 'Processing...',
        optimizing: 'Optimizing Details...',
        applyingEdits: 'Applying Visual Edits...',
    },
    zh: {
        analyzing: '正在分析...',
        thinking: '正在识别优化点...',
        confirm: '确认编辑',
        processing: '正在处理编辑...',
        done: '完成',
        upscaling: '正在进行4K超分...',
        hdrReady: '4K HDR 就绪',
        addCustom: '添加自定义需求...',
        generate: '生成魔法编辑',
        crafting: '正在打造您的杰作...',
        manualTouchup: '手动修饰 (重绘)',
        annotateGuide: '标注图片以引导编辑。',
        doneAddMore: '完成！在下方添加更多编辑：',
        placeholderEdit: '例如：让天空更蓝...',
        placeholderMask: '描述您的标注（可选）...',
        maskTip: '使用图片上的工具栏进行绘制并提交。',
        magicUpscale: '✨ 魔法 4K 超分',
        upscalingBtn: '超分中...',
        enhanced: '4K 已增强',
        download4k: '下载 4K',
        downloadResult: '下载结果',
        smartAssistant: '智能助手',
        newUpload: '重新上传',
        addBack: '加回',
        noSuggestions: '分析完成，请在下方添加自定义编辑。',
        issue: '发现问题',
        userRequest: '用户请求',
        processingStep: '处理中...',
        optimizing: '正在优化细节...',
        applyingEdits: '正在应用视觉编辑...',
    }
  }), []);
  const dict = t[lang];

  // Initial Load & Analysis (Streaming)
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      if (!imageFile) return;
      
      // Initialize history with original image
      if (imagePreview) {
          setImageHistory([imagePreview]);
          setHistoryIndex(0);
      }
      
      // Inject initial prompt immediately if exists
      if (initialPrompt && initialPrompt.trim() !== '') {
         const promptItem: PlanItem = {
            id: `custom_init`,
            problem: dict.userRequest,
            solution: initialPrompt,
            engine: 'Smart Engine',
            type: 'generative',
            checked: true,
            isCustom: true
         };
         setPlanItems([promptItem]);
      } else {
         setPlanItems([]);
      }

      // Start Streaming Analysis
      await analyzeImage(imageFile, (newItem) => {
          if (isMounted) {
              setPlanItems(prev => {
                  // Avoid duplicates
                  if (prev.find(p => p.id === newItem.id)) return prev;
                  return [...prev, newItem];
              });
          }
      });
      
      if (isMounted) {
        setStatus('ready');
      }
    };
    init();
    return () => {
      isMounted = false;
    };
  }, [imageFile]); 

  // Auto-scroll to bottom as items arrive
  useEffect(() => {
    if (listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [planItems.length, status]);


  useEffect(() => {
    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isResizing || !layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const x = clientX - rect.left;
      const pct = clamp((x / rect.width) * 100, 28, 75);
      setLeftPct(pct);
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false } as any);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove as any);
      window.removeEventListener('touchend', onUp);
    };
  }, [isResizing]);

  // --- History Helpers ---
  const addToHistory = (newImageUrl: string) => {
      const newHistory = imageHistory.slice(0, historyIndex + 1);
      newHistory.push(newImageUrl);
      setImageHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
      if (historyIndex > 0) {
          setHistoryIndex(prev => prev - 1);
      }
  };

  const handleRedo = () => {
      if (historyIndex < imageHistory.length - 1) {
          setHistoryIndex(prev => prev + 1);
      }
  };
  
  const currentDisplayImage = historyIndex >= 0 ? imageHistory[historyIndex] : imagePreview;

  // --- Action Handlers ---

  const toggleItem = (id: string) => {
    setPlanItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const handleFilterSelect = (itemId: string, option: string) => {
      setPlanItems(prev => prev.map(item => {
          if (item.id === itemId) {
              return { ...item, selectedOption: option, checked: true };
          }
          return item;
      }));
  };

  const handleUserSubmit = async () => {
    // In masking mode, validation happens in executeMaskedEdit
    if (isMaskingMode) {
        await executeMaskedEdit();
        return;
    }

    if (!userInput.trim()) return;

    const newStep: PlanItem = {
      id: `custom_${Date.now()}`,
      problem: dict.userRequest,
      solution: userInput,
      engine: 'Smart Engine',
      type: 'generative',
      checked: true,
      isCustom: true,
    };

    if (status === 'ready' || status === 'analyzing') {
      // Add to plan, execute all together later
      setPlanItems((prev) => [...prev, newStep]);
      setUserInput('');
    } else if (status === 'completed') {
      // Iterative phase
      setPlanItems((prev) => [...prev, newStep]);
      setUserInput('');
      await executeMagic(undefined, newStep.solution); 
    }
  };

  const executeMagic = async (itemsOverride?: PlanItem[], specificInstruction?: string) => {
    // Determine Source Image
    let sourceBlob: Blob | null = null;
    let activeSteps: PlanItem[] = [];
    let instruction = "";

    if (status === 'completed' || specificInstruction) {
        if (!currentDisplayImage) return;
        sourceBlob = await urlToBlob(currentDisplayImage);
        activeSteps = []; 
        instruction = specificInstruction || "";
    } else {
        if (!imageFile) return;
        sourceBlob = imageFile;
        const currentItems = itemsOverride || planItems;
        activeSteps = currentItems.filter((item) => item.checked);
        instruction = ""; 
    }

    if (!sourceBlob) return;

    setStatus('executing');
    setCurrentActiveStepIndex(0);
    setIsProcessing(true);

    const progressInterval = setInterval(() => {
        setCurrentActiveStepIndex(prev => {
            if (activeSteps.length > 0 && prev < activeSteps.length - 1) {
                return prev + 1;
            }
            return prev; 
        });
    }, 2000); 

    try {
        const resultUrl = await editImage(sourceBlob, activeSteps, instruction);
        
        clearInterval(progressInterval);
        
        if (resultUrl) {
            addToHistory(resultUrl);
            setIsHighRes(false);
        }
        setStatus('completed');
        setCurrentActiveStepIndex(-1);
    } catch (e) {
        clearInterval(progressInterval);
        if (status === 'analyzing') setStatus('ready'); 
        else if (status !== 'completed') setStatus('ready');
        else setStatus('completed');
        
        alert("Generation failed. Please try again.");
    } finally {
        setIsProcessing(false);
    }
  };
  
  const executeMaskedEdit = async () => {
      if (!currentMaskBlob || !currentDisplayImage) return;
      
      const prompt = userInput.trim() || "Apply edits based on visual annotations.";
      setIsProcessing(true);
      
      // Visual feedback: if we are in initial state, show 'executing' status
      const isInitial = status === 'ready' || status === 'analyzing';
      if (isInitial) setStatus('executing');

      try {
          const baseImageBlob = await urlToBlob(currentDisplayImage);
          
          // If this is the FIRST edit (from Ready state), we should include the selected Plan Items
          // because they haven't been applied yet.
          // If this is a SUBSEQUENT edit (from Completed state), the baseImage already has Plan Items applied,
          // so we don't apply them again.
          const activeSteps = isInitial ? planItems.filter(i => i.checked) : [];
          
          const maskStep: PlanItem = {
            id: `mask_${Date.now()}`,
            problem: 'Manual Annotation',
            solution: prompt,
            engine: 'Generative Fill',
            type: 'generative',
            checked: true,
            isCustom: true,
          };
          setPlanItems(prev => [...prev, maskStep]);
          
          const resultUrl = await editImage(baseImageBlob, activeSteps, prompt, '1K', currentMaskBlob);
          
          if (resultUrl) {
              addToHistory(resultUrl);
              setIsHighRes(false);
              setIsMaskingMode(false);
              setCurrentMaskBlob(null);
              setUserInput('');
              setStatus('completed'); // Ensure we land in completed state
          }
      } catch (e) {
          console.error(e);
          alert("Masked edit failed.");
          if (isInitial) setStatus('ready'); // Revert status if failed
      } finally {
          setIsProcessing(false);
      }
  };

  const handleUpscale = async () => {
    if (!currentDisplayImage) return;
    setIsUpscaling(true);
    try {
        const blob = await urlToBlob(currentDisplayImage);
        const upscaledUrl = await editImage(blob, [], "", '4K');
        if (upscaledUrl) {
            addToHistory(upscaledUrl);
            setIsHighRes(true);
        }
    } catch (e) {
        console.error("Upscale failed", e);
    } finally {
        setIsUpscaling(false);
    }
  };

  const startMasking = () => {
      setCurrentMaskBlob(null);
      setIsMaskingMode(true);
  };

  const getActiveIndex = (itemId: string) => {
    const activeSteps = planItems.filter((item) => item.checked);
    return activeSteps.findIndex((item) => item.id === itemId);
  };

  const filterItem = planItems.find(item => item.options && item.options.length > 0);

  const getFilterStyle = (name: string): React.CSSProperties => {
    const n = name.toLowerCase();
    const s: string[] = [];
    if (/exposure|brightness|亮度/.test(n)) s.push('brightness(1.15)');
    if (/contrast|对比/.test(n)) s.push('contrast(1.15)');
    if (/warm|温暖|tint/.test(n)) { s.push('sepia(0.2)'); s.push('saturate(1.1)'); s.push('hue-rotate(-8deg)'); }
    if (/cool|冷|blue|蓝/.test(n)) { s.push('saturate(0.95)'); s.push('hue-rotate(18deg)'); }
    if (/vibrance|saturation|饱和/.test(n)) s.push('saturate(1.4)');
    if (/blur|模糊|depth/.test(n)) s.push('blur(2px)');
    if (/bw|b&w|黑白|mono|monochrome|grayscale/.test(n)) s.push('grayscale(100%)');
    if (!s.length) return { filter: 'contrast(1.05) saturate(1.05)' };
    return { filter: s.join(' ') };
  };

  return (
    <div ref={layoutRef} className="bg-[#0b0b0c]" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row', alignItems: 'stretch', userSelect: isResizing ? 'none' : 'auto' }}>
      <div className="relative bg-zinc-900 flex items-center justify-center overflow-hidden" style={{ width: `${leftPct}%`, height: '100vh' }}>
        
        {/* --- Toolbar (Undo/Redo) --- */}
        {!isMaskingMode && status === 'completed' && (
            <div className="absolute top-6 left-6 z-30 flex gap-2">
                <button 
                    onClick={handleUndo} 
                    disabled={historyIndex <= 0}
                    className="p-3 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md disabled:opacity-30 transition-all shadow-lg border border-white/10"
                    title="Undo"
                >
                    <ArrowUturnLeftIcon className="w-5 h-5" />
                </button>
                <button 
                    onClick={handleRedo} 
                    disabled={historyIndex >= imageHistory.length - 1}
                    className="p-3 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md disabled:opacity-30 transition-all shadow-lg border border-white/10"
                    title="Redo"
                >
                    <ArrowUturnRightIcon className="w-5 h-5" />
                </button>
            </div>
        )}

        {/* --- Status Badge --- */}
        {!isMaskingMode && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full text-white text-sm font-medium flex items-center gap-2 border border-white/10 shadow-lg pointer-events-none">
            {status === 'analyzing' && (
                <>
                <ArrowPathIcon className="w-4 h-4 animate-spin" /> {dict.analyzing}
                </>
            )}
            {status === 'ready' && (
                <>
                <AdjustmentsHorizontalIcon className="w-4 h-4" /> {dict.confirm}
                </>
            )}
            {status === 'executing' && (
                <>
                <CpuChipIcon className="w-4 h-4 animate-pulse text-blue-400" /> {dict.processing}
                </>
            )}
            {status === 'completed' && !isUpscaling && !isHighRes && (
                <>
                <CheckCircleIcon className="w-4 h-4 text-green-400" /> {dict.done}
                </>
            )}
            {isUpscaling && (
                <>
                <ArrowsPointingOutIcon className="w-4 h-4 animate-pulse text-yellow-400" /> {dict.upscaling}
                </>
            )}
            {isHighRes && (
                <>
                <SparklesIcon className="w-4 h-4 text-amber-400" /> {dict.hdrReady}
                </>
            )}
            </div>
        )}

        {/* --- Main Viewport --- */}
        {isMaskingMode && currentDisplayImage ? (
            <CanvasMaskEditor 
                imageSrc={currentDisplayImage} 
                onMaskGenerated={(blob) => setCurrentMaskBlob(blob)}
                onCancel={() => {
                    setIsMaskingMode(false);
                    setCurrentMaskBlob(null);
                }}
                onSubmit={() => {
                    setTimeout(executeMaskedEdit, 50);
                }}
                lang={lang}
            />
        ) : (
            <ImageComparator
                originalImage={imagePreview}
                modifiedImage={currentDisplayImage}
                enableSlider={status === 'completed'}
            />
        )}

        {/* --- Filter Dock --- */}
        {!isMaskingMode && status === 'ready' && filterItem && (
          <div className="absolute bottom-6 left-0 right-0 flex justify-center z-30 px-4">
             <div className="flex gap-3 overflow-x-auto p-2 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 max-w-full custom-scrollbar">
                {filterItem.options?.map((opt, idx) => (
                   <button
                     key={idx}
                     onClick={() => handleFilterSelect(filterItem.id, opt)}
                     className={`relative group flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-all ${filterItem.selectedOption === opt ? 'border-purple-500 scale-105' : 'border-transparent hover:border-white/50'}`}
                   >
                      <img src={imagePreview || ''} style={getFilterStyle(opt)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-center p-1">
                          <span className="text-[10px] font-medium text-white text-center leading-tight line-clamp-2">{opt}</span>
                      </div>
                   </button
                   >
                ))}
             </div>
          </div>
        )}

        {/* --- Analysis Scanner (Replaced with DNA) --- */}
        <AnimatePresence>
          {status === 'analyzing' && (
            <DNALoader scanning text={dict.analyzing} />
          )}
        </AnimatePresence>

        {/* --- Processing Overlay (DNALoader) --- */}
        <AnimatePresence>
          {(status === 'executing' || isUpscaling || (isProcessing && isMaskingMode)) && (
             <DNALoader 
                embedded 
                text={
                    isUpscaling 
                    ? dict.upscaling 
                    : isMaskingMode 
                        ? dict.applyingEdits 
                        : dict.crafting
                } 
             />
          )}
        </AnimatePresence>
      </div>

      <div onMouseDown={() => setIsResizing(true)} onTouchStart={() => setIsResizing(true)} style={{ width: 10, cursor: 'col-resize', height: '100vh', background: 'transparent' }} />
      <div className="bg-[#121212] border-l border-white/10 flex flex-col shadow-2xl z-10 text-white" style={{ width: `${100 - leftPct}%`, height: '100vh' }}>
        <div className="p-6 border-b border-white/10 flex-shrink-0 bg-black/30">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-purple-600" />
              {dict.smartAssistant}
            </h2>
            <button
              onClick={onReset}
              className="text-xs text-gray-300 hover:text-white underline"
            >
              {dict.newUpload}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {/* Step List */}
            <div className="space-y-4">
              <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
              <AnimatePresence>
                {planItems.map((item, index) => {
                  const activeIndex = getActiveIndex(item.id);
                  const isProcessingThis = status === 'executing' && activeIndex === currentActiveStepIndex;
                  const isDone = status === 'completed' || (status === 'executing' && activeIndex < currentActiveStepIndex);

                  if (!item.checked) {
                      return (
                          <div 
                              key={item.id} 
                              onClick={() => (status === 'ready' || status === 'analyzing') && toggleItem(item.id)}
                              className={`border border-white/10 bg-[#171717] rounded-2xl p-4 transition-all relative group cursor-pointer opacity-60 hover:opacity-100 hover:bg-[#1f1f1f] hover:shadow-sm`}
                          >
                              <div className="flex gap-3 items-center text-gray-400 group-hover:text-gray-600 transition-colors">
                                  <div className="flex-shrink-0"><ExclamationTriangleIcon className="w-5 h-5" /></div>
                                  <div className="flex-1"><p className="text-sm">{item.problem}</p></div>
                              </div>
                          </div>
                      )
                  }

                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className={`group border rounded-2xl p-4 transition-all duration-300 relative overflow-hidden
                          ${
                            isProcessingThis
                              ? 'bg-purple-500/10 border-purple-400 shadow-md ring-1 ring-purple-400/30 scale-[1.02]'
                              : isDone
                              ? 'bg-green-500/10 border-green-400 shadow-sm'
                              : 'bg-[#1a1a1a] border-white/10'
                          }
                      `}
                    >
                      {status === 'analyzing' && (
                        <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg, rgba(255,255,255,0), rgba(124,58,237,0.16), rgba(255,255,255,0))', transform:'translateX(-100%)', animation:'shimmer 1.8s linear infinite' }} />
                      )}
                      <div className="relative z-10">
                        <div className="flex gap-3 mb-3">
                          <div className="mt-1 flex-shrink-0">
                            {item.isCustom ? (
                                <SparklesIcon className={`w-5 h-5 ${isDone ? 'text-green-500' : 'text-purple-500'}`} />
                            ) : (
                                <ExclamationTriangleIcon className={`w-5 h-5 ${isDone ? 'text-green-400' : 'text-red-400'}`} />
                            )}
                          </div>
                          <div>
                            <h4 className={`text-xs font-bold uppercase tracking-wide mb-0.5 ${isDone ? 'text-green-400' : (item.isCustom ? 'text-purple-400' : 'text-red-400')}`}>
                              {item.isCustom ? dict.userRequest : dict.issue}
                            </h4>
                            <p className="text-sm text-gray-200 font-medium">
                              {item.problem}
                            </p>
                          </div>
                        </div>
                        
                        <div
                          onClick={() => (status === 'ready' || status === 'analyzing') && toggleItem(item.id)}
                          className={`relative overflow-hidden flex gap-3 items-start p-3 rounded-xl cursor-pointer transition-colors 
                              ${
                                isDone
                                    ? 'bg-green-900/20 text-green-300'
                                    : isProcessingThis 
                                      ? 'bg-purple-900/20 text-purple-300'
                                      : 'bg-[#181818] text-gray-300 hover:bg-[#202020]'
                              }
                          `}
                        >
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all mt-0.5 
                                  ${
                                    isDone
                                      ? 'border-green-500 bg-green-500 scale-110'
                                      : isProcessingThis
                                        ? 'border-purple-500 border-t-transparent animate-spin'
                                        : 'border-purple-500 bg-purple-500'
                                  }
                              `}
                          >
                            {isDone && (
                              <CheckIcon className="w-3 h-3 text-white" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold mb-1 flex items-center justify-between text-white">
                              {item.solution}
                              {isProcessingThis && (
                                <span className="text-xs text-purple-400 font-bold animate-pulse">
                                  {dict.processingStep}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Streaming Loading Indicator */}
              {status === 'analyzing' && (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-[#181818]"
                  >
                      <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm text-gray-300 font-medium animate-pulse">{dict.thinking}</span>
                  </motion.div>
              )}
              
              <div ref={listEndRef} />
              
              {planItems.length === 0 && status === 'ready' && (
                <p className="text-center text-gray-400 text-sm py-4">
                  {dict.noSuggestions}
                </p>
              )}
            </div>
        </div>

        <div className="p-4 border-t border-white/10 bg-[#121212] pb-8 z-20">
          {(status === 'ready' || status === 'analyzing') && (
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder={dict.addCustom}
                      className="w-full pl-4 pr-12 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-sm text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUserSubmit()}
                    />
                    <button
                      onClick={handleUserSubmit}
                      className="absolute right-2 top-1.5 p-1.5 bg-[#2a2a2a] hover:bg-[#343434] rounded-lg text-gray-200 transition-colors"
                    >
                      <ArrowUpTrayIcon className="w-4 h-4 rotate-90" />
                    </button>
                  </div>
                   <button
                    onClick={startMasking}
                    className="p-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-gray-300 hover:text-purple-400 hover:border-purple-300 hover:shadow-md transition-all"
                    title={dict.annotateGuide}
                  >
                    <PaintBrushIcon className="w-5 h-5" />
                  </button>
              </div>
              
              <button
                onClick={() => executeMagic()}
                disabled={
                   status === 'analyzing' || (planItems.filter((i) => i.checked).length === 0 && !userInput)
                }
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'analyzing' ? (
                     <>
                        <ArrowPathIcon className="w-5 h-5 animate-spin" /> {dict.analyzing}
                     </>
                ) : (
                    <>
                        <MagicWandIcon className="w-6 h-6 group-hover:rotate-12 transition-transform" />{' '}
                        {dict.generate}
                    </>
                )}
              </button>
            </div>
          )}
          {status === 'executing' && (
            <div className="text-center py-4 text-gray-500">
              <p className="animate-pulse">
                {dict.crafting}
              </p>
            </div>
          )}
          {status === 'completed' && (
            <div className="space-y-3">
              {/* Manual Touch-up Toggle */}
              {!isMaskingMode && (
                <button 
                  onClick={startMasking}
                  disabled={isProcessing}
                  className="w-full py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                    <PaintBrushIcon className="w-4 h-4" /> {dict.manualTouchup}
                </button>
              )}
              
              <div className={`flex items-center gap-2 text-sm p-2 rounded-lg mb-2 transition-colors
                  ${isMaskingMode ? 'bg-purple-100 border border-purple-200' : 'bg-green-50'}
              `}>
                {isMaskingMode ? (
                    <>
                        <PaintBrushIcon className="w-5 h-5 text-purple-600 animate-bounce" />
                        <span className="text-purple-900 font-bold">{dict.annotateGuide}</span>
                    </>
                ) : (
                    <>
                        <CheckCircleIcon className="w-5 h-5 text-green-600" />
                        <span className="text-green-700">{dict.doneAddMore}</span>
                    </>
                )}
              </div>
              
              {/* In Masking Mode, hide standard input to let user focus on canvas toolbar */}
              {!isMaskingMode ? (
                <div className="relative">
                    <input
                    type="text"
                    placeholder={dict.placeholderEdit}
                    disabled={isProcessing}
                    className="w-full pl-4 pr-12 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-sm text-gray-200 placeholder-gray-400 outline-none shadow-sm focus:ring-2 focus:ring-green-500 transition-all"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUserSubmit()}
                    />
                    <button
                    onClick={handleUserSubmit}
                    disabled={isProcessing}
                    className="absolute right-2 top-1.5 p-1.5 text-white rounded-lg transition-colors bg-green-500 hover:bg-green-600 disabled:opacity-50"
                    >
                    {isProcessing ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : (
                        <PaperAirplaneIcon className="w-4 h-4" />
                    )}
                    </button>
                </div>
              ) : (
                 <div className="relative">
                    <input
                    type="text"
                    placeholder={dict.placeholderMask}
                    disabled={isProcessing}
                    className="w-full pl-4 pr-4 py-3 bg-purple-50 border border-purple-200 rounded-xl text-sm text-gray-900 placeholder-purple-400 outline-none shadow-sm focus:ring-2 focus:ring-purple-500 transition-all"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    />
                    <p className="text-xs text-purple-500 mt-1 ml-1">{dict.maskTip}</p>
                </div>
              )}

              <div className="flex flex-col gap-2 mt-2">
                {!isMaskingMode && (
                    <>
                        {!isHighRes ? (
                        <button
                            onClick={handleUpscale}
                            disabled={isUpscaling || isProcessing}
                            className="w-full py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                        >
                            <ArrowsPointingOutIcon className="w-5 h-5" />
                            {isUpscaling ? dict.upscalingBtn : dict.magicUpscale}
                        </button>
                        ) : (
                        <div className="w-full py-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl font-medium flex items-center justify-center gap-2">
                            <CheckIcon className="w-5 h-5" /> {dict.enhanced}
                        </div>
                        )}

                        <div className="flex gap-3">
                        <a
                            href={currentDisplayImage || ''}
                            download="magic-result.png"
                            className="w-full flex items-center justify-center py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors shadow-lg"
                        >
                            {isHighRes ? dict.download4k : dict.downloadResult}
                        </a>
                        </div>
                    </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
