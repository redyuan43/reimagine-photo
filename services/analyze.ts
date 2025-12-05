import { PlanItem } from "../types";
import { getApiBaseUrl } from "./core";

export const analyzeImage = async (
  file: File,
  onPartialResult: (item: PlanItem) => void
): Promise<string | undefined> => {
  try {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('prompt', '');
    const sse = await fetch(`${getApiBaseUrl()}/analyze_stream`, { method: 'POST', body: fd });
    if (sse.ok && sse.headers.get('content-type')?.includes('text/event-stream')) {
      const reader = sse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let summary: string | undefined = undefined;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          try {
            const payload = JSON.parse(line.slice(5));
            if (payload.type === 'item' && payload.item) {
              onPartialResult(payload.item as PlanItem);
            } else if (payload.type === 'final') {
              summary = payload.summary as string | undefined;
            }
          } catch {}
        }
      }
      return summary;
    }
    const res = await fetch(`${getApiBaseUrl()}/analyze`, { method: 'POST', body: fd });
    if (res.ok) {
      const data = await res.json() as { analysis?: PlanItem[], summary?: string };
      const items = data.analysis || [];
      for (const it of items) {
        await new Promise(r => setTimeout(r, 150));
        onPartialResult(it);
      }
      return data.summary || undefined;
    }
  } catch (e) {
    console.warn('Backend analyze failed, falling back to mock.', e);
  }
  return undefined;
};

