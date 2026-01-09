
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { LayerData, ModelId, Attachment, MediaType, VideoMode, Annotation, GenerationTask } from './types';
import { generateImageContent, generateVideoContent, generateSpeechContent, generateLayerTitle, GenerationCallbacks } from './services/geminiService';
import { saveLayers, loadLayers, saveViewState, loadViewState, saveHistory, loadHistory, clearAllData } from './services/storageService';
import { generateThumbnail } from './services/thumbnailService';
import { storeAsset, getAssetUrl, getAssetBase64 } from './services/assetStore';
import { hasStoredApiKey, setStoredApiKey } from './services/apiKeyService';
import PromptBar from './components/PromptBar';
import CanvasLayer from './components/CanvasLayer';
import Sidebar from './components/Sidebar';
import Minimap from './components/Minimap';
import ApiKeyModal from './components/ApiKeyModal';
import { Image as ImageIcon, ZoomIn, ZoomOut, MousePointer2, Undo2, Redo2, StickyNote, BoxSelect, Pencil, Type as TypeIcon, Trash2, Key } from 'lucide-react';
import { STICKY_COLORS, GROUP_COLORS } from './constants';

// A simple 1x1 transparent pixel for placeholders
const PLACEHOLDER_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const getImageDimensions = (src: string): Promise<{width: number, height: number}> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
};

const getClosestAspectRatio = (width: number, height: number): string => {
  const r = width / height;
  const supported = [{ str: '1:1', val: 1 }, { str: '3:4', val: 3/4 }, { str: '4:3', val: 4/3 }, { str: '9:16', val: 9/16 }, { str: '16:9', val: 16/9 }, { str: '3:2', val: 3/2 }, { str: '2:3', val: 2/3 }, { str: '5:4', val: 5/4 }, { str: '4:5', val: 4/5 }];
  const closest = supported.reduce((prev, curr) => Math.abs(curr.val - r) < Math.abs(prev.val - r) ? curr : prev);
  return closest.str;
};

