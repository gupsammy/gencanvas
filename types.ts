
export interface Attachment {
  id: string;
  file: File;
  previewUrl: string;
  mimeType: string;
  base64: string;
  displayName?: string; // layer.title or file.name for @image references
}

export enum ModelId {
  GEMINI_2_5_FLASH_IMAGE = 'gemini-2.5-flash-image',
  GEMINI_3_PRO_IMAGE = 'gemini-3-pro-image-preview',
  VEO_3_1_FAST = 'veo-3.1-fast-generate-preview',
  VEO_3_1_HIGH = 'veo-3.1-generate-preview',
  GEMINI_2_5_FLASH_TTS = 'gemini-2.5-flash-preview-tts',
}

export type MediaType = 'image' | 'video' | 'sticky' | 'group' | 'drawing' | 'text' | 'audio';
export type VideoMode = 'standard' | 'interpolation' | 'references';

// Generation task management for non-blocking UI
export type GenerationStatus = 'queued' | 'generating' | 'polling' | 'completed' | 'failed';

export interface GenerationTask {
  id: string;
  layerId: string;
  status: GenerationStatus;
  abortController: AbortController;
  progress?: number; // 0-100 for video polling
  mediaType: MediaType;
  startedAt: number;
}

export interface GenerationMetadata {
    model?: string;
    aspectRatio?: string;
    resolution?: string;
    duration?: string;
    creativity?: number;
    imageSize?: string;
    videoMode?: VideoMode;
    voice?: string;
}

export interface PromptState {
    prompt: string;
    model: ModelId;
    aspectRatio: string;
    creativity: number;
    imageSize: string;
    videoResolution: '720p' | '1080p';
    videoDuration: string;
    imageCount: number;
    videoMode: VideoMode;
    mediaType: MediaType;
    includeStartFrameInRefs: boolean;
    voice: string;
}

export interface DrawingPath {
    id: string;
    type: 'path';
    points: {x: number, y: number}[];
    color: string;
    width: number;
}

export interface TextAnnotation {
    id: string;
    type: 'text';
    x: number;
    y: number;
    text: string;
    color: string;
    fontSize: number;
}

export interface RectangleAnnotation {
    id: string;
    type: 'rectangle';
    vertices: {x: number, y: number}[]; // 4 vertices: [topLeft, topRight, bottomRight, bottomLeft]
    color: string;
    strokeWidth: number;
}

export type Annotation = DrawingPath | TextAnnotation | RectangleAnnotation;

export interface LayerData {
  id: string;
  parentId?: string; // ID of the group this layer belongs to
  type: MediaType;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string; // Base64 or Blob URL (empty for stickies/groups)
  thumbnail?: string; // 256px thumbnail Base64 for LOD rendering
  // Asset store IDs (blob-based storage for performance)
  imageId?: string; // Reference to asset store for full-res image
  thumbnailId?: string; // Reference to asset store for thumbnail
  color?: string; // For stickies, groups, and text
  text?: string; // Main text content for stickies and text layers
  fontSize?: number; // Custom font size for text content
  promptUsed?: string;         // User's original prompt that CREATED this layer (sidebar display)
  improvedPrompt?: string;      // AI-enhanced prompt that CREATED this layer (sidebar display)
  lastDraftPrompt?: string;     // Last prompt typed into this layer's PromptBar (draft input)
  referenceImages?: string[]; // Store base64 of refs used for generation
  videoMetadata?: any; // Store Veo video object/handle for extension
  generationMetadata?: GenerationMetadata;
  title: string;
  createdAt: number;
  flipX?: boolean;
  flipY?: boolean;
  duration?: number; // Video duration in seconds
  isLoading?: boolean;
  error?: string;
  annotations?: Annotation[];
}

export interface GenerateOptions {
  prompt: string;
  model: ModelId;
  mediaType: MediaType;
  videoMode?: VideoMode;
  
  // Specific inputs
  startImage?: string; // Base64 for 'image' param (animate this)
  endImage?: string;   // Base64 for 'lastFrame' param
  referenceImages?: string[]; // Array of base64 for 'referenceImages' param
  
  inputVideoMetadata?: any; // For extending videos
  aspectRatio?: string;
  creativity?: number; // 0-100
  imageSize?: string; // 1K, 2K, 4K
  resolution?: '720p' | '1080p';
  durationSeconds?: string; // "4", "6", "8"
  voice?: string;
}
