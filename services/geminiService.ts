
import { GoogleGenAI, Part, Modality } from '@google/genai';
import { ModelId, GenerateOptions, GenerationMetadata } from '../types';

// Helper to get fresh client
const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface GenerationResult {
    url: string;
    metadata?: any;
    generationConfig?: GenerationMetadata;
}

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

/**
 * Generates audio speech from text.
 */
export const generateSpeechContent = async (options: GenerateOptions): Promise<GenerationResult> => {
    const { prompt, voice = 'Kore', creativity = 65 } = options;
    const ai = getAiClient();
    
    // Map creativity 0-100 to temperature 0.0-1.0 (approx)
    const temperature = creativity / 100;

    try {
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

        return {
            url: `data:audio/wav;base64,${wavBase64}`,
            generationConfig: { voice, creativity }
        };

    } catch (error) {
        console.error("Gemini Speech Generation Error:", error);
        throw error;
    }
};

/**
 * Generates an image based on a prompt and optional reference images.
 */
export const generateImageContent = async (options: GenerateOptions): Promise<GenerationResult> => {
  const { prompt, model, referenceImages = [], aspectRatio = '1:1', creativity = 50, imageSize = '1K' } = options;
  const ai = getAiClient();

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

    // Enforce image generation behavior by prepending a clear directive
    const effectivePrompt = `Generate an image of: ${prompt}`;
    parts.push({ text: effectivePrompt });

    // Map creativity (0-100) to temperature
    const temperature = creativity / 100;

    const config: any = {
      temperature: temperature,
      imageConfig: {
          aspectRatio: aspectRatio as any,
      }
    };

    // Only add imageSize if supported (Gemini 3 Pro)
    if (model === ModelId.GEMINI_3_PRO_IMAGE) {
        config.imageConfig.imageSize = imageSize;
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: parts,
      },
      config: config
    });

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates returned from Gemini.");
    }

    const contentParts = candidates[0].content.parts;
    const imagePart = contentParts.find(p => p.inlineData);

    if (imagePart && imagePart.inlineData) {
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
    console.error("Gemini Image Generation Error:", error);
    throw error;
  }
};

/**
 * Generates a video based on a prompt and optional reference images using Veo.
 */
export const generateVideoContent = async (options: GenerateOptions): Promise<GenerationResult> => {
  const { 
    prompt, 
    model, 
    startImage,
    endImage,
    referenceImages = [],
    aspectRatio = '16:9', 
    resolution = '720p', 
    inputVideoMetadata,
    durationSeconds = "8", // Default to 8 now
    videoMode = 'standard' 
  } = options;

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
    // console.log("Generating Video with params:", JSON.stringify(veoParams, null, 2));
    let operation = await ai.models.generateVideos(veoParams);

    // 4. Poll for completion
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10s per guidelines
      operation = await ai.operations.getVideosOperation({operation: operation});
      
      // Explicitly check for operation-level errors
      if (operation.error) {
          throw new Error(`Video generation failed: ${operation.error.message || JSON.stringify(operation.error)}`);
      }
    }

    const generatedVideo = operation.response?.generatedVideos?.[0];
    const downloadLink = generatedVideo?.video?.uri;
    
    if (!downloadLink) {
      // Fallback: Check if there's an error in the response body that wasn't in operation.error
      if (operation.response && (operation.response as any).error) {
           throw new Error(`Video generation failed: ${(operation.response as any).error.message}`);
      }
      throw new Error("No video URI returned in response.");
    }

    // 5. Fetch and Blob
    const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    if (!videoRes.ok) {
       throw new Error(`Failed to download video: ${videoRes.statusText}`);
    }
    
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

    return {
        url,
        metadata: generatedVideo?.video,
        generationConfig: metadataResult
    };

  } catch (error) {
    console.error("Gemini Video Generation Error:", error);
    throw error;
  }
};
