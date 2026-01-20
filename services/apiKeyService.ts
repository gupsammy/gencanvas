import { resetAiClient } from './geminiService';

const API_KEY_STORAGE_KEY = 'gencanvas_gemini_api_key';

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
    // Reset the singleton client so it picks up the new key
    resetAiClient();
  } catch (e) {
    console.error('Failed to store API key:', e);
  }
};

export const clearStoredApiKey = (): void => {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    // Reset the singleton client
    resetAiClient();
  } catch (e) {
    console.error('Failed to clear API key:', e);
  }
};

export const hasStoredApiKey = (): boolean => {
  return !!getStoredApiKey();
};