const App: React.FC = () => {
  const [layers, setLayers] = useState<LayerData[]>([]);
  const [history, setHistory] = useState<LayerData[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  // Generation task management for non-blocking UI
  const [generationTasks, setGenerationTasks] = useState<Map<string, GenerationTask>>(new Map());
  const hasActiveGenerations = generationTasks.size > 0;

  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(0.6);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [globalAttachments, setGlobalAttachments] = useState<Attachment[]>([]);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectionTarget, setSelectionTarget] = useState<'global' | 'layer' | null>(null);
  const [selectionOriginLayerId, setSelectionOriginLayerId] = useState<string | null>(null);
  const [injectedAttachment, setInjectedAttachment] = useState<Attachment | null>(null);
  const [snapLines, setSnapLines] = useState<{ vertical?: number, horizontal?: number } | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [isChangingApiKey, setIsChangingApiKey] = useState(false);

  const fileDropRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  // Cancel a generation task (also handles disconnected/orphaned generations)
  const cancelGeneration = useCallback((layerId: string) => {
    const task = generationTasks.get(layerId);
    if (task) {
      task.abortController.abort();
    }
    // Always remove the layer when cancel is clicked (handles disconnected generations)
    setLayers(prev => prev.filter(l => l.id !== layerId));
    // Always clean up the task from map
    setGenerationTasks(prev => {
      const next = new Map(prev);
      next.delete(layerId);
      return next;
    });
  }, [generationTasks]);

  // Update task progress
  const updateTaskProgress = useCallback((layerId: string, progress: number) => {
    setGenerationTasks(prev => {
      const task = prev.get(layerId);
      if (!task) return prev;
      const next = new Map(prev);
      next.set(layerId, { ...task, progress });
      return next;
    });
  }, []);

  // Get task for a layer
  const getTaskForLayer = useCallback((layerId: string) => {
    return generationTasks.get(layerId);
  }, [generationTasks]);

  const addToHistory = useCallback((newLayers: LayerData[]) => {
      setHistory(prev => {
          const newHistory = prev.slice(0, historyIndex + 1);
          newHistory.push(newLayers);
          return newHistory;
      });
      setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setLayers(history[newIndex]);
    }
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setLayers(history[newIndex]);
    }
  }, [historyIndex, history]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (isSelectionMode && e.key === 'Escape') { setIsSelectionMode(false); setSelectionTarget(null); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, isSelectionMode]);

  // Clear selection origin when layer changes (abort any pending injection)
  useEffect(() => {
      setInjectedAttachment(null);
      setSelectionOriginLayerId(null);
  }, [selectedLayerId]);

  const clearInjectedAttachment = useCallback(() => {
      setInjectedAttachment(null);
      setSelectionOriginLayerId(null);
  }, []);

  // Hydrate state from IndexedDB on mount
  useEffect(() => {
    const hydrate = async () => {
      try {
        const [savedLayers, savedView, savedHistory] = await Promise.all([
          loadLayers(),
          loadViewState(),
          loadHistory()
        ]);
        if (savedLayers) setLayers(savedLayers);
        if (savedView) {
          setCanvasOffset(savedView.offset);
          setScale(savedView.scale);
        }
        if (savedHistory) {
          setHistory(savedHistory.history);
          setHistoryIndex(savedHistory.index);
        }
      } catch (error) {
        console.error('Failed to hydrate state:', error);
      }
      setIsHydrated(true);
      // Check for API key after hydration
      if (!hasStoredApiKey()) {
        setShowApiKeyModal(true);
      }
    };
    hydrate();
  }, []);

  // Auto-save layers, history, and view state with debounce
  useEffect(() => {
    if (!isHydrated) return;
    const timeoutId = setTimeout(() => {
      saveLayers(layers);
      saveHistory(history, historyIndex);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [layers, history, historyIndex, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    const timeoutId = setTimeout(() => {
      saveViewState(canvasOffset, scale);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [canvasOffset, scale, isHydrated]);

  // Prevent browser zoom on pinch/Ctrl+scroll - must use native listener with passive: false
  useEffect(() => {
    const el = fileDropRef.current;
    if (!el) return;
    const preventBrowserZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', preventBrowserZoom, { passive: false });
    return () => el.removeEventListener('wheel', preventBrowserZoom);
  }, []);

  const isColliding = (rect: {x: number, y: number, width: number, height: number}, others: LayerData[]) => {
      const margin = 20; 
      for (const other of others) {
          if (rect.x < other.x + other.width + margin && rect.x + rect.width + margin > other.x && rect.y < other.y + other.height + margin && rect.y + rect.height + margin > other.y) return true;
      }
      return false;
  };

  const findSmartPosition = (source: LayerData | null, targetWidth: number, targetHeight: number, allLayers: LayerData[]) => {
      if (!source) {
          const centerX = (window.innerWidth / 2 - canvasOffset.x) / scale;
          const centerY = (window.innerHeight / 2 - canvasOffset.y) / scale;
          return { x: centerX - (targetWidth / 2), y: centerY - (targetHeight / 2) };
      }
      const GAP = 20;
      const candidates = [{ x: source.x + source.width + GAP, y: source.y }, { x: source.x, y: source.y + source.height + GAP }, { x: source.x - targetWidth - GAP, y: source.y }, { x: source.x, y: source.y - targetHeight - GAP }];
      for (const cand of candidates) { if (!isColliding({ x: cand.x, y: cand.y, width: targetWidth, height: targetHeight }, allLayers)) return cand; }
      return { x: source.x + 50, y: source.y + 50 };
  };

  const getDimensionsFromAspectRatio = (ratioStr: string): { width: number, height: number } => {
      if (!ratioStr || ratioStr === 'Auto') return { width: 400, height: 400 };
      const [w, h] = ratioStr.split(':').map(Number);
      const baseSize = 400; 
      if (w > h) return { width: baseSize, height: baseSize * (h/w) };
      return { width: baseSize * (w/h), height: baseSize };
  };

  const resolveAspectRatio = (ratio: string, layer?: LayerData): string => {
      if (ratio !== 'Auto') return ratio;
      if (!layer) return '1:1';
      return getClosestAspectRatio(layer.width, layer.height);
  };

  // API Key management
  const handleApiKeySubmit = (key: string) => {
    setStoredApiKey(key);
    setShowApiKeyModal(false);
    setIsChangingApiKey(false);
  };

  const handleChangeApiKey = () => {
    setIsChangingApiKey(true);
    setShowApiKeyModal(true);
  };

  const startCanvasSelection = (target: 'global' | 'layer') => {
      setIsSelectionMode(true);
      setSelectionTarget(target);
      // Store which layer initiated the selection so we can inject the attachment back to it
      if (target === 'layer') setSelectionOriginLayerId(selectedLayerId);
  };
  const handleLayerSelectForAttachment = async (layer: LayerData) => {
      if (!isSelectionMode) return;
      if (layer.type === 'video') alert("Selecting video layers as reference is not fully supported for all models yet.");
      // Get base64 from asset store if available (blob URLs don't work for API calls)
      let base64Data = layer.src;
      if (layer.imageId) {
          const assetBase64 = await getAssetBase64(layer.imageId);
          if (assetBase64) base64Data = assetBase64;
      }
      const attachment: Attachment = { id: crypto.randomUUID(), file: new File([], `${layer.title || 'reference'}.png`, { type: 'image/png' }), previewUrl: layer.src, mimeType: 'image/png', base64: base64Data };
      if (selectionTarget === 'global') setGlobalAttachments(prev => [...prev, attachment]); else if (selectionTarget === 'layer') setInjectedAttachment(attachment);
      setIsSelectionMode(false); setSelectionTarget(null);
  };

  const handleClearCanvas = async () => {
      await clearAllData();
      setLayers([]);
      setHistory([[]]);
      setHistoryIndex(0);
      setSelectedLayerId(null);
      setCanvasOffset({ x: 0, y: 0 });
      setScale(1);
  };

  const handleLayerFocus = (id: string) => {
      const layer = layers.find(l => l.id === id);
      if (!layer) return;

      // Determine available viewport (exclude sidebar if open)
      const sidebarWidth = isSidebarOpen ? 320 : 0;
      const availableWidth = window.innerWidth - sidebarWidth;
      const availableHeight = window.innerHeight;
      
      const viewCenterX = availableWidth / 2;
      const viewCenterY = availableHeight / 2;

      // Add a margin so the layer isn't touching the edges
      const margin = 100;

      // Calculate the scale needed to fit the layer with margin
      // Clamp scale between 0.1 and 1.5
      const targetScale = Math.min(
          Math.max(
              Math.min(
                  (availableWidth - margin * 2) / layer.width,
                  (availableHeight - margin * 2) / layer.height
              ),
              0.1
          ),
          1.5
      );

      // Calculate the layer's center point in world coordinates
      const layerCenterX = layer.x + layer.width / 2;
      const layerCenterY = layer.y + layer.height / 2;

      // Calculate the new offset to center the layer in the view
      // Formula: ViewCenter = (WorldPos * Scale) + Offset
      // So: Offset = ViewCenter - (WorldPos * Scale)
      const newOffsetX = viewCenterX - (layerCenterX * targetScale);
      const newOffsetY = viewCenterY - (layerCenterY * targetScale);

      setScale(targetScale);
      setCanvasOffset({ x: newOffsetX, y: newOffsetY });
      setSelectedLayerId(id);
  };

  // --- Generation Handlers ---
  const handleGlobalGenerate = async (prompt: string, attachments: Attachment[], model: ModelId, aspectRatio: string, creativity: number, imageSize: string, resolution: '720p' | '1080p', mediaType: MediaType, duration: string, videoMode: VideoMode, startImageIndex?: number, count: number = 1, voice?: string) => {
    const requestCount = mediaType === 'video' || mediaType === 'audio' ? 1 : count;
    const allBase64s = attachments.map(a => a.base64);
    let finalAspectRatio = aspectRatio;
    if (finalAspectRatio === 'Auto') {
        if (mediaType === 'video') finalAspectRatio = '16:9';
        else if (attachments.length > 0) { try { const dim = await getImageDimensions(attachments[0].base64); finalAspectRatio = getClosestAspectRatio(dim.width, dim.height); } catch (e) { finalAspectRatio = '1:1'; } }
        else finalAspectRatio = '1:1';
    }

    let width = 400, height = 400;
    if (mediaType === 'audio') { width = 300; height = 120; }
    else { const dim = getDimensionsFromAspectRatio(finalAspectRatio); width = dim.width; height = dim.height; }

    const centerX = (window.innerWidth / 2 - canvasOffset.x) / scale;
    const centerY = (window.innerHeight / 2 - canvasOffset.y) / scale;
    const gap = 20;
    const cols = Math.ceil(Math.sqrt(requestCount));
    const startX = centerX - ((cols * width + (cols - 1) * gap) / 2);
    const startY = centerY - ((Math.ceil(requestCount/cols) * height + (Math.ceil(requestCount/cols) - 1) * gap) / 2);

    const placeholders: LayerData[] = [];
    const newTasks = new Map<string, GenerationTask>();

    for (let i = 0; i < requestCount; i++) {
        const row = Math.floor(i / cols); const col = i % cols;
        const layerId = crypto.randomUUID();
        const abortController = new AbortController();

        placeholders.push({
            id: layerId, type: mediaType, x: startX + col * (width + gap), y: startY + row * (height + gap), width, height, src: '', promptUsed: prompt, referenceImages: allBase64s, title: "Generating...", createdAt: Date.now(), isLoading: true,
            generationMetadata: { model, aspectRatio: finalAspectRatio, creativity, imageSize, resolution, duration, videoMode, voice }
        });

        newTasks.set(layerId, {
            id: crypto.randomUUID(),
            layerId,
            status: 'generating',
            abortController,
            mediaType,
            startedAt: Date.now(),
            progress: 0
        });
    }

    setLayers(prev => [...prev, ...placeholders]);
    setGenerationTasks(prev => new Map([...prev, ...newTasks]));

    // Generate all in parallel with cancellation support
    await Promise.all(placeholders.map(async (placeholder) => {
        const task = newTasks.get(placeholder.id);
        if (!task) return;

        const callbacks: GenerationCallbacks = {
            signal: task.abortController.signal,
            onProgress: (progress) => updateTaskProgress(placeholder.id, progress)
        };

        try {
            let result; let title = prompt.substring(0, 30);
            if (mediaType === 'video') {
                 let startImage = undefined; let endImage = undefined; let refs: string[] = [];
                 if (videoMode === 'standard' && allBase64s.length > 0) startImage = allBase64s[0];
                 else if (videoMode === 'interpolation') { if (allBase64s.length > 0) startImage = allBase64s[0]; if (allBase64s.length > 1) endImage = allBase64s[1]; }
                 else if (videoMode === 'references') { refs = allBase64s; startImage = undefined; }
                 const [videoRes, genTitle] = await Promise.all([ generateVideoContent({ prompt, model, mediaType, videoMode, startImage, endImage, referenceImages: refs, aspectRatio: finalAspectRatio, resolution, durationSeconds: duration }, callbacks), generateLayerTitle(prompt) ]);
                 result = videoRes; title = genTitle;
            } else if (mediaType === 'audio') {
                 const [audioRes, genTitle] = await Promise.all([ generateSpeechContent({ prompt, model, mediaType, voice }, callbacks), generateLayerTitle(prompt) ]);
                 result = audioRes; title = genTitle;
            } else {
                const [imageRes, genTitle] = await Promise.all([ generateImageContent({ prompt, model, mediaType, referenceImages: allBase64s, aspectRatio: finalAspectRatio, creativity, imageSize }, callbacks), generateLayerTitle(prompt) ]);
                result = imageRes; title = genTitle;
            }
            // Store in asset store for images (blob-based for performance)
            let finalSrc = result.url;
            let thumbnail: string | undefined;
            let imageId: string | undefined;
            let thumbnailId: string | undefined;
            if (mediaType === 'image' && result.url) {
                try {
                  const thumbnailBase64 = await generateThumbnail(result.url);
                  [imageId, thumbnailId] = await Promise.all([
                    storeAsset(result.url),
                    storeAsset(thumbnailBase64)
                  ]);
                  const [imageUrl, thumbUrl] = await Promise.all([
                    getAssetUrl(imageId),
                    getAssetUrl(thumbnailId)
                  ]);
                  finalSrc = imageUrl || result.url;
                  thumbnail = thumbUrl;
                } catch (e) { console.warn('Asset storage failed:', e); }
            }
            setLayers(prev => prev.map(l => l.id !== placeholder.id ? l : { ...l, src: finalSrc, thumbnail, imageId, thumbnailId, title: title, videoMetadata: result.metadata, generationMetadata: result.generationConfig, isLoading: false, duration: mediaType === 'video' ? parseInt(duration) : undefined }));
            // Remove completed task
            setGenerationTasks(prev => { const next = new Map(prev); next.delete(placeholder.id); return next; });
        } catch (error: any) {
            if (error.name === 'AbortError') {
                // Cancelled - layer already removed by cancelGeneration
                return;
            }
            setLayers(prev => prev.map(l => l.id !== placeholder.id ? l : { ...l, isLoading: false, error: error.message || "Generation failed" }));
            setGenerationTasks(prev => { const next = new Map(prev); next.delete(placeholder.id); return next; });
        }
    }));
    setLayers(current => { addToHistory(current); return current; }); setIsSidebarOpen(true);
  };

  const handleLayerGenerate = async (originalLayerId: string, prompt: string, attachments: Attachment[], model: ModelId, aspectRatio: string, creativity: number, imageSize: string, resolution: '720p' | '1080p', mediaType: MediaType, duration: string, videoMode: VideoMode, startImageIndex?: number, count: number = 1, voice?: string) => {
    const original = layers.find(l => l.id === originalLayerId);
    if (!original) return;
    const requestCount = mediaType === 'video' || mediaType === 'audio' ? 1 : count;
    let finalAspectRatio = aspectRatio === 'Auto' ? (mediaType === 'video' ? '16:9' : resolveAspectRatio(aspectRatio, original)) : aspectRatio;

    let width = 400, height = 400;
    if (mediaType === 'audio') { width = 300; height = 120; }
    else { const dim = getDimensionsFromAspectRatio(finalAspectRatio); width = dim.width; height = dim.height; }

    const isPlaceholder = original.src === PLACEHOLDER_SRC;
    const pos = isPlaceholder ? { x: original.x, y: original.y } : findSmartPosition(original, width, height, layers);

    const gap = 20; const cols = Math.ceil(Math.sqrt(requestCount));

    const placeholders: LayerData[] = [];
    const newTasks = new Map<string, GenerationTask>();

    for (let i = 0; i < requestCount; i++) {
        const row = Math.floor(i / cols); const col = i % cols;
        const layerId = crypto.randomUUID();
        const abortController = new AbortController();

        placeholders.push({ id: layerId, type: mediaType, x: pos.x + col * (width + gap), y: pos.y + row * (height + gap), width, height, src: '', promptUsed: prompt, referenceImages: attachments.map(a => a.base64), title: "Remixing...", createdAt: Date.now(), isLoading: true, generationMetadata: { model, aspectRatio: finalAspectRatio, creativity, imageSize, resolution, duration, videoMode, voice } });

        newTasks.set(layerId, {
            id: crypto.randomUUID(),
            layerId,
            status: 'generating',
            abortController,
            mediaType,
            startedAt: Date.now(),
            progress: 0
        });
    }

    if (isPlaceholder) {
        setLayers(prev => [...prev.filter(l => l.id !== originalLayerId), ...placeholders]);
    } else {
        setLayers(prev => [...prev, ...placeholders]);
    }
    setGenerationTasks(prev => new Map([...prev, ...newTasks]));

    await Promise.all(placeholders.map(async (placeholder, idx) => {
        const task = newTasks.get(placeholder.id);
        if (!task) return;

        const callbacks: GenerationCallbacks = {
            signal: task.abortController.signal,
            onProgress: (progress) => updateTaskProgress(placeholder.id, progress)
        };

        try {
            const allBase64s = attachments.map(a => a.base64); let result; let title = "Remix";
            if (mediaType === 'video') {
                 let startImage = undefined; let endImage = undefined; let refs: string[] = [];
                 if (videoMode === 'standard' && allBase64s.length > 0) startImage = allBase64s[0];
                 else if (videoMode === 'interpolation') { if (allBase64s.length > 0) startImage = allBase64s[0]; if (allBase64s.length > 1) endImage = allBase64s[1]; }
                 else if (videoMode === 'references') { refs = allBase64s; startImage = undefined; }
                 const [videoRes, genTitle] = await Promise.all([ generateVideoContent({ prompt, model, mediaType, videoMode, startImage, endImage, referenceImages: refs, aspectRatio: finalAspectRatio, resolution, durationSeconds: duration }, callbacks), generateLayerTitle(prompt) ]);
                 result = videoRes; title = genTitle;
            } else if (mediaType === 'audio') {
                 const [audioRes, genTitle] = await Promise.all([ generateSpeechContent({ prompt, model, mediaType, voice }, callbacks), generateLayerTitle(prompt) ]);
                 result = audioRes; title = genTitle;
            } else {
                const [imageRes, genTitle] = await Promise.all([ generateImageContent({ prompt, model, mediaType, referenceImages: allBase64s, aspectRatio: finalAspectRatio, creativity, imageSize }, callbacks), generateLayerTitle(prompt) ]);
                result = imageRes; title = genTitle;
            }
            // Store in asset store for images (blob-based for performance)
            let finalSrc = result.url;
            let thumbnail: string | undefined;
            let imageId: string | undefined;
            let thumbnailId: string | undefined;
            if (mediaType === 'image' && result.url) {
                try {
                  const thumbnailBase64 = await generateThumbnail(result.url);
                  [imageId, thumbnailId] = await Promise.all([
                    storeAsset(result.url),
                    storeAsset(thumbnailBase64)
                  ]);
                  const [imageUrl, thumbUrl] = await Promise.all([
                    getAssetUrl(imageId),
                    getAssetUrl(thumbnailId)
                  ]);
                  finalSrc = imageUrl || result.url;
                  thumbnail = thumbUrl;
                } catch (e) { console.warn('Asset storage failed:', e); }
            }
            setLayers(prev => prev.map(l => l.id !== placeholder.id ? l : { ...l, src: finalSrc, thumbnail, imageId, thumbnailId, title: title, videoMetadata: result.metadata, generationMetadata: result.generationConfig, isLoading: false, duration: mediaType === 'video' ? parseInt(duration) : undefined }));
            setGenerationTasks(prev => { const next = new Map(prev); next.delete(placeholder.id); return next; });
            if (requestCount === 1 && idx === 0) setSelectedLayerId(placeholder.id);
        } catch (error: any) {
            if (error.name === 'AbortError') return;
            setLayers(prev => prev.map(l => l.id !== placeholder.id ? l : { ...l, isLoading: false, error: error.message || "Generation failed" }));
            setGenerationTasks(prev => { const next = new Map(prev); next.delete(placeholder.id); return next; });
        }
    }));
    setLayers(current => { addToHistory(current); return current; }); setIsSidebarOpen(true);
  };

  const handleExtendVideo = async (layerId: string, prompt: string) => {
      const original = layers.find(l => l.id === layerId);
      if (!original) return;

      let inputVideoMetadata = original.videoMetadata;
      if (!inputVideoMetadata && original.src) {
            const src = original.src; const parts = src.split(','); const base64Data = parts[1] || src; let mimeType = 'video/mp4'; const match = src.match(/data:([^;]+);base64,/); if (match) mimeType = match[1];
            inputVideoMetadata = { videoBytes: base64Data, mimeType: mimeType };
      }
      if (!inputVideoMetadata) { alert("Cannot extend this layer."); return; }

      const pos = findSmartPosition(original, original.width, original.height, layers);
      const placeholderId = crypto.randomUUID();
      const abortController = new AbortController();

      const placeholder: LayerData = { id: placeholderId, type: 'video', x: pos.x, y: pos.y, width: original.width, height: original.height, src: '', promptUsed: prompt, referenceImages: [], title: "Extending...", createdAt: Date.now(), isLoading: true };

      const task: GenerationTask = {
          id: crypto.randomUUID(),
          layerId: placeholderId,
          status: 'generating',
          abortController,
          mediaType: 'video',
          startedAt: Date.now(),
          progress: 0
      };

      setLayers(prev => [...prev, placeholder]);
      setGenerationTasks(prev => new Map([...prev, [placeholderId, task]]));

      const callbacks: GenerationCallbacks = {
          signal: abortController.signal,
          onProgress: (progress) => updateTaskProgress(placeholderId, progress)
      };

      try {
            const [videoResult, title] = await Promise.all([ generateVideoContent({ prompt: prompt, model: ModelId.VEO_3_1_HIGH, mediaType: 'video', inputVideoMetadata: inputVideoMetadata, resolution: '720p', aspectRatio: '16:9' }, callbacks), generateLayerTitle(prompt) ]);
            setLayers(prev => prev.map(l => l.id !== placeholder.id ? l : { ...l, src: videoResult.url, title: title + " (Ext)", videoMetadata: videoResult.metadata, generationMetadata: videoResult.generationConfig, isLoading: false, duration: 8 }));
            setGenerationTasks(prev => { const next = new Map(prev); next.delete(placeholderId); return next; });
            setSelectedLayerId(placeholder.id);
      } catch (error: any) {
            if (error.name === 'AbortError') return;
            setLayers(prev => prev.map(l => l.id !== placeholder.id ? l : { ...l, isLoading: false, error: error.message || "Extension failed" }));
            setGenerationTasks(prev => { const next = new Map(prev); next.delete(placeholderId); return next; });
      }
      finally { setLayers(current => { addToHistory(current); return current; }); setIsSidebarOpen(true); }
  };

  const handleRemoveBackground = async (layerId: string) => {
      const layer = layers.find(l => l.id === layerId); if (!layer || layer.type === 'video') return;
      // Get base64 from asset store if available (blob URLs don't work for API calls)
      let base64Data = layer.src;
      if (layer.imageId) {
          const assetBase64 = await getAssetBase64(layer.imageId);
          if (assetBase64) base64Data = assetBase64;
      }
      const attachment: Attachment = { id: crypto.randomUUID(), file: new File([], "layer.png"), previewUrl: layer.src, mimeType: 'image/png', base64: base64Data };
      await handleLayerGenerate(layerId, "Remove the background. Keep subject.", [attachment], ModelId.GEMINI_2_5_FLASH_IMAGE, "Auto", 30, "1K", "720p", "image", "6", "standard", -1);
  };

  // --- Creation Handlers ---
  const createSticky = () => {
    const centerX = (window.innerWidth / 2 - canvasOffset.x) / scale;
    const centerY = (window.innerHeight / 2 - canvasOffset.y) / scale;
    const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
    const newLayer: LayerData = {
        id: crypto.randomUUID(), type: 'sticky', x: centerX - 100, y: centerY - 100, width: 200, height: 200, src: '', color: color, title: "Sticky Note", createdAt: Date.now()
    };
    setLayers(prev => { const next = [...prev, newLayer]; addToHistory(next); return next; });
    setSelectedLayerId(newLayer.id);
  };

  const createGroup = () => {
    const centerX = (window.innerWidth / 2 - canvasOffset.x) / scale;
    const centerY = (window.innerHeight / 2 - canvasOffset.y) / scale;
    const newLayer: LayerData = {
        id: crypto.randomUUID(), type: 'group', x: centerX - 300, y: centerY - 200, width: 600, height: 400, src: '', color: GROUP_COLORS[0], title: "Group Frame", createdAt: Date.now()
    };
    // Add groups to beginning so they are behind
    setLayers(prev => { const next = [newLayer, ...prev]; addToHistory(next); return next; });
    setSelectedLayerId(newLayer.id);
  };

  const createDrawingLayer = () => {
      const centerX = (window.innerWidth / 2 - canvasOffset.x) / scale;
      const centerY = (window.innerHeight / 2 - canvasOffset.y) / scale;
      const newLayer: LayerData = {
          id: crypto.randomUUID(), type: 'drawing', x: centerX - 400, y: centerY - 300, width: 800, height: 600, src: '', title: "Drawing", createdAt: Date.now()
      };
      setLayers(prev => { const next = [...prev, newLayer]; addToHistory(next); return next; });
      setSelectedLayerId(newLayer.id);
  };

  const createTextLayer = () => {
    const centerX = (window.innerWidth / 2 - canvasOffset.x) / scale;
    const centerY = (window.innerHeight / 2 - canvasOffset.y) / scale;
    const newLayer: LayerData = {
        id: crypto.randomUUID(), type: 'text', x: centerX - 150, y: centerY - 50, width: 300, height: 100, src: '', color: '#ffffff', title: "Text", createdAt: Date.now(), text: "Type your text"
    };
    setLayers(prev => { const next = [...prev, newLayer]; addToHistory(next); return next; });
    setSelectedLayerId(newLayer.id);
  };

  const updateLayerPosition = useCallback((id: string, x: number, y: number) => {
    // Snapping Logic
    const SNAP_THRESHOLD = 5 / scale;
    let snappedX = x;
    let snappedY = y;
    let verticalSnap: number | undefined;
    let horizontalSnap: number | undefined;

    const movingLayer = layers.find(l => l.id === id);

    if (movingLayer) {
        const movingLeft = x;
        const movingRight = x + movingLayer.width;
        const movingCenterX = x + movingLayer.width / 2;
        const movingTop = y;
        const movingBottom = y + movingLayer.height;
        const movingCenterY = y + movingLayer.height / 2;

        layers.forEach(other => {
            if (other.id === id) return;
            // Don't snap to children if moving parent
            if (other.parentId === id) return;
            // Don't snap to parent if moving child? (optional, usually ok)

            const otherLeft = other.x;
            const otherRight = other.x + other.width;
            const otherCenterX = other.x + other.width / 2;
            const otherTop = other.y;
            const otherBottom = other.y + other.height;
            const otherCenterY = other.y + other.height / 2;

            // X Snapping
            if (Math.abs(movingLeft - otherLeft) < SNAP_THRESHOLD) { snappedX = otherLeft; verticalSnap = otherLeft; }
            else if (Math.abs(movingLeft - otherRight) < SNAP_THRESHOLD) { snappedX = otherRight; verticalSnap = otherRight; }
            else if (Math.abs(movingRight - otherLeft) < SNAP_THRESHOLD) { snappedX = otherLeft - movingLayer.width; verticalSnap = otherLeft; }
            else if (Math.abs(movingRight - otherRight) < SNAP_THRESHOLD) { snappedX = otherRight - movingLayer.width; verticalSnap = otherRight; }
            else if (Math.abs(movingCenterX - otherCenterX) < SNAP_THRESHOLD) { snappedX = otherCenterX - movingLayer.width/2; verticalSnap = otherCenterX; }

            // Y Snapping
            if (Math.abs(movingTop - otherTop) < SNAP_THRESHOLD) { snappedY = otherTop; horizontalSnap = otherTop; }
            else if (Math.abs(movingTop - otherBottom) < SNAP_THRESHOLD) { snappedY = otherBottom; horizontalSnap = otherBottom; }
            else if (Math.abs(movingBottom - otherTop) < SNAP_THRESHOLD) { snappedY = otherTop - movingLayer.height; horizontalSnap = otherTop; }
            else if (Math.abs(movingBottom - otherBottom) < SNAP_THRESHOLD) { snappedY = otherBottom - movingLayer.height; horizontalSnap = otherBottom; }
            else if (Math.abs(movingCenterY - otherCenterY) < SNAP_THRESHOLD) { snappedY = otherCenterY - movingLayer.height/2; horizontalSnap = otherCenterY; }
        });
    }

    setSnapLines({ vertical: verticalSnap, horizontal: horizontalSnap });

    setLayers(prev => {
        const target = prev.find(l => l.id === id);
        if (!target) return prev;

        const dx = snappedX - target.x;
        const dy = snappedY - target.y;

        // Move Group + Children Logic (Explicit ParentID)
        if (target.type === 'group') {
            return prev.map(l => {
                if (l.id === id) return { ...l, x: snappedX, y: snappedY };
                if (l.parentId === id) {
                    return { ...l, x: l.x + dx, y: l.y + dy };
                }
                return l;
            });
        }
        return prev.map(l => l.id === id ? { ...l, x: snappedX, y: snappedY } : l);
    });
  }, [layers, scale]);
  
  const updateLayerTransform = useCallback((id: string, x: number, y: number, width: number, height: number) => { setLayers(prev => prev.map(l => l.id === id ? { ...l, x, y, width, height } : l)); }, []);
  const updateLayerAnnotations = useCallback((id: string, annotations: Annotation[]) => { setLayers(prev => prev.map(l => l.id === id ? { ...l, annotations } : l)); }, []);
  const updateLayerText = useCallback((id: string, text: string) => { setLayers(prev => prev.map(l => l.id === id ? { ...l, text } : l)); }, []);
  const updateLayerColor = useCallback((id: string, color: string) => { setLayers(prev => prev.map(l => l.id === id ? { ...l, color } : l)); }, []);
  const updateLayerFontSize = useCallback((id: string, delta: number) => {
    setLayers(prev => prev.map(l => {
        if (l.id === id) {
            const currentSize = l.fontSize || (l.type === 'text' ? 48 : 24);
            const newSize = Math.max(12, Math.min(200, currentSize + delta));
            return { ...l, fontSize: newSize };
        }
        return l;
    }));
  }, []);
  
  const reorderLayer = useCallback((id: string, action: 'front' | 'back' | 'forward' | 'backward') => {
      setLayers(prev => {
          const idx = prev.findIndex(l => l.id === id);
          if (idx === -1) return prev;
          const newLayers = [...prev];
          const item = newLayers.splice(idx, 1)[0];
          
          if (action === 'front') newLayers.push(item);
          else if (action === 'back') newLayers.unshift(item);
          else if (action === 'forward') {
              const newIdx = Math.min(idx + 1, newLayers.length);
              newLayers.splice(newIdx, 0, item);
          } else if (action === 'backward') {
              const newIdx = Math.max(idx - 1, 0);
              newLayers.splice(newIdx, 0, item);
          }
          return newLayers;
      });
      setHistoryIndex(i => i + 1); // Simple history tick
  }, []);

  const handleDragEnd = useCallback((id: string) => { 
      setSnapLines(null);
      setLayers(currentLayers => { 
          // Check Parent-Child Assignment
          const dragged = currentLayers.find(l => l.id === id);
          if (!dragged) return currentLayers;
          
          // Don't reparent groups into groups to avoid infinite recursion complexity for now
          if (dragged.type === 'group') {
              addToHistory(currentLayers);
              return currentLayers;
          }

          const center = { x: dragged.x + dragged.width/2, y: dragged.y + dragged.height/2 };
          let newParentId: string | undefined = undefined;

          // Find group containing center, iterate in reverse to find top-most group
          for (let i = currentLayers.length - 1; i >= 0; i--) {
              const l = currentLayers[i];
              if (l.type === 'group' && l.id !== id) {
                  if (center.x >= l.x && center.x <= l.x + l.width && center.y >= l.y && center.y <= l.y + l.height) {
                      newParentId = l.id;
                      break;
                  }
              }
          }
          
          // Update parentId if changed
          if (dragged.parentId !== newParentId) {
             const updated = currentLayers.map(l => l.id === id ? { ...l, parentId: newParentId } : l);
             addToHistory(updated);
             return updated;
          }
          
          addToHistory(currentLayers); 
          return currentLayers; 
      }); 
  }, [addToHistory]);

  const deleteLayer = useCallback((id: string) => { setLayers(prev => { const next = prev.filter(l => l.id !== id); addToHistory(next); return next; }); if (selectedLayerId === id) setSelectedLayerId(null); }, [selectedLayerId, addToHistory]);
  const duplicateLayer = useCallback((id: string) => { setLayers(prev => { const layer = prev.find(l => l.id === id); if (!layer) return prev; const newLayer: LayerData = { ...layer, id: crypto.randomUUID(), x: layer.x + 20, y: layer.y + 20, title: `${layer.title} (Copy)`, createdAt: Date.now() }; const next = [...prev, newLayer]; addToHistory(next); setSelectedLayerId(newLayer.id); return next; }); }, [addToHistory]);
  const exportLayer = useCallback(async (id: string, format: 'png' | 'jpg' | 'mp4' | 'wav') => {
    const layer = layers.find(l => l.id === id);
    if (!layer || !layer.src) return;

    try {
      let exportUrl = layer.src;
      const filename = `${(layer.title || 'export').replace(/\s+/g, '_')}.${format}`;

      // For video/audio, just download directly
      if (layer.type === 'video' || layer.type === 'audio') {
        const link = document.createElement('a');
        link.download = filename;
        link.href = exportUrl;
        link.click();
        return;
      }

      // For images with annotations, composite them
      if (layer.annotations && layer.annotations.length > 0) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = layer.src;
        await new Promise(r => img.onload = r);

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          // Draw annotations (simplified - text and rectangles)
          for (const ann of layer.annotations) {
            ctx.strokeStyle = ann.color || '#ffffff';
            ctx.fillStyle = ann.color || '#ffffff';
            ctx.lineWidth = ann.strokeWidth || 2;
            if (ann.type === 'text' && ann.text) {
              ctx.font = `${ann.fontSize || 24}px sans-serif`;
              ctx.fillText(ann.text, ann.points[0].x, ann.points[0].y);
            } else if (ann.type === 'rectangle' && ann.points.length >= 4) {
              ctx.beginPath();
              ctx.moveTo(ann.points[0].x, ann.points[0].y);
              for (let i = 1; i < ann.points.length; i++) {
                ctx.lineTo(ann.points[i].x, ann.points[i].y);
              }
              ctx.closePath();
              ctx.stroke();
            } else if (ann.type === 'pencil' && ann.points.length > 1) {
              ctx.beginPath();
              ctx.moveTo(ann.points[0].x, ann.points[0].y);
              for (let i = 1; i < ann.points.length; i++) {
                ctx.lineTo(ann.points[i].x, ann.points[i].y);
              }
              ctx.stroke();
            }
          }
          exportUrl = canvas.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', 0.9);
        }
      }

      // Convert to JPG if needed (with white background)
      if (format === 'jpg' && !exportUrl.startsWith('data:image/jpeg')) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = exportUrl;
        await new Promise(r => img.onload = r);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          exportUrl = canvas.toDataURL('image/jpeg', 0.9);
        }
      }

      const link = document.createElement('a');
      link.download = filename;
      link.href = exportUrl;
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, [layers]);
  const renameLayer = useCallback((id: string, newTitle: string) => { setLayers(prev => { const next = prev.map(l => l.id === id ? { ...l, title: newTitle } : l); addToHistory(next); return next; }); }, [addToHistory]);
  const flipLayer = useCallback((id: string, axis: 'x' | 'y') => { setLayers(prev => { const next = prev.map(l => l.id !== id ? l : { ...l, flipX: axis === 'x' ? !l.flipX : l.flipX, flipY: axis === 'y' ? !l.flipY : l.flipY }); addToHistory(next); return next; }); }, [addToHistory]);
  const handleAddAsReference = useCallback(async (layerId: string) => {
      const layer = layers.find(l => l.id === layerId);
      if (!layer || layer.type === 'video') return;
      // Get base64 from asset store if available (blob URLs don't work for API calls)
      let base64Data = layer.src;
      if (layer.imageId) {
          const assetBase64 = await getAssetBase64(layer.imageId);
          if (assetBase64) base64Data = assetBase64;
      }
      const newAttachment: Attachment = { id: crypto.randomUUID(), file: new File([], `${layer.title || 'reference'}.png`, { type: 'image/png' }), previewUrl: layer.src, mimeType: 'image/png', base64: base64Data };
      setGlobalAttachments(prev => [...prev, newAttachment]);
      setSelectedLayerId(null);
      setTimeout(() => promptInputRef.current?.focus(), 50);
  }, [layers]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]; const isImage = file.type.startsWith('image/'); const isVideo = file.type.startsWith('video/');
      const dropX = (e.clientX - canvasOffset.x) / scale; const dropY = (e.clientY - canvasOffset.y) / scale;
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target?.result as string; const img = new Image();
            img.onload = async () => {
                let w = img.naturalWidth; let h = img.naturalHeight; const MAX = 400; if (w > MAX || h > MAX) { if (w > h) { h = (h / w) * MAX; w = MAX; } else { w = (w / h) * MAX; h = MAX; } }
                // Store image in asset store (blob-based) for performance
                let imageId: string | undefined;
                let thumbnailId: string | undefined;
                let thumbnailUrl: string | undefined;
                let imageUrl: string | undefined;
                try {
                  const thumbnailBase64 = await generateThumbnail(base64);
                  [imageId, thumbnailId] = await Promise.all([
                    storeAsset(base64),
                    storeAsset(thumbnailBase64)
                  ]);
                  // Get blob URLs for immediate display
                  [imageUrl, thumbnailUrl] = await Promise.all([
                    getAssetUrl(imageId),
                    getAssetUrl(thumbnailId)
                  ]);
                } catch (e) { console.warn('Asset storage failed, falling back to inline:', e); }
                const newLayer: LayerData = {
                  id: crypto.randomUUID(),
                  type: 'image',
                  x: dropX - (w/2),
                  y: dropY - (h/2),
                  width: w,
                  height: h,
                  src: imageUrl || base64,
                  thumbnail: thumbnailUrl,
                  imageId,
                  thumbnailId,
                  title: file.name.replace(/\.[^/.]+$/, ""),
                  createdAt: Date.now(),
                  promptUsed: "Uploaded Image"
                };
                setLayers(prev => { const next = [...prev, newLayer]; addToHistory(next); return next; }); setSelectedLayerId(newLayer.id);
            }; img.src = base64;
        }; reader.readAsDataURL(file);
      } else if (isVideo) {
          const reader = new FileReader();
          reader.onload = (event) => {
             const base64 = event.target?.result as string; const video = document.createElement('video'); video.preload = 'metadata';
             video.onloadedmetadata = () => { let w = video.videoWidth; let h = video.videoHeight; const MAX = 400; if (w > MAX || h > MAX) { if (w > h) { h = (h / w) * MAX; w = MAX; } else { w = (w / h) * MAX; h = MAX; } }
                 const newLayer: LayerData = { id: crypto.randomUUID(), type: 'video', x: dropX - (w/2), y: dropY - (h/2), width: w, height: h, src: base64, title: file.name.replace(/\.[^/.]+$/, ""), createdAt: Date.now(), promptUsed: "Uploaded Video", duration: video.duration };
                 setLayers(prev => { const next = [...prev, newLayer]; addToHistory(next); return next; }); setSelectedLayerId(newLayer.id);
             }; video.src = base64;
          }; reader.readAsDataURL(file);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleBackgroundClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget && !isSelectionMode) setSelectedLayerId(null); };
  const [isPanning, setIsPanning] = useState(false); const panStartRef = useRef({ x: 0, y: 0 });
  // RAF batching for smooth pan performance
  const pendingOffsetRef = useRef<{x: number, y: number} | null>(null);
  const rafIdRef = useRef<number>(0);
  const handleCanvasMouseDown = (e: React.MouseEvent) => { if (e.button === 1 || (e.button === 0 && e.shiftKey)) { e.preventDefault(); setIsPanning(true); panStartRef.current = { x: e.clientX, y: e.clientY }; } else { handleBackgroundClick(e); } };
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      // Accumulate deltas in ref, batch via RAF
      pendingOffsetRef.current = {
        x: (pendingOffsetRef.current?.x ?? canvasOffset.x) + dx,
        y: (pendingOffsetRef.current?.y ?? canvasOffset.y) + dy
      };
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          if (pendingOffsetRef.current) {
            setCanvasOffset(pendingOffsetRef.current);
            pendingOffsetRef.current = null;
          }
          rafIdRef.current = 0;
        });
      }
    }
  };
  const handleCanvasMouseUp = () => { setIsPanning(false); if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = 0; } };
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - canvasOffset.x) / scale;
      const worldY = (mouseY - canvasOffset.y) / scale;
      const newScale = Math.min(Math.max(scale + (-e.deltaY * 0.003), 0.1), 5);
      setScale(newScale);
      setCanvasOffset({ x: mouseX - worldX * newScale, y: mouseY - worldY * newScale });
    } else {
      e.preventDefault();
      setCanvasOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };
  const zoomIn = () => setScale(s => Math.min(s + 0.1, 5)); const zoomOut = () => setScale(s => Math.max(s - 0.1, 0.1));

  // Viewport culling: only render layers that are visible or near the viewport
  const visibleLayers = useMemo(() => {
    // Use window dimensions for viewport size
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;

    // Convert viewport to world coordinates
    const viewLeft = -canvasOffset.x / scale;
    const viewTop = -canvasOffset.y / scale;
    const viewRight = viewLeft + viewportWidth / scale;
    const viewBottom = viewTop + viewportHeight / scale;

    // Add margin for preloading nearby layers (500px in world units)
    const margin = 500;

    return layers.filter(layer => {
      // Always show selected layer
      if (layer.id === selectedLayerId) return true;
      // Always show layers that are loading (they have UI that shouldn't disappear)
      if (layer.isLoading) return true;

      // Check if layer intersects with expanded viewport
      const layerRight = layer.x + layer.width;
      const layerBottom = layer.y + layer.height;

      return !(
        layerRight < viewLeft - margin ||
        layer.x > viewRight + margin ||
        layerBottom < viewTop - margin ||
        layer.y > viewBottom + margin
      );
    });
  }, [layers, canvasOffset, scale, selectedLayerId]);

  return (
    <div className={`w-screen h-screen bg-background relative overflow-hidden flex flex-col ${isSelectionMode ? 'cursor-crosshair' : ''}`}>
      {isSelectionMode && <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[60] bg-primary text-white px-6 py-2 rounded-full shadow-lg font-bold animate-pulse pointer-events-none">Click a layer to select it as reference</div>}

      <div className={`flex-1 relative overflow-hidden ${isPanning ? 'cursor-grabbing' : ''}`} style={{ touchAction: 'none' }} onDrop={handleDrop} onDragOver={handleDragOver} onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp} onWheel={handleWheel} ref={fileDropRef}>
        {/* Canvas grid - warm tint */}
        <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#2a2520 1px, transparent 1px)', backgroundSize: `${20 * scale}px ${20 * scale}px`, backgroundPosition: `${canvasOffset.x}px ${canvasOffset.y}px` }} />
        {layers.length === 0 && !hasActiveGenerations && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center space-y-4 opacity-50 animate-fade-in-up">
                    <div className="bg-elevated/80 backdrop-blur-xl p-8 rounded-3xl border border-border/50 shadow-2xl shadow-black/30 inline-block">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <ImageIcon size={32} className="text-primary" />
                        </div>
                        <h2 className="text-2xl font-display font-bold text-text-primary">AI Canvas</h2>
                        <p className="text-text-secondary max-w-sm mt-3 leading-relaxed">Drag & drop images or videos,<br/>or use the prompt bar to generate with AI.</p>
                    </div>
                </div>
             </div>
        )}
        <div style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${scale})`, transformOrigin: '0 0', width: '100%', height: '100%', pointerEvents: 'none' }} className="absolute top-0 left-0">
            {/* Viewport culling: only render visible layers */}
            {visibleLayers.map(layer => (
            <div key={layer.id} className="pointer-events-auto">
                 <CanvasLayer
                    layer={layer}
                    isSelected={selectedLayerId === layer.id}
                    scale={scale}
                    onSelect={(id) => { if (isSelectionMode) handleLayerSelectForAttachment(layer); else setSelectedLayerId(id); }}
                    onUpdatePosition={updateLayerPosition}
                    onUpdateTransform={updateLayerTransform}
                    onUpdateAnnotations={updateLayerAnnotations}
                    onUpdateText={updateLayerText}
                    onUpdateColor={updateLayerColor}
                    onUpdateFontSize={updateLayerFontSize}
                    onDragEnd={() => handleDragEnd(layer.id)}
                    onGenerate={(p, a, m, ar, c, s, res, mt, d, im, si, count, voice) => handleLayerGenerate(layer.id, p, a, m, ar, c, s, res, mt, d, im, si, count, voice)}
                    onDelete={deleteLayer}
                    onDuplicate={duplicateLayer}
                    onRename={renameLayer}
                    onFlip={flipLayer}
                    onAddReference={handleAddAsReference}
                    onRemoveBackground={handleRemoveBackground}
                    onExtendVideo={handleExtendVideo}
                    onReorder={reorderLayer}
                    isGenerating={hasActiveGenerations}
                    generationTask={getTaskForLayer(layer.id)}
                    onCancelGeneration={() => cancelGeneration(layer.id)}
                    onSelectOnCanvasStart={() => startCanvasSelection('layer')}
                    injectedAttachment={selectionOriginLayerId === layer.id ? injectedAttachment : null}
                    onInjectedAttachmentConsumed={clearInjectedAttachment}
                    isSelectionMode={isSelectionMode}
                />
            </div>
            ))}
            
            {/* Snap Lines - Warm Ember amber */}
            {snapLines?.vertical !== undefined && (
                <div className="absolute top-[-10000px] bottom-[-10000px] w-px border-l border-dashed border-primary z-[100]" style={{ left: snapLines.vertical }}></div>
            )}
            {snapLines?.horizontal !== undefined && (
                <div className="absolute left-[-10000px] right-[-10000px] h-px border-t border-dashed border-primary z-[100]" style={{ top: snapLines.horizontal }}></div>
            )}
        </div>
      </div>

      {selectedLayerId === null && (
          <div className="absolute bottom-8 left-0 right-0 px-4 z-50 pointer-events-none transition-all duration-300" style={{ marginLeft: isSidebarOpen ? 320 : 0 }}>
             <div className="pointer-events-auto"><PromptBar onSubmit={handleGlobalGenerate} isGenerating={hasActiveGenerations} variant="global" attachments={globalAttachments} onAttachmentsChange={setGlobalAttachments} onSelectOnCanvasStart={() => startCanvasSelection('global')} inputRef={promptInputRef} /></div>
          </div>
      )}
      
      {/* Center-top branding - Warm Ember */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
         <div className="bg-elevated/70 backdrop-blur-xl border border-border/50 px-4 py-2 rounded-full text-xs font-medium flex items-center gap-4 shadow-xl shadow-black/30">
             <span className="font-display font-semibold text-primary">AI Canvas</span>
             <span className="w-px h-3 bg-border"></span>
             <span className="flex items-center gap-1.5 text-text-secondary"><MousePointer2 size={12}/> Select</span>
             <span className="flex items-center gap-1.5 text-text-secondary"><span className="border border-border rounded px-1.5 py-0.5 text-[10px] bg-surface/50">Shift</span> + Drag to Pan</span>
         </div>
      </div>

      {/* Right-side Toolbar - Warm Ember enhanced glassmorphism */}
      <div className="absolute top-4 right-4 z-50 pointer-events-auto bg-elevated/70 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl shadow-black/40 p-2 flex flex-col gap-1.5 w-11">
         <button onClick={undo} disabled={historyIndex === 0} className={`p-2 rounded-lg text-text-secondary transition-all duration-200 ${historyIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-primary/10 hover:text-primary hover:scale-105'}`} title="Undo (Ctrl+Z)"><Undo2 size={18} /></button>
         <button onClick={redo} disabled={historyIndex === history.length - 1} className={`p-2 rounded-lg text-text-secondary transition-all duration-200 ${historyIndex === history.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-primary/10 hover:text-primary hover:scale-105'}`} title="Redo (Ctrl+Shift+Z)"><Redo2 size={18} /></button>
         <div className="w-full h-px bg-border my-1"></div>
         <button onClick={createSticky} className="p-2 rounded-lg text-text-secondary hover:bg-primary/10 hover:text-primary hover:scale-105 transition-all duration-200" title="Add Sticky Note"><StickyNote size={18} /></button>
         <button onClick={createTextLayer} className="p-2 rounded-lg text-text-secondary hover:bg-primary/10 hover:text-primary hover:scale-105 transition-all duration-200" title="Add Text Layer"><TypeIcon size={18} /></button>
         <button onClick={createGroup} className="p-2 rounded-lg text-text-secondary hover:bg-primary/10 hover:text-primary hover:scale-105 transition-all duration-200" title="Add Group Frame"><BoxSelect size={18} /></button>
         <button onClick={createDrawingLayer} className="p-2 rounded-lg text-text-secondary hover:bg-primary/10 hover:text-primary hover:scale-105 transition-all duration-200" title="Add Drawing Layer"><Pencil size={18} /></button>
         <div className="w-full h-px bg-border my-1"></div>
         <button onClick={handleChangeApiKey} className="p-2 rounded-lg text-text-secondary hover:bg-primary/10 hover:text-primary hover:scale-105 transition-all duration-200" title="Change API Key"><Key size={18} /></button>
         <button onClick={handleClearCanvas} className="p-2 rounded-lg text-red-400/80 hover:bg-red-500/20 hover:text-red-400 hover:scale-105 transition-all duration-200" title="Clear Canvas"><Trash2 size={18} /></button>
      </div>

      {/* Zoom controls - Warm Ember */}
      <div className="absolute bottom-52 right-4 z-50 pointer-events-auto bg-elevated/70 backdrop-blur-xl border border-border/50 rounded-xl shadow-xl shadow-black/30 flex flex-col p-1.5 gap-1">
            <button onClick={zoomIn} className="p-2 rounded-lg text-text-secondary hover:bg-primary/10 hover:text-primary transition-all duration-200" title="Zoom In"><ZoomIn size={18} /></button>
            <div className="text-[10px] text-center font-mono text-text-secondary py-1.5 border-y border-border/50">{Math.round(scale * 100)}%</div>
            <button onClick={zoomOut} className="p-2 rounded-lg text-text-secondary hover:bg-primary/10 hover:text-primary transition-all duration-200" title="Zoom Out"><ZoomOut size={18} /></button>
      </div>

      <Minimap
        layers={layers}
        selectedLayerId={selectedLayerId}
        canvasOffset={canvasOffset}
        scale={scale}
        onViewportChange={setCanvasOffset}
      />

      <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} layers={layers} selectedLayerId={selectedLayerId} onSelectLayer={setSelectedLayerId} onRenameLayer={renameLayer} onLayerDoubleClick={handleLayerFocus} onDeleteLayer={deleteLayer} onExportLayer={exportLayer} onDuplicateLayer={duplicateLayer} />

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onSubmit={handleApiKeySubmit}
        onClose={() => { setShowApiKeyModal(false); setIsChangingApiKey(false); }}
        isChangingKey={isChangingApiKey}
      />
    </div>
  );
};

export default App;
