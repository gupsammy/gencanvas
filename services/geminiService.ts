
import { GoogleGenAI, Part, Modality } from '@google/genai';
import { ModelId, GenerateOptions, GenerationMetadata, Attachment } from '../types';
import { getStoredApiKey } from './apiKeyService';

// Singleton client for connection reuse and HTTP/2 multiplexing
let cachedClient: GoogleGenAI | null = null;
let cachedApiKey: string | null = null;

// Client configuration optimized for parallel requests
const CLIENT_CONFIG = {
  timeout: 180000,      // 3 minutes for 4K images (default is 60s)
  maxRetries: 3,        // Retry on transient failures
};

// Get or create singleton client - reuses connections for better parallel performance
const getAiClient = (): GoogleGenAI => {
  const apiKey = getStoredApiKey() || process.env.API_KEY;
  if (!apiKey) {
    throw new Error('No API key configured. Please add your Gemini API key.');
  }

  // Return cached client if API key hasn't changed
  if (cachedClient && cachedApiKey === apiKey) {
    return cachedClient;
  }

  // Create new client with optimized settings
  cachedClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: CLIENT_CONFIG.timeout,
    }
  });
  cachedApiKey = apiKey;

  return cachedClient;
};

// Reset client (call when API key changes)
export const resetAiClient = () => {
  cachedClient = null;
  cachedApiKey = null;
};

// Minimum expected base64 lengths for different image sizes (approximate)
const MIN_BASE64_LENGTHS: Record<string, number> = {
  '1K': 100000,    // ~100KB minimum for 1K
  '2K': 400000,    // ~400KB minimum for 2K
  '4K': 1000000,   // ~1MB minimum for 4K
};

// Validate response data to detect truncation
const validateImageResponse = (
  data: string | undefined,
  finishReason: string | undefined,
  imageSize: string = '1K'
): void => {
  if (!data) {
    throw new Error('No image data in response');
  }

  // Check finish reason
  if (finishReason && finishReason !== 'STOP' && finishReason !== 'END_TURN') {
    console.warn(`Unexpected finishReason: ${finishReason} - response may be incomplete`);
  }

  // Check for minimum expected size
  const minLength = MIN_BASE64_LENGTHS[imageSize] || MIN_BASE64_LENGTHS['1K'];
  if (data.length < minLength) {
    console.warn(`Image data smaller than expected: ${data.length} chars (expected >=${minLength} for ${imageSize}). May be truncated.`);
  }

  // Validate base64 format (should be divisible by 4)
  if (data.length % 4 !== 0) {
    throw new Error(`Invalid base64 data: length ${data.length} not divisible by 4 - likely truncated`);
  }
};

// Export getter for API key (used in video download)
export const getApiKey = (): string => {
  const apiKey = getStoredApiKey() || process.env.API_KEY;
  if (!apiKey) {
    throw new Error('No API key configured. Please add your Gemini API key.');
  }
  return apiKey;
};

export interface GenerationResult {
    url: string;
    metadata?: any;
    generationConfig?: GenerationMetadata;
}

// Cancellation options for generation functions
export interface GenerationCallbacks {
    signal?: AbortSignal;
    onProgress?: (progress: number) => void;
}

// Helper to check abort and throw if cancelled
const checkAbort = (signal?: AbortSignal) => {
    if (signal?.aborted) {
        throw new DOMException('Generation cancelled', 'AbortError');
    }
};

// WAV Header Helper
function pcmToWav(pcmData: Int16Array, sampleRate: number): ArrayBuffer {
  const headerLength = 44;
  const byteLength = pcmData.length * 2;
  const buffer = new ArrayBuffer(headerLength + byteLength);
  const view = new DataView(buffer);

  function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + byteLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, byteLength, true);

  const offset = 44;
  for (let i = 0; i < pcmData.length; i++) {
    view.setInt16(offset + i * 2, pcmData[i], true);
  }

  return buffer;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}


/**
 * Generates a short, descriptive title for the layer based on the prompt.
 */
export const generateLayerTitle = async (prompt: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [{
            text: `Generate a very short, concise title (max 5 words) for an image/video/audio generated from this prompt: "${prompt}". Return ONLY the title, no quotes.`
        }],
      },
    });

    return response.text?.trim() || prompt.substring(0, 30);
  } catch (error) {
    console.warn("Failed to generate title, falling back to prompt segment", error);
    return prompt.substring(0, 30);
  }
};

