
import { ModelId } from './types';

export const AVAILABLE_MODELS = [
  { id: ModelId.GEMINI_2_5_FLASH_IMAGE, name: 'NanoBanana', type: 'image', description: 'Fast, high quality generation' },
  { id: ModelId.GEMINI_3_PRO_IMAGE, name: 'Nanobanana Pro', type: 'image', description: 'Highest fidelity generation' },
  { id: ModelId.VEO_3_1_FAST, name: 'Veo Fast', type: 'video', description: 'Fast video generation' },
  { id: ModelId.VEO_3_1_HIGH, name: 'Veo', type: 'video', description: 'High quality video generation' },
  { id: ModelId.GEMINI_2_5_FLASH_TTS, name: 'Gemini TTS', type: 'audio', description: 'Text-to-Speech' },
];

export const AVAILABLE_VOICES = [
  { id: 'Puck', name: 'Puck (M)', gender: 'Male' },
  { id: 'Charon', name: 'Charon (M)', gender: 'Male' },
  { id: 'Kore', name: 'Kore (F)', gender: 'Female' },
  { id: 'Fenrir', name: 'Fenrir (M)', gender: 'Male' },
  { id: 'Zephyr', name: 'Zephyr (F)', gender: 'Female' },
];

export const DEFAULT_MODEL = ModelId.GEMINI_2_5_FLASH_IMAGE;

export const INITIAL_CANVAS_OFFSET = { x: 0, y: 0 };

// Warm Ember harmonized color palettes
export const STICKY_COLORS = [
  '#fef3c7', // warm cream
  '#fecaca', // soft coral
  '#d1fae5', // mint
  '#e0e7ff', // soft lavender
  '#fce7f3', // blush pink
  '#fafaf9', // warm white
  '#1c1916', // warm dark
];

export const GROUP_COLORS = [
  '#2a2520', // warm gray (matches border)
  '#f59e0b', // amber (primary)
  '#ef4444', // red
  '#10b981', // green
  '#6366f1', // indigo
];

// Minimap colors - warmer tones
export const MINIMAP_LAYER_COLORS: Record<string, string> = {
  image: '#f59e0b',     // Amber (primary)
  video: '#8b5cf6',     // Purple
  audio: '#10b981',     // Green
  sticky: '#fbbf24',    // Light amber
  group: 'rgba(42, 37, 32, 0.5)', // Warm gray semi-transparent
  drawing: '#f472b6',   // Pink
  text: '#fafaf9',      // Warm white
};
