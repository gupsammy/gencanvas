
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { LayerData, ModelId, Attachment, MediaType, VideoMode, Annotation } from './types';
import { generateImageContent, generateVideoContent, generateSpeechContent, generateLayerTitle } from './services/geminiService';
import PromptBar from './components/PromptBar';
import CanvasLayer from './components/CanvasLayer';
import Sidebar from './components/Sidebar';
import { Image as ImageIcon, ZoomIn, ZoomOut, MousePointer2, Undo2, Redo2, StickyNote, BoxSelect, Pencil, Type as TypeIcon, Trash2 } from 'lucide-react';
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(0.6); // Zoomed out more for the larger template
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [globalAttachments, setGlobalAttachments] = useState<Attachment[]>([]);
  
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectionTarget, setSelectionTarget] = useState<'global' | 'layer' | null>(null);
  const [injectedAttachment, setInjectedAttachment] = useState<Attachment | null>(null);
  const [snapLines, setSnapLines] = useState<{ vertical?: number, horizontal?: number } | null>(null);
  
  const fileDropRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => { setInjectedAttachment(null); }, [selectedLayerId]);

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

  const startCanvasSelection = (target: 'global' | 'layer') => { setIsSelectionMode(true); setSelectionTarget(target); };
  const handleLayerSelectForAttachment = (layer: LayerData) => {
      if (!isSelectionMode) return;
      if (layer.type === 'video') alert("Selecting video layers as reference is not fully supported for all models yet.");
      const attachment: Attachment = { id: crypto.randomUUID(), file: new File([], `${layer.title || 'reference'}.png`, { type: 'image/png' }), previewUrl: layer.src, mimeType: 'image/png', base64: layer.src };
      if (selectionTarget === 'global') setGlobalAttachments(prev => [...prev, attachment]); else if (selectionTarget === 'layer') setInjectedAttachment(attachment);
      setIsSelectionMode(false); setSelectionTarget(null);
  };

  const handleClearCanvas = () => {
      // Simplification: removed confirm dialog to prevent blocking and improve UX
      setLayers([]);
      setSelectedLayerId(null);
      setCanvasOffset({ x: 0, y: 0 });
      setScale(1);
      addToHistory([]);
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
    setIsGenerating(true);
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
    for (let i = 0; i < requestCount; i++) {
        const row = Math.floor(i / cols); const col = i % cols;
        placeholders.push({
            id: crypto.randomUUID(), type: mediaType, x: startX + col * (width + gap), y: startY + row * (height + gap), width, height, src: '', promptUsed: prompt, referenceImages: allBase64s, title: "Generating...", createdAt: Date.now(), isLoading: true,
            generationMetadata: { model, aspectRatio: finalAspectRatio, creativity, imageSize, resolution, duration, videoMode, voice }
        });
    }
    setLayers(prev => [...prev, ...placeholders]);
    
    // Generate all images in parallel (up to 4 concurrent requests)
    await Promise.all(placeholders.map(async (placeholder) => {
        try {
            let result; let title = prompt.substring(0, 30);
            if (mediaType === 'video') {
                 let startImage = undefined; let endImage = undefined; let refs: string[] = [];
                 if (videoMode === 'standard' && allBase64s.length > 0) startImage = allBase64s[0];
                 else if (videoMode === 'interpolation') { if (allBase64s.length > 0) startImage = allBase64s[0]; if (allBase64s.length > 1) endImage = allBase64s[1]; }
                 else if (videoMode === 'references') { refs = allBase64s; startImage = undefined; }
                 const [videoRes, genTitle] = await Promise.all([ generateVideoContent({ prompt, model, mediaType, videoMode, startImage, endImage, referenceImages: refs, aspectRatio: finalAspectRatio, resolution, durationSeconds: duration }), generateLayerTitle(prompt) ]);
                 result = videoRes; title = genTitle;
            } else if (mediaType === 'audio') {
                 const [audioRes, genTitle] = await Promise.all([ generateSpeechContent({ prompt, model, mediaType, voice }), generateLayerTitle(prompt) ]);
                 result = audioRes; title = genTitle;
            } else {
                const [imageRes, genTitle] = await Promise.all([ generateImageContent({ prompt, model, mediaType, referenceImages: allBase64s, aspectRatio: finalAspectRatio, creativity, imageSize }), generateLayerTitle(prompt) ]);
                result = imageRes; title = genTitle;
            }
            setLayers(prev => prev.map(l => l.id !== placeholder.id ? l : { ...l, src: result.url, title: title, videoMetadata: result.metadata, generationMetadata: result.generationConfig, isLoading: false, duration: mediaType === 'video' ? parseInt(duration) : undefined }));
        } catch (error: any) {
            setLayers(prev => prev.map(l => l.id !== placeholder.id ? l : { ...l, isLoading: false, error: error.message || "Generation failed" }));
        }
    }));
    setLayers(current => { addToHistory(current); return current; }); setIsGenerating(false); setIsSidebarOpen(true);
  };

  const handleLayerGenerate = async (originalLayerId: string, prompt: string, attachments: Attachment[], model: ModelId, aspectRatio: string, creativity: number, imageSize: string, resolution: '720p' | '1080p', mediaType: MediaType, duration: string, videoMode: VideoMode, startImageIndex?: number, count: number = 1, voice?: string) => {
    setIsGenerating(true);
    const original = layers.find(l => l.id === originalLayerId);
    if (!original) { setIsGenerating(false); return; }
    const requestCount = mediaType === 'video' || mediaType === 'audio' ? 1 : count;
    let finalAspectRatio = aspectRatio === 'Auto' ? (mediaType === 'video' ? '16:9' : resolveAspectRatio(aspectRatio, original)) : aspectRatio;
    
    let width = 400, height = 400;
    if (mediaType === 'audio') { width = 300; height = 120; }
    else { const dim = getDimensionsFromAspectRatio(finalAspectRatio); width = dim.width; height = dim.height; }

    // If generating from a placeholder template, use its exact position
    const isPlaceholder = original.src === PLACEHOLDER_SRC;
    const pos = isPlaceholder ? { x: original.x, y: original.y } : findSmartPosition(original, width, height, layers);

    const gap = 20; const cols = Math.ceil(Math.sqrt(requestCount));
    
    const placeholders: LayerData[] = [];
    for (let i = 0; i < requestCount; i++) {
        const row = Math.floor(i / cols); const col = i % cols;
        placeholders.push({ id: crypto.randomUUID(), type: mediaType, x: pos.x + col * (width + gap), y: pos.y + row * (height + gap), width, height, src: '', promptUsed: prompt, referenceImages: attachments.map(a => a.base64), title: "Remixing...", createdAt: Date.now(), isLoading: true, generationMetadata: { model, aspectRatio: finalAspectRatio, creativity, imageSize, resolution, duration, videoMode, voice } });
    }
    
    // If we are replacing a placeholder, remove it from the list before adding new ones
    if (isPlaceholder) {
        setLayers(prev => [...prev.filter(l => l.id !== originalLayerId), ...placeholders]);
    } else {
        setLayers(prev => [...prev, ...placeholders]);
    }

    // Generate all images in parallel (up to 4 concurrent requests)
    await Promise.all(placeholders.map(async (placeholder, idx) => {
        try {
            const allBase64s = attachments.map(a => a.base64); let result; let title = "Remix";
            if (mediaType === 'video') {
                 let startImage = undefined; let endImage = undefined; let refs: string[] = [];
                 if (videoMode === 'standard' && allBase64s.length > 0) startImage = allBase64s[0];
                 else if (videoMode === 'interpolation') { if (allBase64s.length > 0) startImage = allBase64s[0]; if (allBase64s.length > 1) endImage = allBase64s[1]; }
                 else if (videoMode === 'references') { refs = allBase64s; startImage = undefined; }
                 const [videoRes, genTitle] = await Promise.all([ generateVideoContent({ prompt, model, mediaType, videoMode, startImage, endImage, referenceImages: refs, aspectRatio: finalAspectRatio, resolution, durationSeconds: duration }), generateLayerTitle(prompt) ]);
                 result = videoRes; title = genTitle;
            } else if (mediaType === 'audio') {
                 const [audioRes, genTitle] = await Promise.all([ generateSpeechContent({ prompt, model, mediaType, voice }), generateLayerTitle(prompt) ]);
                 result = audioRes; title = genTitle;
            } else {
                const [imageRes, genTitle] = await Promise.all([ generateImageContent({ prompt, model, mediaType, referenceImages: allBase64s, aspectRatio: finalAspectRatio, creativity, imageSize }), generateLayerTitle(prompt) ]);
                result = imageRes; title = genTitle;
            }
            setLayers(prev => prev.map(l => l.id !== placeholder.id ? l : { ...l, src: result.url, title: title, videoMetadata: result.metadata, generationMetadata: result.generationConfig, isLoading: false, duration: mediaType === 'video' ? parseInt(duration) : undefined }));
            if (requestCount === 1 && idx === 0) setSelectedLayerId(placeholder.id);
        } catch (error: any) { setLayers(prev => prev.map(l => l.id !== placeholder.id ? l : { ...l, isLoading: false, error: error.message || "Generation failed" })); }
    }));
    setLayers(current => { addToHistory(current); return current; }); setIsGenerating(false); setIsSidebarOpen(true);
  };

  const handleExtendVideo = async (layerId: string, prompt: string) => {
      setIsGenerating(true); const original = layers.find(l => l.id === layerId); if (!original) { setIsGenerating(false); return; }
      let inputVideoMetadata = original.videoMetadata;
      if (!inputVideoMetadata && original.src) {
            const src = original.src; const parts = src.split(','); const base64Data = parts[1] || src; let mimeType = 'video/mp4'; const match = src.match(/data:([^;]+);base64,/); if (match) mimeType = match[1];
            inputVideoMetadata = { videoBytes: base64Data, mimeType: mimeType };
      }
      if (!inputVideoMetadata) { alert("Cannot extend this layer."); setIsGenerating(false); return; }
      const pos = findSmartPosition(original, original.width, original.height, layers);
      const placeholder: LayerData = { id: crypto.randomUUID(), type: 'video', x: pos.x, y: pos.y, width: original.width, height: original.height, src: '', promptUsed: prompt, referenceImages: [], title: "Extending...", createdAt: Date.now(), isLoading: true };
      setLayers(prev => [...prev, placeholder]);
      try {
            const [videoResult, title] = await Promise.all([ generateVideoContent({ prompt: prompt, model: ModelId.VEO_3_1_HIGH, mediaType: 'video', inputVideoMetadata: inputVideoMetadata, resolution: '720p', aspectRatio: '16:9' }), generateLayerTitle(prompt) ]);
            setLayers(prev => prev.map(l => l.id !== placeholder.id ? l : { ...l, src: videoResult.url, title: title + " (Ext)", videoMetadata: videoResult.metadata, generationMetadata: videoResult.generationConfig, isLoading: false, duration: 8 }));
            setSelectedLayerId(placeholder.id);
      } catch (error: any) { setLayers(prev => prev.map(l => l.id !== placeholder.id ? l : { ...l, isLoading: false, error: error.message || "Extension failed" })); } 
      finally { setLayers(current => { addToHistory(current); return current; }); setIsGenerating(false); setIsSidebarOpen(true); }
  };

  const handleRemoveBackground = async (layerId: string) => {
      const layer = layers.find(l => l.id === layerId); if (!layer || layer.type === 'video') return;
      const attachment: Attachment = { id: crypto.randomUUID(), file: new File([], "layer.png"), previewUrl: layer.src, mimeType: 'image/png', base64: layer.src };
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
  const renameLayer = useCallback((id: string, newTitle: string) => { setLayers(prev => { const next = prev.map(l => l.id === id ? { ...l, title: newTitle } : l); addToHistory(next); return next; }); }, [addToHistory]);
  const flipLayer = useCallback((id: string, axis: 'x' | 'y') => { setLayers(prev => { const next = prev.map(l => l.id !== id ? l : { ...l, flipX: axis === 'x' ? !l.flipX : l.flipX, flipY: axis === 'y' ? !l.flipY : l.flipY }); addToHistory(next); return next; }); }, [addToHistory]);
  const handleAddAsReference = useCallback((layerId: string) => { const layer = layers.find(l => l.id === layerId); if (!layer || layer.type === 'video') return; const newAttachment: Attachment = { id: crypto.randomUUID(), file: new File([], `${layer.title || 'reference'}.png`, { type: 'image/png' }), previewUrl: layer.src, mimeType: 'image/png', base64: layer.src }; setGlobalAttachments(prev => [...prev, newAttachment]); setSelectedLayerId(null); setTimeout(() => promptInputRef.current?.focus(), 50); }, [layers]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]; const isImage = file.type.startsWith('image/'); const isVideo = file.type.startsWith('video/');
      const dropX = (e.clientX - canvasOffset.x) / scale; const dropY = (e.clientY - canvasOffset.y) / scale;
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target?.result as string; const img = new Image();
            img.onload = () => { let w = img.naturalWidth; let h = img.naturalHeight; const MAX = 400; if (w > MAX || h > MAX) { if (w > h) { h = (h / w) * MAX; w = MAX; } else { w = (w / h) * MAX; h = MAX; } }
                const newLayer: LayerData = { id: crypto.randomUUID(), type: 'image', x: dropX - (w/2), y: dropY - (h/2), width: w, height: h, src: base64, title: file.name.replace(/\.[^/.]+$/, ""), createdAt: Date.now(), promptUsed: "Uploaded Image" };
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
  const handleCanvasMouseDown = (e: React.MouseEvent) => { if (e.button === 1 || (e.button === 0 && e.shiftKey)) { e.preventDefault(); setIsPanning(true); panStartRef.current = { x: e.clientX, y: e.clientY }; } else { handleBackgroundClick(e); } };
  const handleCanvasMouseMove = (e: React.MouseEvent) => { if (isPanning) { const dx = e.clientX - panStartRef.current.x; const dy = e.clientY - panStartRef.current.y; setCanvasOffset(prev => ({ x: prev.x + dx, y: prev.y + dy })); panStartRef.current = { x: e.clientX, y: e.clientY }; } };
  const handleCanvasMouseUp = () => { setIsPanning(false); };
  const handleWheel = (e: React.WheelEvent) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); const newScale = Math.min(Math.max(scale + (-e.deltaY * 0.001), 0.1), 5); setScale(newScale); } else { e.preventDefault(); setCanvasOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY })); } };
  const zoomIn = () => setScale(s => Math.min(s + 0.1, 5)); const zoomOut = () => setScale(s => Math.max(s - 0.1, 0.1));

  return (
    <div className={`w-screen h-screen bg-background relative overflow-hidden flex flex-col ${isSelectionMode ? 'cursor-crosshair' : ''}`}>
      {isSelectionMode && <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[60] bg-primary text-white px-6 py-2 rounded-full shadow-lg font-bold animate-pulse pointer-events-none">Click a layer to select it as reference</div>}

      <div className={`flex-1 relative overflow-hidden ${isPanning ? 'cursor-grabbing' : ''}`} onDrop={handleDrop} onDragOver={handleDragOver} onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp} onWheel={handleWheel} ref={fileDropRef}>
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#3f3f46 1px, transparent 1px)', backgroundSize: `${20 * scale}px ${20 * scale}px`, backgroundPosition: `${canvasOffset.x}px ${canvasOffset.y}px` }} />
        {layers.length === 0 && !isGenerating && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center space-y-4 opacity-40">
                    <div className="bg-surface p-6 rounded-3xl border border-border inline-block"><ImageIcon size={48} className="mx-auto mb-4 text-gray-500" /><h2 className="text-2xl font-bold text-gray-200">Infinite Canvas</h2><p className="text-gray-400 max-w-sm mt-2">Drag & Drop images or videos here<br/>or use the prompt bar below to generate.</p></div>
                </div>
             </div>
        )}
        <div style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${scale})`, transformOrigin: '0 0', width: '100%', height: '100%', pointerEvents: 'none' }} className="absolute top-0 left-0">
            {layers.map(layer => (
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
                    isGenerating={isGenerating}
                    onSelectOnCanvasStart={() => startCanvasSelection('layer')}
                    injectedAttachment={selectedLayerId === layer.id ? injectedAttachment : null}
                />
            </div>
            ))}
            
            {/* Snap Lines */}
            {snapLines?.vertical !== undefined && (
                <div className="absolute top-[-10000px] bottom-[-10000px] w-px border-l border-dashed border-blue-500 z-[100]" style={{ left: snapLines.vertical }}></div>
            )}
            {snapLines?.horizontal !== undefined && (
                <div className="absolute left-[-10000px] right-[-10000px] h-px border-t border-dashed border-blue-500 z-[100]" style={{ top: snapLines.horizontal }}></div>
            )}
        </div>
      </div>

      {selectedLayerId === null && (
          <div className="absolute bottom-8 left-0 right-0 px-4 z-50 pointer-events-none transition-all duration-300" style={{ marginRight: isSidebarOpen ? 320 : 0 }}>
             <div className="pointer-events-auto"><PromptBar onSubmit={handleGlobalGenerate} isGenerating={isGenerating} variant="global" attachments={globalAttachments} onAttachmentsChange={setGlobalAttachments} onSelectOnCanvasStart={() => startCanvasSelection('global')} inputRef={promptInputRef} /></div>
          </div>
      )}
      
      <div className="absolute top-4 left-4 z-50 pointer-events-none flex flex-col gap-4">
         <div className="bg-surface/50 backdrop-blur border border-border/50 px-3 py-1.5 rounded-full text-xs text-gray-400 font-medium flex items-center gap-4 shadow-lg pointer-events-auto">
             <span>Gemini Canvas</span><span className="w-px h-3 bg-white/10"></span><span className="flex items-center gap-1"><MousePointer2 size={12}/> Select</span><span className="flex items-center gap-1"><span className="border border-gray-500 rounded px-1 text-[10px]">Shift</span> + Drag to Pan</span>
         </div>
         
         {/* Tools Toolbar */}
         <div className="bg-surface/80 backdrop-blur border border-border rounded-lg shadow-xl p-1.5 flex flex-col gap-1 pointer-events-auto w-10">
            <button onClick={createSticky} className="p-1.5 hover:bg-white/10 rounded-md text-gray-300 hover:text-white transition-colors" title="Add Sticky Note"><StickyNote size={20} /></button>
            <button onClick={createTextLayer} className="p-1.5 hover:bg-white/10 rounded-md text-gray-300 hover:text-white transition-colors" title="Add Text Layer"><TypeIcon size={20} /></button>
            <button onClick={createGroup} className="p-1.5 hover:bg-white/10 rounded-md text-gray-300 hover:text-white transition-colors" title="Add Group Frame"><BoxSelect size={20} /></button>
            <button onClick={createDrawingLayer} className="p-1.5 hover:bg-white/10 rounded-md text-gray-300 hover:text-white transition-colors" title="Add Drawing Layer"><Pencil size={20} /></button>
            <div className="w-full h-px bg-white/10 my-0.5"></div>
            <button onClick={handleClearCanvas} className="p-1.5 hover:bg-red-500/20 rounded-md text-red-400 hover:text-red-300 transition-colors" title="Clear Canvas"><Trash2 size={20} /></button>
         </div>
      </div>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto flex gap-1">
          <button onClick={undo} disabled={historyIndex === 0} className={`p-2 rounded-full bg-surface/80 backdrop-blur border border-border text-gray-400 hover:text-white transition-colors ${historyIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} title="Undo (Ctrl+Z)"><Undo2 size={16} /></button>
          <button onClick={redo} disabled={historyIndex === history.length - 1} className={`p-2 rounded-full bg-surface/80 backdrop-blur border border-border text-gray-400 hover:text-white transition-colors ${historyIndex === history.length - 1 ? 'opacity-50 cursor-not-allowed' : ''}`} title="Redo (Ctrl+Shift+Z)"><Redo2 size={16} /></button>
      </div>

      <div className="absolute bottom-4 left-4 z-50 pointer-events-auto bg-surface/80 backdrop-blur border border-border rounded-lg shadow-lg flex flex-col p-1 gap-1">
            <button onClick={zoomIn} className="p-2 hover:bg-white/10 rounded-md text-gray-300 transition-colors" title="Zoom In"><ZoomIn size={18} /></button>
            <div className="text-[10px] text-center font-mono text-gray-500 py-1 border-y border-white/5">{Math.round(scale * 100)}%</div>
            <button onClick={zoomOut} className="p-2 hover:bg-white/10 rounded-md text-gray-300 transition-colors" title="Zoom Out"><ZoomOut size={18} /></button>
      </div>

      <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} layers={layers} selectedLayerId={selectedLayerId} onSelectLayer={setSelectedLayerId} onRenameLayer={renameLayer} onLayerDoubleClick={handleLayerFocus} />
    </div>
  );
};

export default App;
