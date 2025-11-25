
import { AnalysisResponse, PlanItem } from "../types";

// --- MOCK DATA ---

const MOCK_ANALYSIS: AnalysisResponse = {
  analysis: [
    {
      id: "1",
      problem: "Mock Issue: Poor Lighting",
      solution: "Adjust exposure and contrast",
      engine: "Adjustment",
      type: "adjustment"
    },
    {
      id: "2",
      problem: "Mock Issue: Distracting Elements",
      solution: "Remove background clutter",
      engine: "Generative",
      type: "generative"
    },
    {
      id: "3",
      problem: "Mock Issue: Color Balance",
      solution: "Correct skin tones",
      engine: "Adjustment",
      type: "adjustment"
    },
    {
      id: "filter_opt",
      problem: "Filter Suggestions",
      solution: "Apply Creative Style",
      engine: "Filter",
      type: "adjustment",
      options: [
        "Cinematic Warm",
        "Cool Breeze",
        "Vintage 90s",
        "Cyberpunk",
        "Soft Pastel",
        "B&W Noir"
      ]
    }
  ]
};

// --- API Key Management (Mocked) ---
export const checkAndRequestApiKey = async (): Promise<boolean> => {
  console.log("Mock: API Key check bypassed for UI dev");
  return true; 
};

// --- Helper (Unchanged) ---
export const urlToBlob = async (url: string): Promise<Blob> => {
  const res = await fetch(url);
  return await res.blob();
};

// --- Analysis Service (Mocked) ---
export const analyzeImage = async (file: File): Promise<AnalysisResponse | null> => {
  console.log("Mock: Analyzing image...");
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(MOCK_ANALYSIS);
    }, 1500); // Simulate 1.5s delay
  });
};

// --- Editing Service (Mocked) ---
export const editImage = async (
  imageBlob: Blob,
  activeSteps: PlanItem[],
  userInstruction: string,
  resolution: '1K' | '2K' | '4K' = '1K',
  maskBlob?: Blob,
  filename: string = "image.png"
): Promise<string | null> => {
  console.log("Mock: Editing image...", { activeSteps, userInstruction, resolution, hasMask: !!maskBlob });
  
  return new Promise((resolve) => {
    setTimeout(() => {
      // Return a random image to simulate a result so the slider works
      // Using a slightly different seed or query to ensure the browser fetches a new image
      const mockResult = `https://picsum.photos/seed/${Date.now()}/1024/768`; 
      resolve(mockResult);
    }, 2000); // Simulate 2s processing
  });
};