// Emily's Image Prompt Rewriting Expert system prompt
const PROMPT_IMPROVEMENT_SYSTEM = `You are an Image Prompt Rewriting Expert. Your job is to take the user's image description (Chinese, English, or mixed) and rewrite it into a single, high-quality English image prompt that is natural, precise, and visually grounded.

### Primary Objective
Produce an image prompt that preserves the user's intent while maximizing clarity, visual specificity, and adherence to the medium (photography, illustration, design).

### Categorization & Precedence (Strict Order)
1. **Text-Centric/Design:** The primary focus is written content, layout, or typography (e.g., posters, UI screens, book covers, logos, infographics).
2. **Portrait/Character:** A human or character is the focus. (Note: Incidental text, such as a logo on a shirt or a street sign in the background, does NOT make it "Text-Centric"—keep it in this category).
3. **General Scene:** Landscapes, objects, architecture, animals, or abstract concepts where text and characters are secondary.

### Output Format Rules
- Output **ONLY** the rewritten English prompt.
- No conversational filler, no markdown headings, no "Here is the prompt."
- Use a single continuous text block.

### Global Fidelity & Enrichment
- **Facts:** Preserve all user-provided objects, colors, counts, and specific details.
- **Enrichment:** Add non-committal visual parameters: lighting (e.g., volumetric, cinematic), camera angle (e.g., low-angle, macro), and textures.
- **Safety:** Do not infer private attributes. Use "adult" or "young adult" if age is ambiguous.
- **Style:** Always specify an art style if the user did not.

### Text Handling (Critical)
- **Quoting:** Enclose all on-image text in straight double quotes: "TEXT"
- **Fidelity:** Reproduce text exactly, preserving casing and punctuation
- **Materiality:** Describe the text's physical properties: Font style, color, material, and location
- **Language:** Keep non-English characters inside quotes, add English descriptor outside

### Category-Specific Guidelines
**A) Portrait/Character** - Subject appearance, action/pose, setting, lighting
**B) Text-Centric/Design** - Layout, hierarchy, style
**C) General Scene** - Composition, atmosphere

### Technical Constraints
- Preserve any aspect ratio flags, seeds, or model parameters at the end`;

/**
 * Improves a user prompt using Gemini Flash for better visual specificity.
 * Sends reference images for context so the AI understands what @image1, etc. refer to.
 */
export const improvePrompt = async (
  prompt: string,
  attachments: Attachment[]
): Promise<string> => {
  try {
    const ai = getAiClient();
    const parts: Part[] = [];

    // Add reference images as inline data so AI can see what user is referencing
    attachments.forEach((att) => {
      if (att.base64) {
        const pureBase64 = att.base64.split(',')[1] || att.base64;
        let mimeType = 'image/png';
        if (att.base64.startsWith('data:')) {
          const match = att.base64.match(/data:([^;]+);base64,/);
          if (match) mimeType = match[1];
        }
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: pureBase64,
          },
        });
      }
    });

    // Build user message with context about attachments
    let userMessage = prompt;
    if (attachments.length > 0) {
      userMessage = `The user has attached ${attachments.length} reference image(s). They may reference these as @image1, @image2, etc. in their prompt. Please preserve these references in the improved prompt.\n\nUser prompt: ${prompt}`;
    }
    parts.push({ text: userMessage });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
        systemInstruction: PROMPT_IMPROVEMENT_SYSTEM,
        temperature: 0.7,
      },
    });

    const improvedPrompt = response.text?.trim();
    if (!improvedPrompt) {
      console.warn("Empty response from prompt improvement, using original");
      return prompt;
    }

    return improvedPrompt;
  } catch (error) {
    console.warn("Prompt improvement failed, using original:", error);
    return prompt;
  }
};

/**
 * Generates audio speech from text.
 */
export const generateSpeechContent = async (options: GenerateOptions, callbacks?: GenerationCallbacks): Promise<GenerationResult> => {
    const { prompt, voice = 'Kore', creativity = 65 } = options;
    const { signal, onProgress } = callbacks || {};

    checkAbort(signal);
    const ai = getAiClient();

    // Map creativity 0-100 to temperature 0.0-1.0 (approx)
    const temperature = creativity / 100;
    onProgress?.(10); // Starting

    try {
        checkAbort(signal);
        const response = await ai.models.generateContent({
            model: ModelId.GEMINI_2_5_FLASH_TTS,
            contents: { parts: [{ text: prompt }] },
            config: {
                temperature: temperature, // Pass temperature here
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voice },
                    },
                },
            },
        });

        checkAbort(signal);
        onProgress?.(80); // Processing response

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("No audio data returned");
        }

        // Decode PCM and wrap in WAV
        const pcmBytes = base64ToUint8Array(base64Audio);
        const pcmInt16 = new Int16Array(pcmBytes.buffer);
        const wavBuffer = pcmToWav(pcmInt16, 24000);

        // Convert WAV buffer back to base64 for storage/src
        let binary = '';
        const bytes = new Uint8Array(wavBuffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const wavBase64 = btoa(binary);

        onProgress?.(100);
        return {
            url: `data:audio/wav;base64,${wavBase64}`,
            generationConfig: { voice, creativity }
        };

    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw error; // Re-throw abort errors without logging
        }
        console.error("Gemini Speech Generation Error:", error);
        throw error;
    }
};

