import React, { useState, useEffect, useRef } from 'react';
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
import { analyzeImage, editImage, urlToBlob } from '../services/gemini';
import { PlanItem } from '../types';

const MagicWandIcon = SparklesIcon;

interface SmartEditorProps {
  imagePreview: string | null;
  imageFile: File | null;
  onReset: () => void;
}

export const SmartEditor: React.FC<SmartEditorProps> = ({
  imagePreview,
  imageFile,
  onReset,
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

  // Initial Load & Analysis
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      if (!imageFile) return;
      
      // Initialize history with original image
      if (imagePreview) {
          setImageHistory([imagePreview]);
          setHistoryIndex(0);
      }

      const result = await analyzeImage(imageFile);
      
      if (isMounted && result && result.analysis) {
        const items = result.analysis.map((item, idx) => ({
          ...item,
          id: item.id || `idx_${idx}`,
          checked: true,
        }));
        setPlanItems(items);
        setStatus('ready');
      } else if (isMounted) {
        setPlanItems([]);
        setStatus('ready');
      }
    };
    init();
    return () => {
      isMounted = false;
    };
  }, [imageFile]);

  // Scroll to bottom helper
  useEffect(() => {
    if (listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [planItems.length, status]);

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

  const handleUserSubmit = async () => {
    // In masking mode, validation happens in executeMaskedEdit
    if (isMaskingMode) {
        await executeMaskedEdit();
        return;
    }

    if (!userInput.trim()) return;

    const newStep: PlanItem = {
      id: `custom_${Date.now()}`,
      problem: 'User Request',
      solution: userInput,
      engine: 'Smart Engine',
      type: 'generative',
      checked: true,
      isCustom: true,
    };

    if (status === 'ready') {
      setPlanItems((prev) => [...prev, newStep]);
      setUserInput('');
    } else if (status === 'completed') {
      const updatedItems = [...planItems, newStep];
      setPlanItems(updatedItems);
      setUserInput('');
      // Re-run generation with accumulated steps
      await executeMagic(updatedItems);
    }
  };

  const executeMagic = async (itemsOverride?: PlanItem[]) => {
    if (!imageFile) return;
    
    const currentItems = itemsOverride || planItems;
    const activeSteps = currentItems.filter((item) => item.checked);
    
    setStatus('executing');
    setCurrentActiveStepIndex(0);
    setIsProcessing(true);

    const progressInterval = setInterval(() => {
        setCurrentActiveStepIndex(prev => {
            if (prev < activeSteps.length - 1) {
                return prev + 1;
            }
            return prev; 
        });
    }, 2000); 

    try {
        const resultUrl = await editImage(imageFile, activeSteps, "");
        
        clearInterval(progressInterval);
        
        if (resultUrl) {
            addToHistory(resultUrl);
            setIsHighRes(false);
        }
        setStatus('completed');
        setCurrentActiveStepIndex(-1);
    } catch (e) {
        clearInterval(progressInterval);
        setStatus('ready');
        alert("Generation failed. Please try again.");
    } finally {
        setIsProcessing(false);
    }
  };
  
  const executeMaskedEdit = async () => {
      if (!currentMaskBlob || !currentDisplayImage) return;
      
      const prompt = userInput.trim() || "Apply edits based on visual annotations.";
      
      setIsProcessing(true);
      
      try {
          const baseImageBlob = await urlToBlob(currentDisplayImage);
          
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
          
          const resultUrl = await editImage(baseImageBlob, [], prompt, false, currentMaskBlob);
          
          if (resultUrl) {
              addToHistory(resultUrl);
              setIsHighRes(false);
              
              setIsMaskingMode(false);
              setCurrentMaskBlob(null);
              setUserInput('');
          }
      } catch (e) {
          console.error(e);
          alert("Masked edit failed.");
      } finally {
          setIsProcessing(false);
      }
  };

  const handleUpscale = async () => {
    if (!currentDisplayImage) return;
    setIsUpscaling(true);
    
    try {
        const blob = await urlToBlob(currentDisplayImage);
        const upscaledUrl = await editImage(blob, [], "", true);
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F5F5F7]">
      <div className="w-full md:w-2/3 h-[50vh] md:h-screen relative bg-zinc-900 flex items-center justify-center overflow-hidden">
        
        {/* --- Toolbar (Undo/Redo) --- */}
        {!isMaskingMode && status === 'completed' && (
            <div className="absolute top-6 left-6 z-30 flex gap-2">
                <button 
                    onClick={handleUndo} 
                    disabled={historyIndex <= 0}
                    className="p-3 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md disabled:opacity-30 transition-all"
                    title="Undo"
                >
                    <ArrowUturnLeftIcon className="w-5 h-5" />
                </button>
                <button 
                    onClick={handleRedo} 
                    disabled={historyIndex >= imageHistory.length - 1}
                    className="p-3 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md disabled:opacity-30 transition-all"
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
                <ArrowPathIcon className="w-4 h-4 animate-spin" /> Analyzing Composition...
                </>
            )}
            {status === 'ready' && (
                <>
                <AdjustmentsHorizontalIcon className="w-4 h-4" /> Confirm Edits
                </>
            )}
            {status === 'executing' && (
                <>
                <CpuChipIcon className="w-4 h-4 animate-pulse text-blue-400" /> Processing Edits...
                </>
            )}
            {status === 'completed' && !isUpscaling && !isHighRes && (
                <>
                <CheckCircleIcon className="w-4 h-4 text-green-400" /> Done.
                </>
            )}
            {isUpscaling && (
                <>
                <ArrowsPointingOutIcon className="w-4 h-4 animate-pulse text-yellow-400" /> Upscaling to 4K...
                </>
            )}
            {isHighRes && (
                <>
                <SparklesIcon className="w-4 h-4 text-amber-400" /> 4K HDR Ready
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
                    // Slight delay to ensure blob is updated
                    setTimeout(executeMaskedEdit, 50);
                }}
            />
        ) : (
            <ImageComparator
                originalImage={imagePreview}
                modifiedImage={currentDisplayImage}
                enableSlider={status === 'completed'}
            />
        )}

        {/* --- Analysis Scanner --- */}
        <AnimatePresence>
          {status === 'analyzing' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 pointer-events-none"
            >
              <motion.div
                className="absolute left-0 right-0 z-20"
                initial={{ top: '-10%' }}
                animate={{ top: '110%' }}
                transition={{ duration: 2.5, ease: 'easeInOut', repeat: Infinity }}
              >
                <div className="h-32 w-full bg-gradient-to-b from-transparent via-blue-500/10 to-blue-500/50 border-b-2 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.6)]"></div>
              </motion.div>
              <div className="absolute inset-0 bg-blue-900/10 backdrop-blur-[1px]" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- Processing Overlay --- */}
        <AnimatePresence>
          {(status === 'executing' || isUpscaling || (isProcessing && isMaskingMode)) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-black/40 backdrop-blur-md flex flex-col items-center justify-center"
            >
              <div className="relative">
                <div
                  className={`w-24 h-24 rounded-full border-4 animate-ping absolute inset-0 ${
                    isUpscaling ? 'border-yellow-500/30' : 'border-purple-500/30'
                  }`}
                ></div>
                <div className="w-24 h-24 rounded-full bg-white/10 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-lg">
                  {isUpscaling ? (
                    <ArrowsPointingOutIcon className="w-12 h-12 text-yellow-300" />
                  ) : (
                    <MagicWandIcon className="w-12 h-12 text-purple-300" />
                  )}
                </div>
              </div>
              <p className="mt-6 text-white font-medium text-lg tracking-widest uppercase">
                {isUpscaling
                  ? 'Enhancing to 4K...'
                  : isMaskingMode ? 'Applying Visual Edits...' : 'Optimizing Details...'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- Right Panel: Controls --- */}
      <div className="w-full md:w-1/3 h-[50vh] md:h-screen bg-white border-l border-gray-200 flex flex-col shadow-2xl z-10">
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-gray-50/50">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-zinc-800 flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-purple-600" />
              Smart Assistant
            </h2>
            <button
              onClick={onReset}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              New Upload
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {status === 'analyzing' ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-24 bg-gray-100 rounded-xl"></div>
              <div className="h-24 bg-gray-100 rounded-xl"></div>
              <div className="h-24 bg-gray-100 rounded-xl"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {planItems.map((item, index) => {
                const activeIndex = getActiveIndex(item.id);
                const isProcessingThis = status === 'executing' && activeIndex === currentActiveStepIndex;
                const isDone = status === 'completed' || (status === 'executing' && activeIndex < currentActiveStepIndex);

                if (!item.checked) {
                    return (
                        <div 
                            key={item.id} 
                            onClick={() => status === 'ready' && toggleItem(item.id)}
                            className={`border border-transparent bg-gray-50 rounded-2xl p-4 transition-all relative group
                                ${status === 'ready' 
                                    ? 'cursor-pointer opacity-60 hover:opacity-100 hover:bg-white hover:shadow-sm hover:border-gray-200' 
                                    : 'opacity-40'
                                }
                            `}
                        >
                             <div className="flex gap-3 items-center text-gray-400 group-hover:text-gray-600 transition-colors">
                                <div className="flex-shrink-0"><ExclamationTriangleIcon className="w-5 h-5" /></div>
                                <div className="flex-1"><p className="text-sm">{item.problem}</p></div>
                                {status === 'ready' && (
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-1 rounded-md whitespace-nowrap">
                                            Add Back
                                        </span>
                                    </div>
                                )}
                             </div>
                        </div>
                    )
                }

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`group border rounded-2xl p-4 transition-all duration-300 relative overflow-hidden
                        ${
                          isProcessingThis
                            ? 'bg-purple-50 border-purple-400 shadow-md ring-1 ring-purple-400/30 scale-[1.02]'
                            : isDone
                            ? 'bg-green-50/40 border-green-200 shadow-sm'
                            : 'bg-white border-gray-200'
                        }
                    `}
                  >
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
                          <h4 className={`text-xs font-bold uppercase tracking-wide mb-0.5 ${isDone ? 'text-green-600' : (item.isCustom ? 'text-purple-500' : 'text-red-500')}`}>
                            {item.isCustom ? 'User Request' : 'Issue Detected'}
                          </h4>
                          <p className="text-sm text-gray-700 font-medium">
                            {item.problem}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex justify-center mb-3 opacity-20">
                        <ArrowDownTrayIcon className="w-4 h-4 text-gray-400" />
                      </div>

                      <div
                        onClick={() => status === 'ready' && toggleItem(item.id)}
                        className={`flex gap-3 items-start p-3 rounded-xl cursor-pointer transition-colors 
                            ${
                               isDone
                                  ? 'bg-green-100 text-green-800'
                                  : isProcessingThis 
                                    ? 'bg-purple-100 text-purple-900'
                                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
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
                          <p className="text-sm font-semibold mb-1 flex items-center justify-between">
                            {item.solution}
                            {isProcessingThis && (
                              <span className="text-xs text-purple-600 font-bold animate-pulse">
                                Processing...
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={listEndRef} />
              {planItems.length === 0 && status === 'ready' && (
                <p className="text-center text-gray-400 text-sm py-4">
                  No automatic suggestions. Please input manually below.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-white pb-8 z-20">
          {status === 'ready' && (
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Add custom requirement..."
                  className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUserSubmit()}
                />
                <button
                  onClick={handleUserSubmit}
                  className="absolute right-2 top-1.5 p-1.5 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-600 transition-colors"
                >
                  <ArrowUpTrayIcon className="w-4 h-4 rotate-90" />
                </button>
              </div>
              <button
                onClick={() => executeMagic()}
                disabled={
                  planItems.filter((i) => i.checked).length === 0 && !userInput
                }
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MagicWandIcon className="w-6 h-6 group-hover:rotate-12 transition-transform" />{' '}
                Generate Magic Edit
              </button>
            </div>
          )}
          {status === 'executing' && (
            <div className="text-center py-4 text-gray-500">
              <p className="animate-pulse">
                Crafting your masterpiece...
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
                    <PaintBrushIcon className="w-4 h-4" /> Manual Touch-up (Inpaint)
                </button>
              )}
              
              <div className={`flex items-center gap-2 text-sm p-2 rounded-lg mb-2 transition-colors
                  ${isMaskingMode ? 'bg-purple-100 border border-purple-200' : 'bg-green-50'}
              `}>
                {isMaskingMode ? (
                    <>
                        <PaintBrushIcon className="w-5 h-5 text-purple-600 animate-bounce" />
                        <span className="text-purple-900 font-bold">Annotate image to guide the editor.</span>
                    </>
                ) : (
                    <>
                        <CheckCircleIcon className="w-5 h-5 text-green-600" />
                        <span className="text-green-700">Done! Add more edits below:</span>
                    </>
                )}
              </div>
              
              {/* In Masking Mode, hide standard input to let user focus on canvas toolbar */}
              {!isMaskingMode ? (
                <div className="relative">
                    <input
                    type="text"
                    placeholder="E.g., Make the sky bluer..."
                    disabled={isProcessing}
                    className="w-full pl-4 pr-12 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-500 outline-none shadow-sm focus:ring-2 focus:ring-green-500 transition-all"
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
                    placeholder="Describe your annotation (Optional)..."
                    disabled={isProcessing}
                    className="w-full pl-4 pr-4 py-3 bg-purple-50 border border-purple-200 rounded-xl text-sm text-gray-900 placeholder-purple-400 outline-none shadow-sm focus:ring-2 focus:ring-purple-500 transition-all"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    />
                    <p className="text-xs text-purple-500 mt-1 ml-1">Use the toolbar on the image to draw and submit.</p>
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
                            {isUpscaling ? 'Upscaling...' : '✨ Magic 4K Upscale'}
                        </button>
                        ) : (
                        <div className="w-full py-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl font-medium flex items-center justify-center gap-2">
                            <CheckIcon className="w-5 h-5" /> 4K Enhanced
                        </div>
                        )}

                        <div className="flex gap-3">
                        <a
                            href={currentDisplayImage || ''}
                            download="magic-result.png"
                            className="w-full flex items-center justify-center py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors shadow-lg"
                        >
                            {isHighRes ? 'Download 4K' : 'Download Result'}
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