
import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Send, X, Loader2, Settings2, Ratio, ThermometerSun, MonitorPlay, Image as ImageIcon, Video, ChevronDown, Palette, Clock, Layers, Film, Copy as CopyIcon, Upload, MousePointer2, Mic } from 'lucide-react';
import { ModelId, Attachment, MediaType, VideoMode, PromptState } from '../types';
import { AVAILABLE_MODELS, DEFAULT_MODEL, AVAILABLE_VOICES } from '../constants';

const PROMPTBAR_STORAGE_KEY = 'promptbar-settings';

interface SavedSettings {
  prompt: string;
  mediaType: MediaType;
  selectedModel: ModelId;
  aspectRatio: string;
  creativity: number;
  imageSize: string;
  videoResolution: '720p' | '1080p';
  videoDuration: string;
  imageCount: number;
  selectedVoice: string;
  videoMode: VideoMode;
}

const loadSavedSettings = (): Partial<SavedSettings> | null => {
  try {
    const saved = localStorage.getItem(PROMPTBAR_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
};

const saveSettings = (settings: SavedSettings) => {
  try {
    localStorage.setItem(PROMPTBAR_STORAGE_KEY, JSON.stringify(settings));
  } catch {}
};

interface PromptBarProps {
  onSubmit: (
    prompt: string, 
    attachments: Attachment[], 
    model: ModelId, 
    aspectRatio: string, 
    creativity: number, 
    imageSize: string, 
    resolution: '720p' | '1080p', 
    mediaType: MediaType,
    duration: string,
    videoMode: VideoMode,
    startImageIndex?: number, // -1 if none, otherwise index in attachments
    count?: number,
    voice?: string
  ) => void;
  isGenerating: boolean;
  initialValues?: Partial<PromptState>;
  onStateChange?: (state: Partial<PromptState>) => void;
  placeholder?: string;
  variant?: 'global' | 'floating';
  contextAttachments?: Attachment[];
  onCancel?: () => void;
  attachments?: Attachment[];
  onAttachmentsChange?: (attachments: Attachment[]) => void;
  onSelectOnCanvasStart?: () => void; // New callback
  inputRef?: React.RefObject<HTMLTextAreaElement>;
  isExtension?: boolean;
}

const ASPECT_RATIOS_IMAGE = ["Auto", "1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "5:4", "4:5"];
const ASPECT_RATIOS_VIDEO = ["16:9", "9:16"]; 
const IMAGE_SIZES = ["1K", "2K", "4K"];
const VIDEO_RESOLUTIONS = ["720p", "1080p"];
const VIDEO_DURATIONS = ["4", "6", "8"];
const IMAGE_COUNTS = [1, 2, 3, 4];

const PromptBar: React.FC<PromptBarProps> = ({
  onSubmit,
  isGenerating,
  initialValues,
  onStateChange,
  placeholder = "Describe what you want to see...",
  variant = 'global',
  contextAttachments = [],
  onCancel,
  attachments: controlledAttachments,
  onAttachmentsChange,
  onSelectOnCanvasStart,
  inputRef,
  isExtension = false
}) => {
  const isGlobalVariant = variant === 'global';
  const savedSettings = isGlobalVariant ? loadSavedSettings() : null;

  const [prompt, setPrompt] = useState(initialValues?.prompt || savedSettings?.prompt || '');
  const [mediaType, setMediaType] = useState<MediaType>(initialValues?.mediaType || savedSettings?.mediaType || 'image');
  const [selectedModel, setSelectedModel] = useState<ModelId>(initialValues?.model || savedSettings?.selectedModel || DEFAULT_MODEL);
  const [internalAttachments, setInternalAttachments] = useState<Attachment[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Settings
  const [aspectRatio, setAspectRatio] = useState(initialValues?.aspectRatio || savedSettings?.aspectRatio || "Auto");
  const [creativity, setCreativity] = useState(initialValues?.creativity || savedSettings?.creativity || 65);
  const [imageSize, setImageSize] = useState(initialValues?.imageSize || savedSettings?.imageSize || "1K");
  const [videoResolution, setVideoResolution] = useState<'720p' | '1080p'>(initialValues?.videoResolution || savedSettings?.videoResolution || "720p");
  const [videoDuration, setVideoDuration] = useState(initialValues?.videoDuration || savedSettings?.videoDuration || "8");
  const [imageCount, setImageCount] = useState(initialValues?.imageCount || savedSettings?.imageCount || 1);
  const [selectedVoice, setSelectedVoice] = useState(initialValues?.voice || savedSettings?.selectedVoice || 'Kore');

  // Video Mode State
  const [videoMode, setVideoMode] = useState<VideoMode>(initialValues?.videoMode || savedSettings?.videoMode || 'standard');

  // Inline error state (replaces browser alerts)
  const [validationError, setValidationError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Emit state changes
  useEffect(() => {
      if (onStateChange) {
          onStateChange({
              prompt,
              mediaType,
              model: selectedModel,
              aspectRatio,
              creativity,
              imageSize,
              videoResolution,
              videoDuration,
              imageCount,
              videoMode,
              includeStartFrameInRefs: false,
              voice: selectedVoice
          });
      }
  }, [prompt, mediaType, selectedModel, aspectRatio, creativity, imageSize, videoResolution, videoDuration, imageCount, videoMode, selectedVoice, onStateChange]);

  // Persist settings to localStorage for global PromptBar
  useEffect(() => {
      if (isGlobalVariant) {
          saveSettings({
              prompt,
              mediaType,
              selectedModel,
              aspectRatio,
              creativity,
              imageSize,
              videoResolution,
              videoDuration,
              imageCount,
              selectedVoice,
              videoMode
          });
      }
  }, [prompt, mediaType, selectedModel, aspectRatio, creativity, imageSize, videoResolution, videoDuration, imageCount, selectedVoice, videoMode, isGlobalVariant]);


  // Derived state
  const attachments = controlledAttachments ?? internalAttachments;
  // Note: We don't merge contextAttachments here for display, but we use them for calculation
  
  // Auto-grow textarea logic
  useEffect(() => {
    const ref = inputRef || textareaRef;
    if (ref.current) {
        ref.current.style.height = 'auto';
        const scrollHeight = ref.current.scrollHeight;
        // Cap at 300px (approx 12-14 lines)
        ref.current.style.height = Math.min(scrollHeight, 300) + 'px';
    }
  }, [prompt, inputRef]);

  // Force video mode if extension
  useEffect(() => {
      if (isExtension) {
          setMediaType('video');
      }
  }, [isExtension]);

  // Filter models based on media type
  const availableModelsForType = AVAILABLE_MODELS.filter(m => m.type === mediaType);
  const currentAspectRatios = mediaType === 'video' ? ASPECT_RATIOS_VIDEO : ASPECT_RATIOS_IMAGE;

  // Ensure selected model matches media type
  useEffect(() => {
      const valid = availableModelsForType.find(m => m.id === selectedModel);
      if (!valid) {
          setSelectedModel(availableModelsForType[0]?.id || DEFAULT_MODEL);
      }
  }, [mediaType, availableModelsForType, selectedModel]);

  // Ensure valid aspect ratio for video
  useEffect(() => {
    if (mediaType === 'video' && !ASPECT_RATIOS_VIDEO.includes(aspectRatio)) {
        setAspectRatio('16:9');
    }
  }, [mediaType, aspectRatio]);

  // --- Veo Constraints Enforcement ---
  useEffect(() => {
      if (mediaType !== 'video') return;

      // Force 8s for specific modes
      if (videoMode === 'references' || videoMode === 'interpolation') {
          if (videoDuration !== '8') setVideoDuration('8');
      }

      // Reference Images Mode -> Aspect Ratio must be 16:9
      if (videoMode === 'references') {
          if (aspectRatio !== '16:9') setAspectRatio('16:9');
      }

  }, [mediaType, videoResolution, videoDuration, videoMode, aspectRatio]);


  const setAttachments = (action: React.SetStateAction<Attachment[]>) => {
      if (onAttachmentsChange && controlledAttachments !== undefined) {
          const next = typeof action === 'function' ? action(attachments) : action;
          onAttachmentsChange(next);
      } else {
          setInternalAttachments(action);
      }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newAttachments: Attachment[] = [];

      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        if (!file.type.startsWith('image/')) continue;

        const reader = new FileReader();
        const promise = new Promise<Attachment>((resolve) => {
          reader.onload = (event) => {
            resolve({
              id: Math.random().toString(36).substring(7),
              file,
              previewUrl: URL.createObjectURL(file),
              mimeType: file.type,
              base64: event.target?.result as string,
              displayName: file.name, // Use filename for @image references
            });
          };
        });
        reader.readAsDataURL(file);
        newAttachments.push(await promise);
      }

      setAttachments(prev => [...prev, ...newAttachments]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    setShowAttachMenu(false);
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setValidationError(null); // Clear previous errors
    if ((!prompt.trim() && attachments.length === 0 && contextAttachments.length === 0) || isGenerating) return;

    const allAttachments = [...contextAttachments, ...attachments];

    // Validation for Frame Interpolation
    if (mediaType === 'video' && videoMode === 'interpolation') {
        if (allAttachments.length !== 2) {
            setValidationError("Frame Interpolation requires exactly 2 images: Start Frame and End Frame.");
            return;
        }
    }

    // Validation for Reference Images
    if (mediaType === 'video' && videoMode === 'references') {
        if (allAttachments.length > 3) {
            setValidationError("Veo Reference mode supports a maximum of 3 reference images.");
            return;
        }
    }

    // Logic for Start Index
    let startImageIndex = -1;
    if (mediaType === 'video') {
        if (videoMode === 'standard' && allAttachments.length > 0) startImageIndex = 0;
        if (videoMode === 'interpolation' && allAttachments.length > 0) startImageIndex = 0; // Index 0 is Start, 1 is End
        if (videoMode === 'references') startImageIndex = -1; // Never animate start frame in references mode
    } else {
        // Image to Image
         if (allAttachments.length > 0) startImageIndex = -1; 
    }

    onSubmit(
        prompt, 
        allAttachments, 
        selectedModel, 
        aspectRatio, 
        creativity, 
        imageSize, 
        videoResolution, 
        mediaType,
        videoDuration,
        videoMode,
        startImageIndex,
        imageCount,
        selectedVoice
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(event.target as Node)) {
        setShowModeMenu(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getLabelForAttachment = (localIndex: number) => {
      // Calculate global index including context attachments (which are conceptually before local ones)
      const index = localIndex + contextAttachments.length;

      if (mediaType !== 'video') return null;

      if (videoMode === 'standard') {
          return index === 0 ? "IMAGE TO ANIMATE" : null;
      }
      if (videoMode === 'interpolation') {
          if (index === 0) return "START FRAME";
          if (index === 1) return "END FRAME";
      }
      if (videoMode === 'references') {
          return `REF ${index + 1}`;
      }
      return null;
  };
  
  const getPlaceholder = () => {
      if (isExtension) return "Describe what happens next...";
      if (mediaType === 'video') return "Describe the video you want...";
      if (mediaType === 'audio') return "Type the dialogue or narration for the character...";
      return placeholder;
  };

  const isGlobal = variant === 'global';

  return (
    <div className="relative">
      {/* Warm glow effect behind - only for global variant */}
      {isGlobal && (
        <div className="absolute -inset-2 bg-gradient-to-r from-primary/10 via-transparent to-primary/10 rounded-3xl blur-xl opacity-50 pointer-events-none" />
      )}

      <div className={`relative ${isGlobal
        ? "bg-elevated/80 backdrop-blur-2xl border border-border/50 p-4 rounded-2xl shadow-2xl shadow-black/30 w-full max-w-2xl mx-auto"
        : "bg-elevated/90 backdrop-blur-xl border border-border/50 p-3 rounded-xl shadow-xl shadow-black/30 w-[600px]"
      }`}>
      {/* Settings Panel - Warm Ember */}
      {showSettings && !isExtension && (
        <div className={`
            absolute left-0 right-0 p-4 bg-elevated/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl shadow-black/30 z-20
            ${isGlobal ? 'bottom-full mb-3' : 'top-full mt-3'}
            animate-scale-in
        `}>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Model Selection */}
                {mediaType !== 'audio' && (
                <div className="space-y-1">
                    <label className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Model</label>
                    <div className="relative group">
                        <select 
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value as ModelId)}
                            disabled={isGenerating}
                            className="w-full appearance-none bg-surface/50 hover:bg-surface text-xs text-gray-300 py-2 pl-3 pr-8 rounded-lg border border-border focus:border-white/20 outline-none cursor-pointer transition-colors"
                        >
                            {availableModelsForType.map(m => (
                                <option key={m.id} value={m.id}>
                                    {m.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                )}
                
                {/* Voice Selection (Audio Only) */}
                {mediaType === 'audio' && (
                    <div className="space-y-1 col-span-2">
                        <label className="text-[10px] uppercase text-gray-500 font-bold tracking-wider flex items-center gap-1">
                            <Mic size={10} /> Voice Character
                        </label>
                        <div className="grid grid-cols-5 gap-1">
                            {AVAILABLE_VOICES.map(voice => (
                                <button
                                    key={voice.id}
                                    onClick={() => setSelectedVoice(voice.id)}
                                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-md border transition-colors ${
                                        selectedVoice === voice.id
                                        ? 'bg-primary/20 border-primary text-primary'
                                        : 'bg-surface/50 border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <span className="text-[10px] font-bold">{voice.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Aspect Ratio */}
                {mediaType !== 'audio' && (
                <div className="space-y-1">
                    <label className="text-[10px] uppercase text-gray-500 font-bold tracking-wider flex items-center gap-1">
                        <Ratio size={10} /> Aspect Ratio
                    </label>
                    <div className="relative group">
                        <select 
                            value={aspectRatio}
                            onChange={(e) => setAspectRatio(e.target.value)}
                            disabled={isGenerating || (mediaType === 'video' && videoMode === 'references')}
                            className="w-full appearance-none bg-surface/50 hover:bg-surface text-xs text-gray-300 py-2 pl-3 pr-8 rounded-lg border border-border focus:border-white/20 outline-none cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {currentAspectRatios.map(ratio => (
                                <option key={ratio} value={ratio}>
                                    {ratio}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                )}
                
                {/* Batch Count (Images Only) */}
                {mediaType === 'image' && (
                  <div className="space-y-1">
                      <label className="text-[10px] uppercase text-gray-500 font-bold tracking-wider flex items-center gap-1">
                          <CopyIcon size={10} /> Batch Size
                      </label>
                      <div className="relative">
                          <select
                              value={imageCount}
                              onChange={(e) => setImageCount(parseInt(e.target.value))}
                              disabled={isGenerating}
                              className="w-full appearance-none bg-surface/50 hover:bg-surface text-xs text-gray-300 py-2 pl-3 pr-8 rounded-lg border border-border focus:border-white/20 outline-none cursor-pointer transition-colors"
                          >
                              {IMAGE_COUNTS.map(count => (
                                  <option key={count} value={count}>
                                      {count} {count === 1 ? 'image' : 'images'}
                                  </option>
                              ))}
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                      </div>
                  </div>
                )}

                {/* Video Duration (Only for Video) */}
                {mediaType === 'video' && (
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase text-gray-500 font-bold tracking-wider flex items-center gap-1">
                            <Clock size={10} /> Duration
                        </label>
                        <div className="relative">
                            <select
                                value={videoDuration}
                                onChange={(e) => setVideoDuration(e.target.value)}
                                disabled={isGenerating || videoMode === 'interpolation' || videoMode === 'references'}
                                className="w-full appearance-none bg-surface/50 hover:bg-surface text-xs text-gray-300 py-2 pl-3 pr-8 rounded-lg border border-border focus:border-white/20 outline-none cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {VIDEO_DURATIONS.map(dur => (
                                    <option key={dur} value={dur}>
                                        {dur} seconds
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                        </div>
                    </div>
                )}

                {/* Video Resolution (Only for Video) */}
                {mediaType === 'video' && (
                  <div className="space-y-1">
                      <label className="text-[10px] uppercase text-gray-500 font-bold tracking-wider flex items-center gap-1">
                          <MonitorPlay size={10} /> Quality
                      </label>
                      <div className="relative">
                          <select
                              value={videoResolution}
                              onChange={(e) => setVideoResolution(e.target.value as '720p' | '1080p')}
                              disabled={isGenerating}
                              className="w-full appearance-none bg-surface/50 hover:bg-surface text-xs text-gray-300 py-2 pl-3 pr-8 rounded-lg border border-border focus:border-white/20 outline-none cursor-pointer transition-colors"
                          >
                              {VIDEO_RESOLUTIONS.map(res => (
                                  <option key={res} value={res}>
                                      {res === '720p' ? '720p (Standard)' : '1080p (HD)'}
                                  </option>
                              ))}
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                      </div>
                  </div>
                )}
                
                {/* Video Mode Selector */}
                {mediaType === 'video' && (
                     <div className="space-y-1 col-span-1 md:col-span-2">
                        <label className="text-[10px] uppercase text-gray-500 font-bold tracking-wider flex items-center gap-1">
                            <Layers size={10} /> Generation Mode
                        </label>
                        <div className="relative">
                            <select
                                value={videoMode}
                                onChange={(e) => setVideoMode(e.target.value as VideoMode)}
                                disabled={isGenerating}
                                className="w-full appearance-none bg-surface/50 hover:bg-surface text-xs text-gray-300 py-2 pl-3 pr-8 rounded-lg border border-border focus:border-white/20 outline-none cursor-pointer transition-colors"
                            >
                                <option value="standard">Text/Image to Video</option>
                                <option value="references">Reference Images</option>
                                <option value="interpolation">Frame Interpolation</option>
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                        </div>
                        <div className="text-[9px] text-gray-500 mt-1 min-h-[14px]">
                            {videoMode === 'standard' && "Generate video from prompt. Optionally add 1 image to animate."}
                            {videoMode === 'interpolation' && "Requires exactly 2 images: Start and End frame. Locked to 8s."}
                            {videoMode === 'references' && "Use images for style/content. Forces 16:9 ratio and 8s duration."}
                        </div>
                     </div>
                )}

                {/* Image Size (Only for Gemini 3 Pro) */}
                {selectedModel === ModelId.GEMINI_3_PRO_IMAGE && mediaType === 'image' && (
                  <div className="space-y-1">
                      <label className="text-[10px] uppercase text-gray-500 font-bold tracking-wider flex items-center gap-1">
                          <MonitorPlay size={10} /> Resolution
                      </label>
                      <div className="relative">
                          <select
                              value={imageSize}
                              onChange={(e) => setImageSize(e.target.value)}
                              disabled={isGenerating}
                              className="w-full appearance-none bg-surface/50 hover:bg-surface text-xs text-gray-300 py-2 pl-3 pr-8 rounded-lg border border-border focus:border-white/20 outline-none cursor-pointer transition-colors"
                          >
                              {IMAGE_SIZES.map(size => (
                                  <option key={size} value={size}>
                                      {size === '1K' ? '1K (1024px)' : size === '2K' ? '2K (2048px)' : '4K (4096px)'}
                                  </option>
                              ))}
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                      </div>
                  </div>
                )}

                {/* Creativity (Image and Audio) */}
                {(mediaType === 'image' || mediaType === 'audio') && (
                    <div className="space-y-2 col-span-1">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] uppercase text-gray-500 font-bold tracking-wider flex items-center gap-1">
                                <ThermometerSun size={10} /> {mediaType === 'audio' ? 'Variation' : 'Creativity'}
                            </label>
                            <span className="text-[10px] text-gray-400">{creativity}%</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={creativity} 
                            onChange={(e) => setCreativity(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-surface/50 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110 transition-all"
                        />
                    </div>
                )}
            </div>
        </div>
      )}

      {/* Validation Error Banner */}
      {validationError && (
        <div className="mb-3 flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
          <span className="flex-1">{validationError}</span>
          <button
            onClick={() => setValidationError(null)}
            className="p-0.5 hover:bg-red-500/20 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Attachments Preview Area - Context attachments (current layer) + user attachments */}
      {(contextAttachments.length > 0 || attachments.length > 0) && (
        <div className="flex gap-2 mb-3 overflow-x-auto p-1 scrollbar-hide">
          {/* Context attachments (e.g., current layer being edited) */}
          {contextAttachments.map((att, idx) => (
            <div key={`ctx-${att.id}`} className="relative group shrink-0">
              <div className={`rounded-lg border border-primary/50 overflow-hidden relative ${isGlobal ? 'w-16 h-16' : 'w-10 h-10'}`}>
                <img src={att.previewUrl} alt="Current layer" className="w-full h-full object-cover" />
                {/* Number badge for @image reference */}
                <div
                  className="absolute top-0.5 left-0.5 bg-primary text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm"
                  title={`@image${idx + 1} - ${att.displayName || 'Current Layer'}`}
                >
                  {idx + 1}
                </div>
              </div>
            </div>
          ))}
          {/* User-added attachments */}
          {attachments.map((att, idx) => {
            const label = getLabelForAttachment(idx);
            // Calculate global index including context attachments for @image references
            const globalIndex = idx + contextAttachments.length + 1;
            return (
                <div key={att.id} className="relative group shrink-0">
                <div className={`rounded-lg border border-border overflow-hidden relative ${isGlobal ? 'w-16 h-16' : 'w-10 h-10'}`}>
                    <img src={att.previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    {/* Number badge for @image reference */}
                    <div
                      className="absolute top-0.5 left-0.5 bg-primary text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm"
                      title={`@image${globalIndex} - ${att.displayName || att.file.name}`}
                    >
                      {globalIndex}
                    </div>
                    {label && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[7px] text-center text-white font-bold py-0.5 truncate px-1">
                            {label}
                        </div>
                    )}
                    <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white/70 hover:bg-red-500 hover:text-white rounded-full p-0.5 transition-colors"
                    title="Remove attachment"
                    >
                    <X size={12} />
                    </button>
                </div>
                </div>
            );
          })}
        </div>
      )}

      {/* Input Area */}
      <div className="flex items-end gap-2">
        
        {/* Mode Selector - Hidden if isExtension */}
        {!isExtension && (
            <div className="relative shrink-0" ref={modeMenuRef}>
                 <button
                    onClick={() => setShowModeMenu(!showModeMenu)}
                    className="flex items-center gap-2 p-2.5 bg-surface/50 hover:bg-surface border border-border hover:border-white/20 rounded-xl transition-all text-gray-300 hover:text-white"
                    title="Select Mode"
                    disabled={isGenerating}
                 >
                    {mediaType === 'image' && <ImageIcon size={20} />}
                    {mediaType === 'video' && <Video size={20} />}
                    {mediaType === 'audio' && <Mic size={20} />}
                    {isGlobal && <ChevronDown size={14} className="opacity-50" />}
                 </button>

                 {showModeMenu && (
                     <div className={`
                        absolute left-0 border border-border bg-surface rounded-xl shadow-xl overflow-hidden min-w-[140px] z-30
                        ${isGlobal ? 'bottom-full mb-2' : 'top-full mt-2'}
                     `}>
                        <button 
                            onClick={() => { setMediaType('image'); setShowModeMenu(false); }}
                            className={`flex items-center gap-3 w-full px-4 py-3 text-sm text-left hover:bg-white/5 transition-colors ${mediaType === 'image' ? 'text-primary' : 'text-gray-300'}`}
                        >
                            <ImageIcon size={16} /> Image
                        </button>
                        <button 
                            onClick={() => { setMediaType('video'); setShowModeMenu(false); }}
                            className={`flex items-center gap-3 w-full px-4 py-3 text-sm text-left hover:bg-white/5 transition-colors ${mediaType === 'video' ? 'text-primary' : 'text-gray-300'}`}
                        >
                            <Video size={16} /> Video
                        </button>
                        <button 
                            onClick={() => { setMediaType('audio'); setShowModeMenu(false); }}
                            className={`flex items-center gap-3 w-full px-4 py-3 text-sm text-left hover:bg-white/5 transition-colors ${mediaType === 'audio' ? 'text-primary' : 'text-gray-300'}`}
                        >
                            <Mic size={16} /> Audio
                        </button>
                     </div>
                 )}
            </div>
        )}

        {/* Attachment Button */}
        {!isExtension && mediaType !== 'audio' && (
            <div className="relative shrink-0" ref={attachMenuRef}>
                 <button
                    onClick={() => setShowAttachMenu(!showAttachMenu)}
                    className="p-2.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors relative"
                    title="Attach Media"
                    disabled={isGenerating}
                 >
                    <Paperclip size={20} />
                    {/* Attachment count badge */}
                    {(attachments.length + contextAttachments.length) > 0 && (
                      <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                        {attachments.length + contextAttachments.length}
                      </span>
                    )}
                 </button>

                 {showAttachMenu && (
                     <div className={`
                        absolute left-0 border border-border bg-surface rounded-xl shadow-xl overflow-hidden min-w-[180px] z-30
                        ${isGlobal ? 'bottom-full mb-2' : 'top-full mt-2'}
                     `}>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left hover:bg-white/5 transition-colors text-gray-300 hover:text-white"
                        >
                            <Upload size={16} /> Upload Media
                        </button>
                        <button 
                            onClick={() => { setShowAttachMenu(false); onSelectOnCanvasStart && onSelectOnCanvasStart(); }}
                            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left hover:bg-white/5 transition-colors text-gray-300 hover:text-white border-t border-white/5"
                        >
                            <MousePointer2 size={16} /> Select on Canvas
                        </button>
                     </div>
                 )}
            </div>
        )}

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          multiple 
          onChange={handleFileChange}
        />

        <div className="flex-1 min-w-0">
          <textarea
            ref={inputRef || textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onWheel={(e) => e.stopPropagation()}
            placeholder={getPlaceholder()}
            className="w-full bg-transparent text-white placeholder-gray-500 resize-none py-2.5 focus:outline-none text-sm custom-scrollbar"
            rows={1}
            style={{ minHeight: '44px', maxHeight: '300px' }}
            disabled={isGenerating}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
            {!isExtension && (
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={`p-2.5 rounded-xl transition-colors ${showSettings ? 'text-primary bg-primary/10' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                    title="Settings"
                >
                    <Settings2 size={20} />
                </button>
            )}
            <button
                onClick={() => handleSubmit()}
                disabled={isGenerating || (!prompt.trim() && attachments.length === 0 && contextAttachments.length === 0)}
                className={`p-3 rounded-xl flex items-center justify-center transition-all duration-200 ${
                isGenerating
                    ? 'bg-primary/50 cursor-not-allowed'
                    : (!prompt.trim() && attachments.length === 0 && contextAttachments.length === 0)
                      ? 'bg-primary/30 cursor-not-allowed text-white/50'
                      : 'bg-primary hover:bg-primary-hover hover:scale-105 text-white shadow-lg shadow-primary/30'
                }`}
                title={(!prompt.trim() && attachments.length === 0 && contextAttachments.length === 0) ? "Add a prompt or attach media to generate" : isGenerating ? "Generating..." : "Generate"}
            >
                {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
        </div>
      </div>

      {onCancel && (
        <button
            onClick={onCancel}
            className="absolute -top-3 -right-3 bg-elevated border border-border/50 p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-surface transition-colors shadow-lg"
        >
            <X size={14} />
        </button>
      )}
      </div>
    </div>
  );
};

export default PromptBar;