/**
 * Generates an image based on a prompt and optional reference images.
 */
export const generateImageContent = async (options: GenerateOptions, callbacks?: GenerationCallbacks): Promise<GenerationResult> => {
  const { prompt, model, referenceImages = [], aspectRatio = '1:1', creativity = 50, imageSize = '1K' } = options;
  const { signal, onProgress } = callbacks || {};

  checkAbort(signal);
  const ai = getAiClient();
  onProgress?.(10);

  try {
    const parts: Part[] = [];

    // Add reference images as inline data
    referenceImages.forEach((base64Data) => {
      const pureBase64 = base64Data.split(',')[1] || base64Data;
      let mimeType = 'image/png';
      if (base64Data.startsWith('data:')) {
        const match = base64Data.match(/data:([^;]+);base64,/);
        if (match) {
            mimeType = match[1];
        }
      }

      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: pureBase64,
        },
      });
    });

    // Use prompt directly - reference mapping already prepended by buildPromptWithReferences
    parts.push({ text: prompt });

    // Map creativity (0-100) to temperature
    const temperature = creativity / 100;

    const config: any = {
      temperature: temperature,
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
          aspectRatio: aspectRatio as any,
      }
    };

    // Only add imageSize if supported (Gemini 3 Pro)
    if (model === ModelId.GEMINI_3_PRO_IMAGE) {
        config.imageConfig.imageSize = imageSize;
    }

    checkAbort(signal);
    onProgress?.(30);

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: parts,
      },
      config: config
    });

    checkAbort(signal);
    onProgress?.(90);

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates returned from Gemini.");
    }

    const candidate = candidates[0];
    const finishReason = candidate.finishReason;
    const contentParts = candidate.content.parts;
    const imagePart = contentParts.find(p => p.inlineData);

    if (imagePart && imagePart.inlineData) {
      // Validate response to detect truncation
      const effectiveImageSize = model === ModelId.GEMINI_3_PRO_IMAGE ? imageSize : '1K';
      validateImageResponse(imagePart.inlineData.data, finishReason, effectiveImageSize);

      onProgress?.(100);
      return {
          url: `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`,
          generationConfig: {
              model,
              aspectRatio,
              creativity,
              imageSize: model === ModelId.GEMINI_3_PRO_IMAGE ? imageSize : undefined
          }
      };
    }

    const textPart = contentParts.find(p => p.text);
    if (textPart) {
        throw new Error(`Model returned text instead of image. Please try a more descriptive prompt. (Response: ${textPart.text.substring(0, 100)}...)`);
    }

    throw new Error("No image data found in the response.");

  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.error("Gemini Image Generation Error:", error);
    throw error;
  }
};

/**
 * Generates a video based on a prompt and optional reference images using Veo.
 */
