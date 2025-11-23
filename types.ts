export interface PlanItem {
  id: string;
  problem: string;
  solution: string;
  engine: string;
  type: 'generative' | 'adjustment';
  checked: boolean;
  isCustom?: boolean;
}

export interface AnalysisResponse {
  analysis: {
    id: string;
    problem: string;
    solution: string;
    engine: string;
    type: 'generative' | 'adjustment';
  }[];
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}