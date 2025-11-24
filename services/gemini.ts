import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AnalysisResponse, PlanItem } from "../types";

// Helpers
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// API Key Management
export const checkAndRequestApiKey = async (): Promise<boolean> => {
  if (window.aistudio) {
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await window.aistudio.openSelectKey();
      // Assume success after dialog closes or handle loop in UI
      return await window.aistudio.hasSelectedApiKey();
    }
    return true;
  }
  // Fallback for dev environments without aistudio object (e.g. local with .env)
  return !!process.env.API_KEY;
};

const getClient = () => {
  // Always create a new instance to grab the latest key from env injected by aistudio
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Analysis Service (Using Gemini 3 Pro for advanced reasoning)
export const analyzeImage = async (file: File): Promise<AnalysisResponse | null> => {
  try {
    const client = getClient();
    const base64Data = await blobToBase64(file);

    const prompt = `
      Act as a World-Class Senior Retoucher and Professional Photographer.
      Conduct a critical, granular analysis of this image. Do not be polite; be technically precise.
      
      You MUST scrutinize:
      1. **Body & Figure**: Look for belly bulges, folds, posture issues, double chins, or unflattering angles.
      2. **Composition**: Check for messy backgrounds, distractions, rule of thirds violations, or cropping issues.
      3. **Lighting & Color**: Identify overexposure, skin tone imbalances, or lack of dynamic range.
      4. **Details**: Flyaway hairs, skin blemishes, clothes wrinkles.

      Output strict JSON format:
      {
        "analysis": [
          {
            "id": "1",
            "problem": "Description of the problem (in Chinese). Be direct.",
            "solution": "Professional retouching solution (in Chinese).",
            "engine": "Technique (e.g., Liquify, Frequency Separation, Inpainting)",
            "type": "generative" | "adjustment"
          }
        ]
      }
      Identify at least 4-5 significant, professional-level improvements. Language: Chinese.
    `;

    const response: GenerateContentResponse = await client.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: file.type,
              data: base64Data
            }
          }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    return null;
  } catch (error) {
    console.error("Analysis failed:", error);
    return null;
  }
};

// Editing Service (Using Flash for speed, Pro for Upscale)
export const editImage = async (
  imageBlob: Blob, 
  activeSteps: PlanItem[], 
  userInstruction: string,
  isUpscale: boolean = false,
  maskBlob?: Blob
): Promise<string | null> => {
  try {
    const client = getClient();
    const base64Data = await blobToBase64(imageBlob);

    let promptText = "";
    const parts: any[] = [];
    
    // Model Selection: Use Gemini 3 Pro for high-quality standard edits as requested
    let modelName = 'gemini-3-pro-image-preview';
    let imageConfig: any = {};

    if (isUpscale) {
      // 4K Upscale Configuration
      imageConfig = { imageSize: "4K" };
      promptText = "Upscale this image to 4K resolution. Enhance details, sharpen edges, and improve texture while maintaining the exact original composition and identity.";
      parts.push({ text: promptText });
      parts.push({ inlineData: { mimeType: imageBlob.type, data: base64Data } });
    } else if (maskBlob) {
       // MASKING / INPAINTING MODE
       const maskBase64 = await blobToBase64(maskBlob);
       promptText = `
         Task: Targeted Image Editing.
         Instruction: ${userInstruction}.
         
         Guide: Use the provided MASK image (second image) to locate the edit area. 
         White pixels in the mask indicate the region to modify. Black pixels must remain unchanged.
         
         Apply the instruction strictly to the masked area. Blend the changes seamlessly with the surrounding pixels.
         Output photorealistic results.
       `;
       
       parts.push({ text: promptText });
       // Order matters: Image first, then mask (convention for multimodal context)
       parts.push({ inlineData: { mimeType: imageBlob.type, data: base64Data } });
       parts.push({ inlineData: { mimeType: 'image/png', data: maskBase64 } });
    } else {
      // STANDARD MODE
      let editsInstruction = "";
      if (activeSteps.length > 0) {
        const stepsText = activeSteps.map(s => s.solution).join('; ');
        editsInstruction = `Apply these specific edits: ${stepsText}.`;
      }
      
      promptText = `
        Task: Professional Photo Retouching.
        ${editsInstruction}
        User additional instruction: ${userInstruction || "None"}.
        
        CRITICAL RULES:
        1. High fidelity output.
        2. Preserve facial identity perfectly.
        3. Only modify requested areas.
        4. Output photorealistic results.
      `;
      
      parts.push({ text: promptText });
      parts.push({ inlineData: { mimeType: imageBlob.type, data: base64Data } });
    }

    const response: GenerateContentResponse = await client.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        imageConfig: Object.keys(imageConfig).length > 0 ? imageConfig : undefined
      }
    });

    // Extract image from response
    const responseParts = response.candidates?.[0]?.content?.parts;
    if (responseParts) {
      for (const part of responseParts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("Image generation failed:", error);
    return null;
  }
};

// Helper to convert URL back to Blob for chaining edits
export const urlToBlob = async (url: string): Promise<Blob> => {
  const res = await fetch(url);
  return await res.blob();
};