export const generateVideoContent = async (options: GenerateOptions, callbacks?: GenerationCallbacks): Promise<GenerationResult> => {
  const {
    prompt,
    model,
    startImage,
    endImage,
    referenceImages = [],
    aspectRatio = '16:9',
    resolution = '720p',
    inputVideoMetadata,
    durationSeconds = "8",
    videoMode = 'standard'
  } = options;
  const { signal, onProgress } = callbacks || {};

  checkAbort(signal);

  // 1. API Key Check for Veo
  const win = window as any;
  if (win.aistudio && win.aistudio.hasSelectedApiKey) {
    const hasKey = await win.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      try {
        await win.aistudio.openSelectKey();
      } catch (e) {
        throw new Error("API Key selection was cancelled or failed.");
      }
    }
  }

  checkAbort(signal);
  onProgress?.(5);

  // 2. Refresh Client after key selection
  const ai = getAiClient();

  // Helper to strip data prefix
  const processImage = (base64: string) => {
      const pure = base64.split(',')[1] || base64;
      let mime = 'image/png';
      if (base64.startsWith('data:')) {
          const match = base64.match(/data:([^;]+);base64,/);
          if (match) mime = match[1];
      }
      return { imageBytes: pure, mimeType: mime };
  };

  try {
    const numericDuration = parseInt(durationSeconds) || 8;
    const config: any = {
      numberOfVideos: 1,
      resolution: resolution,
      aspectRatio: aspectRatio,
      durationSeconds: numericDuration
    };

    // Prepare Veo-specific params
    const veoParams: any = {
      model: model,
      prompt: prompt,
      config: config
    };

    // --- Video Extension Logic ---
    if (inputVideoMetadata) {
        veoParams.model = ModelId.VEO_3_1_HIGH; 
        veoParams.video = inputVideoMetadata;   
        veoParams.config.resolution = '720p';   
        veoParams.config.durationSeconds = 8;
    } 
    // --- Mode Handling ---
    else {
        // Map Start Image (Image to Animate)
        if (startImage) {
            veoParams.image = processImage(startImage);
        }

        // Mode: Interpolation (Frame to Video)
        if (videoMode === 'interpolation') {
            if (startImage && endImage) {
                veoParams.image = processImage(startImage);
                veoParams.config.lastFrame = processImage(endImage);
                veoParams.config.durationSeconds = 8; 
                // Force 720p for Interpolation to prevent "Use case not supported" errors
                veoParams.config.resolution = '720p'; 
            } else {
                throw new Error("Interpolation mode requires both Start and End frames.");
            }
        }

        // Mode: Reference Images
        if (videoMode === 'references') {
            // Constraint: Veo 3.1 High only
            veoParams.model = ModelId.VEO_3_1_HIGH;
            // Constraint: 16:9 only
            veoParams.config.aspectRatio = '16:9';
            // Constraint: 720p only for references
            veoParams.config.resolution = '720p';
            // Constraint: 8s only for references
            veoParams.config.durationSeconds = 8;
            
            if (referenceImages.length > 0) {
                // Use explicit object structure with referenceType 'asset' (lowercase per Veo 3.1 API)
                veoParams.config.referenceImages = referenceImages.slice(0, 3).map(img => ({
                    referenceType: 'asset',
                    image: processImage(img)
                }));
            }
        }
    }

    // 3. Initiate Generation
    checkAbort(signal);
    onProgress?.(10);
    let operation = await ai.models.generateVideos(veoParams);

    // 4. Poll for completion with progress tracking
    const MAX_POLLS = 60; // 10 minute timeout (60 * 10s = 600s)
    let pollCount = 0;

    while (!operation.done && pollCount < MAX_POLLS) {
      // Check abort before polling
      checkAbort(signal);

      await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10s
      pollCount++;

      // Report progress: 10% start + up to 80% during polling
      const pollProgress = 10 + Math.floor((pollCount / MAX_POLLS) * 80);
      onProgress?.(pollProgress);

      checkAbort(signal);
      operation = await ai.operations.getVideosOperation({operation: operation});

      if (operation.error) {
          throw new Error(`Video generation failed: ${operation.error.message || JSON.stringify(operation.error)}`);
      }
    }

    if (pollCount >= MAX_POLLS && !operation.done) {
      throw new Error("Video generation timed out after 10 minutes.");
    }

    onProgress?.(90);
    const generatedVideo = operation.response?.generatedVideos?.[0];
    const downloadLink = generatedVideo?.video?.uri;

    if (!downloadLink) {
      if (operation.response && (operation.response as any).error) {
           throw new Error(`Video generation failed: ${(operation.response as any).error.message}`);
      }
      throw new Error("No video URI returned in response.");
    }

    // 5. Fetch and Blob
    checkAbort(signal);
    onProgress?.(95);

    const videoRes = await fetch(`${downloadLink}&key=${getApiKey()}`);
    if (!videoRes.ok) {
       throw new Error(`Failed to download video: ${videoRes.statusText}`);
    }

    checkAbort(signal);
    const blob = await videoRes.blob();
    const url = URL.createObjectURL(blob);

    // Capture metadata used
    const metadataResult: GenerationMetadata = {
        model: veoParams.model,
        resolution: veoParams.config.resolution,
        aspectRatio: veoParams.config.aspectRatio,
        duration: veoParams.config.durationSeconds?.toString() || numericDuration.toString(),
        videoMode: videoMode
    };

    onProgress?.(100);
    return {
        url,
        metadata: generatedVideo?.video,
        generationConfig: metadataResult
    };

  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.error("Gemini Video Generation Error:", error);
    throw error;
  }
};
