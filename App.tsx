import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HomePage } from './components/HomePage';
import { SmartEditor } from './components/SmartEditor';
import { DNALoader } from './components/DNALoader';
import { checkAndRequestApiKey } from './services/gemini';

export default function App() {
  const [page, setPage] = useState<'home' | 'smartEditor'>('home');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [initialPrompt, setInitialPrompt] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isLoadingKey, setIsLoadingKey] = useState(true);
  
  // Intro State
  const [showIntro, setShowIntro] = useState(true);
  
  // Global Language State (Default to Chinese as requested)
  const [lang, setLang] = useState<'zh' | 'en'>('zh');

  useEffect(() => {
    // 1. Initialize API Key (Mock)
    const initKey = async () => {
      const authorized = await checkAndRequestApiKey();
      setHasApiKey(authorized);
      setIsLoadingKey(false);
    };
    initKey();

    // 2. Handle Intro Timer
    const introTimer = setTimeout(() => {
      setShowIntro(false);
    }, 2500); // 2.5s Intro

    return () => clearTimeout(introTimer);
  }, []);

  const handleStart = (file: File, prompt: string = '') => {
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      setImageFile(file);
      setInitialPrompt(prompt);
      setPage('smartEditor');
    }
  };

  const handleReset = () => {
    setImagePreview(null);
    setImageFile(null);
    setInitialPrompt('');
    setPage('home');
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] font-sans overflow-hidden selection:bg-blue-200 selection:text-blue-900">
      <AnimatePresence mode="wait">
        {showIntro ? (
          <DNALoader key="loader" />
        ) : (
          <motion.div
            key="app-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="w-full h-full"
          >
             {/* If key loading fails (unlikely in mock), show error. Else show app. */}
             {!isLoadingKey && !hasApiKey ? (
                  <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] p-4 text-center">
                    <h1 className="text-2xl font-bold text-zinc-800 mb-2">Dev Mode Error</h1>
                    <button 
                      onClick={() => window.location.reload()}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium"
                    >
                        Retry
                    </button>
                </div>
             ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={page}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-full"
                  >
                    {page === 'home' ? (
                      <HomePage 
                          onStart={handleStart} 
                          lang={lang} 
                          setLang={setLang} 
                      />
                    ) : (
                      <SmartEditor
                        imagePreview={imagePreview}
                        imageFile={imageFile}
                        initialPrompt={initialPrompt}
                        onReset={handleReset}
                        lang={lang}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
             )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}