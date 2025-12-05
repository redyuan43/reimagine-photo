
import { AnalysisResponse, PlanItem } from "../types";
import { getApiBaseUrl, urlToBlob, checkAndRequestApiKey } from "./core";

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
      problem: "",
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
export { checkAndRequestApiKey };

// --- Helper (Unchanged) ---
export { urlToBlob, getApiBaseUrl };

// --- Analysis Service (Streaming Mock) ---
// Now accepts a callback to stream items one by one
export const analyzeImage = async (
  file: File,
  onPartialResult: (item: PlanItem) => void
): Promise<string | undefined> => {
  const mod = await import('./analyze');
  const summary = await mod.analyzeImage(file, onPartialResult);
  if (typeof summary !== 'undefined') {
    return summary;
  }
  await new Promise(r => setTimeout(r, 800));
  for (const item of MOCK_ITEMS) {
    await new Promise(r => setTimeout(r, Math.random() * 800 + 400));
    onPartialResult({ ...item });
  }
  await new Promise(r => setTimeout(r, 500));
  return undefined;
};

// --- Editing Service (Mocked) ---
export const editImage = async (
  imageBlob: Blob,
  activeSteps: PlanItem[],
  userInstruction: string,
  resolution: '1K' | '2K' | '4K' = '1K',
  filename: string = "image.png",
  analysisSummary?: string
): Promise<string | null> => {
  const sanitizeSummary = (txt?: string): string => {
    const s = (txt || '').trim();
    if (!s) return '';
    const pat = /(建议|推荐|滤镜|建议效果|风格化推荐)/;
    const parts = s.split(/(?<=[。！？!?;；\n])/);
    return parts.filter(p => !pat.test(p)).join('').trim();
  };
  const containsFaceLock = (txt?: string): boolean => {
    const s = (txt || '').toLowerCase();
    const keys = [
      '面部特征不变',
      '保留原始面部',
      '面部锁定',
      '面部固定',
      '保持人脸不变',
      'face lock',
      'facial area'
    ];
    return keys.some(k => s.includes(k.toLowerCase()));
  };
  const isPortrait = (txt?: string, items?: PlanItem[]): boolean => {
    const t = (txt || '').toLowerCase();
    const kw = ['人像','人物','人脸','肖像','女性','男性','男','女','脸','面部'];
    if (kw.some(k => t.includes(k))) return true;
    for (const it of (items || [])) {
      const c = (it.category || '').toLowerCase();
      const p = (it.problem || '').toLowerCase();
      const s = (it.solution || '').toLowerCase();
      if (c.includes('面部') || p.includes('面部') || s.includes('面部')) return true;
      if (c.includes('skin') || p.includes('skin') || s.includes('skin')) return true;
      if (c.includes('肤') || p.includes('肤') || s.includes('肤')) return true;
      if (c.includes('face') || p.includes('face') || s.includes('face')) return true;
    }
    return false;
  };
  const getImageSize = (blob: Blob): Promise<{ w: number; h: number } | null> => new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      URL.revokeObjectURL(url);
      resolve({ w, h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });

  try {
    const fd = new FormData();
    console.log('Uploading image blob size:', (imageBlob as any)?.size ?? 'unknown');
    fd.append('image', imageBlob, filename);

    const typeWeight = (t?: string) => {
      const v = (t || '').toLowerCase();
      if (v === 'generative') return 300;
      if (v === 'adjustment') return 200;
      return 100;
    };
    const categoryWeight = (c?: string) => {
      const v = (c || '').toLowerCase();
      if (v.includes('构图') || v.includes('composition')) return 280;
      if (v.includes('光线') || v.includes('色彩') || v.includes('light') || v.includes('color')) return 240;
      if (v.includes('细节') || v.includes('detail')) return 200;
      if (v.includes('风格') || v.includes('滤镜') || v.includes('style') || v.includes('filter')) return 120;
      return 160;
    };
    const enginePenalty = (e?: string, p?: string, s?: string, c?: string) => {
      const ev = (e || '').toLowerCase();
      const txt = `${p || ''} ${s || ''} ${c || ''}`.toLowerCase();
      if (ev.includes('filter') || txt.includes('滤镜') || txt.includes('filter') || txt.includes('风格')) return -80;
      return 0;
    };
    const prioWeight = (p?: 'high'|'medium'|'low') => p === 'high' ? 900 : p === 'medium' ? 600 : p === 'low' ? 300 : 0;

    const decorated = (activeSteps || []).map((s, idx) => {
      const pw = prioWeight(s.priority);
      const tw = typeWeight(s.type);
      const cw = categoryWeight(s.category);
      const ep = enginePenalty(s.engine, s.problem, s.solution, s.category);
      const w = pw || (tw + cw + ep);
      return { idx, w, s };
    });
    decorated.sort((a, b) => {
      if (b.w !== a.w) return b.w - a.w;
      const ah = (a.s.priority || '').toLowerCase() === 'high';
      const bh = (b.s.priority || '').toLowerCase() === 'high';
      if (ah && bh) {
        const ac = (a.s.category || '').toLowerCase();
        const bc = (b.s.category || '').toLowerCase();
        const aIsComp = ac.includes('构图') || ac.includes('composition');
        const bIsComp = bc.includes('构图') || bc.includes('composition');
        if (aIsComp && !bIsComp) return -1;
        if (!aIsComp && bIsComp) return 1;
      }
      return a.idx - b.idx;
    });

    const lines: string[] = [];
    for (const d of decorated) {
      const problem = d.s.problem?.trim();
      const solution = d.s.solution?.trim();
      const line = [problem, solution].filter(Boolean).join(': ');
      if (line) lines.push(`- ${line}`);
    }
    const combinedSteps = lines.join('\n');
    const cleanSummary = sanitizeSummary(analysisSummary);
    const context = cleanSummary ? `\n[Image Context & Style]\n${cleanSummary}` : "";
    const needFaceLock = isPortrait(analysisSummary, activeSteps) && !containsFaceLock(userInstruction);
    const faceLock = needFaceLock ? '保持主体人物面部特征完全不变，仅修改非面部区域' : '';
    const finalPrompt = [userInstruction?.trim(), faceLock, combinedSteps, context].filter(Boolean).join('\n');
    console.log("Qwen Image Edit Prompt:", finalPrompt);
    fd.append('prompt', finalPrompt);

    fd.append('n', '1');
    const dims = await getImageSize(imageBlob);
    if (dims && dims.w && dims.h) {
      let w = dims.w, h = dims.h;
      if (w < 512 || h < 512) {
        console.log(`[DEBUG] 小图尺寸 (${w}*${h}) 低于API最小限制，跳过 size 参数`);
      } else {
        if (w > 2048 || h > 2048) {
          const scale = Math.min(2048 / w, 2048 / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
          console.log(`[DEBUG] 输出尺寸上限归一化: ${dims.w}*${dims.h} -> ${w}*${h}`);
        } else {
          console.log(`[DEBUG] 原始图像尺寸: ${w}*${h}`);
        }
        fd.append('size', `${w}*${h}`);
      }
    } else {
      console.log('[DEBUG] 无法获取原始图像尺寸，跳过 size 参数');
    }
    fd.append('watermark', 'false');
    fd.append('prompt_extend', 'true');
      const res = await fetch(`${getApiBaseUrl()}/magic_edit`, { method: 'POST', body: fd });
    console.log('magic_edit response status:', res.status, res.ok);
    if (res.ok) {
      const data = await res.json() as { urls?: string[] };
      console.log('magic_edit response data:', data);
      const url = (data.urls && data.urls[0]) || null;
      console.log('Extracted URL:', url);
      if (!url) {
        console.error('No URL found in response, data:', data);
        throw new Error('No URLs returned');
      }
      console.log('Returning URL:', url);
      return url;
    }
    const txt = await res.text();
    console.error('magic_edit failed, status:', res.status, 'response:', txt);
    throw new Error(`magic_edit failed ${res.status}: ${txt}`);
  } catch (e) {
    throw e;
  }
};

export const getPreviewForUpload = async (file: File): Promise<string> => {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`${getApiBaseUrl()}/preview`, { method: 'POST', body: fd });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `preview failed ${res.status}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
};

export const convertHeicClient = async (file: File): Promise<string> => {
  try {
    const heic2any = (await import('heic2any')).default as any;
    const outputBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9,
    });
    return URL.createObjectURL(outputBlob);
  } catch (e) {
    throw e;
  }
};

export const convertHeicClientBlob = async (file: File): Promise<Blob> => {
  const heic2any = (await import('heic2any')).default as any;
  const outputBlob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  return outputBlob as Blob;
};

export const convertImage = async (
  imageBlob: Blob,
  format: 'jpeg' | 'png' | 'webp' | 'tiff',
  opts: { quality?: number; compression?: number }
): Promise<Blob> => {
  const fd = new FormData();
  fd.append('image', imageBlob, 'export.bin');
  fd.append('format', format);
  if (typeof opts.quality === 'number') fd.append('quality', String(opts.quality));
  if (typeof opts.compression === 'number') fd.append('compression', String(opts.compression));
  const res = await fetch(`${getApiBaseUrl()}/convert`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(await res.text());
  return await res.blob();
};
