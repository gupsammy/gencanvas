
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

export const STICKY_COLORS = [
  '#fff8c5', // classic yellow
  '#ffc5c5', // pink
  '#c5f0ff', // blue
  '#c5ffc8', // green
  '#eec5ff', // purple
  '#ffffff', // white
  '#18181b', // dark
];

export const GROUP_COLORS = [
  '#3f3f46', // zinc
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
];
