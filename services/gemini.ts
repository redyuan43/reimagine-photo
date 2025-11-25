
import { AnalysisResponse, PlanItem } from "../types";

// --- MOCK DATA ---

const MOCK_ITEMS: PlanItem[] = [
    {
      id: "1",
      problem: "Poor Lighting Detected",
      solution: "Adjust exposure and contrast",
      engine: "Adjustment",
      type: "adjustment",
      checked: true
    },
    {
      id: "2",
      problem: "Distracting Background",
      solution: "Remove clutter & blur depth",
      engine: "Generative",
      type: "generative",
      checked: true
    },
    {
      id: "3",
      problem: "Skin Tone Imbalance",
      solution: "Correct warmth & tint",
      engine: "Adjustment",
      type: "adjustment",
      checked: true
    },
    {
      id: "filter_opt",
      problem: "Creative Styles",
      solution: "Apply Artistic Filter",
      engine: "Filter",
      type: "adjustment",
      checked: false, // Default unchecked for filters
      options: [
        "Cinematic Warm",
        "Cool Breeze",
        "Vintage 90s",
        "Cyberpunk",
        "Soft Pastel",
        "B&W Noir"
      ]
    }
];

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

// --- Analysis Service (Streaming Mock) ---
// Now accepts a callback to stream items one by one
export const analyzeImage = async (
  file: File, 
  onPartialResult: (item: PlanItem) => void
): Promise<void> => {
  console.log("Mock: Analyzing image (Streaming)...");
  
  // Simulate initial "upload and vision processing" delay
  await new Promise(r => setTimeout(r, 800));

  // Stream items one by one with random delays
  for (const item of MOCK_ITEMS) {
      await new Promise(r => setTimeout(r, Math.random() * 800 + 400));
      // Clone to avoid reference issues
      onPartialResult({ ...item });
  }

  // Simulate final wrap up
  await new Promise(r => setTimeout(r, 500));
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
