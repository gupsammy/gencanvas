const API_KEY_STORAGE_KEY = 'aicanvas_gemini_api_key';

export const getStoredApiKey = (): string | null => {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setStoredApiKey = (key: string): void => {
  try {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
  } catch (e) {
    console.error('Failed to store API key:', e);
  }
};

export const clearStoredApiKey = (): void => {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear API key:', e);
  }
};

export const hasStoredApiKey = (): boolean => {
  return !!getStoredApiKey();
};
