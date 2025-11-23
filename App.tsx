import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HomePage } from './components/HomePage';
import { SmartEditor } from './components/SmartEditor';
import { checkAndRequestApiKey } from './services/gemini';

export default function App() {
  const [page, setPage] = useState<'home' | 'smartEditor'>('home');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isLoadingKey, setIsLoadingKey] = useState(true);

  useEffect(() => {
    // Check for API key on mount, mandatory for Gemini 3 Pro Image
    const initKey = async () => {
      const authorized = await checkAndRequestApiKey();
      setHasApiKey(authorized);
      setIsLoadingKey(false);
    };
    initKey();
  }, []);

  const handleFileUpload = (file: File) => {
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      setImageFile(file);
      setPage('smartEditor');
    }
  };

  const handleReset = () => {
    setImagePreview(null);
    setImageFile(null);
    setPage('home');
  };

  if (isLoadingKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
        <div className="animate-pulse flex flex-col items-center">
            <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin mb-4"></div>
            <p className="text-zinc-500 font-medium">Verifying Access...</p>
        </div>
      </div>
    );
  }

  if (!hasApiKey) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] p-4 text-center">
              <h1 className="text-2xl font-bold text-zinc-800 mb-2">API Key Required</h1>
              <p className="text-zinc-500 mb-6 max-w-md">
                  To use the high-fidelity professional model, you must select a paid project API key.
              </p>
              <button 
                onClick={async () => {
                    const success = await checkAndRequestApiKey();
                    setHasApiKey(success);
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                  Connect Google Cloud Project
              </button>
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="mt-4 text-sm text-blue-500 hover:underline">
                  Learn about billing
              </a>
          </div>
      )
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] font-sans overflow-hidden selection:bg-blue-200 selection:text-blue-900">
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
            <HomePage onFileUpload={handleFileUpload} />
          ) : (
            <SmartEditor
              imagePreview={imagePreview}
              imageFile={imageFile}
              onReset={handleReset}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}