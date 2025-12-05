export const getApiBaseUrl = () => {
  const envUrl = (import.meta as any)?.env?.VITE_API_BASE_URL as string | undefined;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port;
    if (port === '8000' || port === '') {
      return `${window.location.origin}/api`;
    }
    return `${protocol}//${hostname}:8000/api`;
  }
  return 'http://localhost:3000/api';
};

export const urlToBlob = async (url: string): Promise<Blob> => {
  const isHttp = /^https?:\/\//i.test(url);
  const proxied = isHttp ? `${getApiBaseUrl()}/proxy_image?url=${encodeURIComponent(url)}` : url;
  const res = await fetch(proxied);
  return await res.blob();
};

export const checkAndRequestApiKey = async (): Promise<boolean> => {
  return true;
};

