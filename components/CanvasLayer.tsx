
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { LayerData, Attachment, ModelId, MediaType, VideoMode, Annotation, PromptState, GenerationTask } from '../types';
import { DEFAULT_MODEL, STICKY_COLORS, GROUP_COLORS } from '../constants';
import { getAssetBase64 } from '../services/assetStore';
import PromptBar from './PromptBar';
import {
    Move, Trash2, MoreHorizontal, Copy, FlipHorizontal,
    FlipVertical, Download, ChevronRight, X,
    Edit3, PlusCircle, Eraser, Play, Volume2, VolumeX, Loader2, AlertCircle,
    Pencil, Type as TypeIcon, Palette, RotateCcw, BoxSelect, StickyNote,
    BringToFront, SendToBack, ArrowUp, ArrowDown, Mic, Pause, Minus, Plus,
    Maximize, Square
} from 'lucide-react';

interface CanvasLayerProps {
  layer: LayerData;
  isSelected: boolean;
  scale: number;
  onSelect: (id: string) => void;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onUpdateTransform: (id: string, x: number, y: number, width: number, height: number) => void;
  onUpdateAnnotations: (id: string, annotations: Annotation[]) => void;
  onUpdateText: (id: string, text: string) => void;
  onUpdateColor: (id: string, color: string) => void;
  onUpdateFontSize?: (id: string, delta: number) => void;
  onDragEnd: (id: string) => void;
  onGenerate: (
    layerId: string,
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
    startImageIndex?: number,
    count?: number,
    voice?: string
  ) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onFlip: (id: string, axis: 'x' | 'y') => void;
  onAddReference: (id: string) => void;
  onRemoveBackground: (id: string) => void;
  onExtendVideo?: (id: string, prompt: string) => void;
  onReorder: (id: string, action: 'front' | 'back' | 'forward' | 'backward') => void;
  isGenerating: boolean;
  generationTask?: GenerationTask;
  onCancelGeneration?: (id: string) => void;
  onSelectOnCanvasStart?: () => void;
  injectedAttachment?: Attachment | null;
  onInjectedAttachmentConsumed?: () => void;
  isSelectionMode?: boolean;
}

const DRAWING_COLORS = ['#FFFFFF', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#000000'];
const STROKE_WIDTHS = [1, 2, 3, 4, 6, 8, 12, 16];
const FONT_SIZES = [12, 16, 20, 24, 32, 48, 64];

// Helper to determine text color based on background
const getContrastColor = (hexColor: string) => {
    if (!hexColor) return '#000000';
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
};

// Helper to add alpha to hex color
const hexToRgba = (hex: string, alpha: number) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})` : hex;
};

const CanvasLayer: React.FC<CanvasLayerProps> = ({
  layer,
  isSelected,
  scale,
  onSelect,
  onUpdatePosition,
  onUpdateTransform,
  onUpdateAnnotations,
  onUpdateText,
  onUpdateColor,
  onUpdateFontSize,
  onDragEnd,
  onGenerate,
  onDelete,
  onDuplicate,
  onRename,
  onFlip,
  onAddReference,
  onRemoveBackground,
  onExtendVideo,
  onReorder,
  isGenerating,
  generationTask,
  onCancelGeneration,
  onSelectOnCanvasStart,
  injectedAttachment,
  onInjectedAttachmentConsumed,
  isSelectionMode = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showArrangeMenu, setShowArrangeMenu] = useState(false);
  
  const [isResizingMode, setIsResizingMode] = useState(false);
  const [resizeBounds, setResizeBounds] = useState({ x: 0, y: 0, width: layer.width, height: layer.height });
  
  const [isExtendingMode, setIsExtendingMode] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Annotation State
  const [tool, setTool] = useState<'cursor' | 'pencil' | 'text' | 'rectangle'>('cursor');
  const [color, setColor] = useState('#EF4444');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [annotationFontSize, setAnnotationFontSize] = useState(16);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const [showFontSizePicker, setShowFontSizePicker] = useState(false);
  const [drawingPath, setDrawingPath] = useState<{x: number, y: number}[]>([]);
  const [drawingRect, setDrawingRect] = useState<{startX: number, startY: number, endX?: number, endY?: number} | null>(null);
  
  // Annotation Selection
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [isDraggingAnnotation, setIsDraggingAnnotation] = useState(false);
  const [isResizingAnnotation, setIsResizingAnnotation] = useState(false);
  const [isDraggingVertex, setIsDraggingVertex] = useState(false);
  const [draggingVertexIndex, setDraggingVertexIndex] = useState<number | null>(null);
  const annotationDragStartRef = useRef<{x: number, y: number, initialX: number, initialY: number, initialSize?: number, initialVertices?: {x: number, y: number}[]}>({ x: 0, y: 0, initialX: 0, initialY: 0 });

  // Text Tool State
  const [textInput, setTextInput] = useState<{x: number, y: number, value: string} | null>(null);
  
  // Sticky/Text Main Text Editing
  const [isEditingSticky, setIsEditingSticky] = useState(false);
  const stickyInputRef = useRef<HTMLTextAreaElement>(null);

  // Floating Bar State
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const [promptAttachments, setPromptAttachments] = useState<Attachment[]>([]);
  // Initialize from lastDraftState (retained from previous generation), or generationMetadata, or defaults
  const [draftState, setDraftState] = useState<Partial<PromptState>>(() => ({
      prompt: layer.lastDraftState?.prompt || '',
      model: (layer.lastDraftState?.model as ModelId) || (layer.generationMetadata?.model as ModelId) || DEFAULT_MODEL,
      aspectRatio: layer.lastDraftState?.aspectRatio || layer.generationMetadata?.aspectRatio || 'Auto',
      creativity: layer.lastDraftState?.creativity ?? layer.generationMetadata?.creativity ?? 65,
      imageSize: layer.lastDraftState?.imageSize || layer.generationMetadata?.imageSize || '2K',
      videoResolution: layer.lastDraftState?.videoResolution || (layer.generationMetadata?.resolution as any) || '720p',
      videoDuration: layer.lastDraftState?.videoDuration || layer.generationMetadata?.duration || '6',
      videoMode: layer.lastDraftState?.videoMode || layer.generationMetadata?.videoMode || 'standard',
      voice: layer.lastDraftState?.voice || layer.generationMetadata?.voice || 'Kore'
  }));

  // Resolved base64 for API calls (fetched from asset store if available)
  const [resolvedBase64, setResolvedBase64] = useState<string>(layer.src);

  // Fetch actual base64 from asset store when layer has imageId
  useEffect(() => {
      if (layer.imageId) {
          getAssetBase64(layer.imageId).then(base64 => {
              if (base64) setResolvedBase64(base64);
          });
      } else {
          setResolvedBase64(layer.src);
      }
  }, [layer.imageId, layer.src]);

  // Memoized callback to prevent infinite loops
  const handleDraftStateChange = useCallback((updates: Partial<PromptState>) => {
      setDraftState(prev => ({ ...prev, ...updates }));
  }, []);

  // Resize Layer State
  const [isResizingLayer, setIsResizingLayer] = useState(false);
  const [isResizingCrop, setIsResizingCrop] = useState(false);

  const resizeStartRef = useRef<{ 
      corner: string, 
      startX: number, startY: number, 
      startWidth: number, startHeight: number, 
      mouseX: number, mouseY: number 
  } | null>(null);

  const dragStartRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  const initialLayerPosRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  
  const layerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // LOD (Level of Detail) state for performance
  const [fullResLoaded, setFullResLoaded] = useState(!layer.thumbnail); // If no thumbnail, full-res is the default
  const FULL_RES_THRESHOLD = 400; // Show full-res when rendered width >= 400px
  const renderedWidth = layer.width * scale;
  const shouldShowFullRes = renderedWidth >= FULL_RES_THRESHOLD;

  // Auto-focus pencil for drawing layers
  useEffect(() => {
      if (layer.type === 'drawing' && isSelected && tool === 'cursor') {
          setTool('pencil');
      }
      if (layer.type === 'text' && isSelected && !layer.text) {
          setIsEditingSticky(true);
      }
  }, [layer.type, isSelected, layer.text]);

  // Sync color state with layer color on selection
  useEffect(() => {
    if (layer.color) {
        setColor(layer.color);
    }
  }, [layer.color]);

  // Reset modes when deselected
  useEffect(() => {
      if (!isSelected) {
          setIsResizingMode(false);
          setIsExtendingMode(false);
          setTool('cursor');
          setTextInput(null);
          setSelectedAnnotationId(null);
          setIsEditingSticky(false);
          setShowColorPicker(false);
          setShowMenu(false);
      }
  }, [isSelected]);

  // Close pickers when tool changes
  useEffect(() => {
      setShowStrokePicker(false);
      setShowFontSizePicker(false);
      setShowColorPicker(false);
  }, [tool]);

  // Handle Injected Attachments (from canvas selection mode)
  useEffect(() => {
      if (injectedAttachment) {
          setPromptAttachments(prev => [...prev, injectedAttachment]);
          // Signal that the attachment has been consumed
          onInjectedAttachmentConsumed?.();
          // Focus the prompt input after a brief delay to ensure UI is ready
          requestAnimationFrame(() => {
              promptInputRef.current?.focus();
          });
      }
  }, [injectedAttachment, onInjectedAttachmentConsumed]);


  useEffect(() => {
      if (textInput && textInputRef.current) {
          textInputRef.current.focus();
      }
  }, [textInput]);
  
  useEffect(() => {
      if (isEditingSticky && stickyInputRef.current) {
          stickyInputRef.current.focus();
          stickyInputRef.current.select();
      }
  }, [isEditingSticky]);

  // Render Pencil Paths
  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = layer.width;
      canvas.height = layer.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (layer.annotations) {
          layer.annotations.forEach(ann => {
              if (ann.type === 'path') {
                  if (ann.points.length < 2) return;
                  ctx.beginPath();
                  ctx.strokeStyle = ann.color;
                  ctx.lineWidth = ann.width;
                  ctx.moveTo(ann.points[0].x, ann.points[0].y);
                  for (let i = 1; i < ann.points.length; i++) {
                      ctx.lineTo(ann.points[i].x, ann.points[i].y);
                  }
                  ctx.stroke();
              } else if (ann.type === 'rectangle') {
                  if (ann.vertices.length !== 4) return;
                  ctx.beginPath();
                  ctx.strokeStyle = ann.color;
                  ctx.lineWidth = ann.strokeWidth;
                  ctx.moveTo(ann.vertices[0].x, ann.vertices[0].y);
                  for (let i = 1; i < ann.vertices.length; i++) {
                      ctx.lineTo(ann.vertices[i].x, ann.vertices[i].y);
                  }
                  ctx.closePath();
                  ctx.stroke();
              }
          });
      }

      if (drawingPath.length > 1) {
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = strokeWidth;
          ctx.moveTo(drawingPath[0].x, drawingPath[0].y);
          for (let i = 1; i < drawingPath.length; i++) {
              ctx.lineTo(drawingPath[i].x, drawingPath[i].y);
          }
          ctx.stroke();
      }

      // Draw rectangle preview while drawing
      if (drawingRect && drawingRect.endX !== undefined && drawingRect.endY !== undefined) {
          const minX = Math.min(drawingRect.startX, drawingRect.endX);
          const minY = Math.min(drawingRect.startY, drawingRect.endY);
          const width = Math.abs(drawingRect.endX - drawingRect.startX);
          const height = Math.abs(drawingRect.endY - drawingRect.startY);

          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = strokeWidth;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(minX, minY, width, height);
          ctx.setLineDash([]);
      }

  }, [layer.width, layer.height, layer.annotations, drawingPath, color, strokeWidth, drawingRect]);

  // ... [Keep Annotation manipulation functions similar to before, summarized below]
  const handleAnnotationMouseDown = (e: React.MouseEvent, annId: string) => {
      if (tool !== 'cursor') return;
      e.stopPropagation(); e.preventDefault();
      setSelectedAnnotationId(annId); setIsDraggingAnnotation(true);
      const ann = layer.annotations?.find(a => a.id === annId);
      if (ann && ann.type === 'text') {
        annotationDragStartRef.current = { x: e.clientX, y: e.clientY, initialX: ann.x, initialY: ann.y };
      } else if (ann && ann.type === 'rectangle') {
        // For rectangles, we just select them, dragging is handled by vertex handles
        setIsDraggingAnnotation(false);
      }
  };
  const handleAnnotationResizeMouseDown = (e: React.MouseEvent, annId: string) => {
      e.stopPropagation(); e.preventDefault(); setIsResizingAnnotation(true);
      const ann = layer.annotations?.find(a => a.id === annId);
      if (ann && ann.type === 'text') {
        annotationDragStartRef.current = { x: e.clientX, y: e.clientY, initialX: ann.x, initialY: ann.y, initialSize: ann.fontSize };
      }
  };
  const handleDeleteAnnotation = (annId: string) => {
      onUpdateAnnotations(layer.id, (layer.annotations || []).filter(a => a.id !== annId));
      setSelectedAnnotationId(null);
  };
  const handleUpdateAnnotationColor = (annId: string, newColor: string) => {
      onUpdateAnnotations(layer.id, (layer.annotations || []).map(a => a.id === annId ? { ...a, color: newColor } : a));
      onDragEnd(layer.id);
  };
  const handleUpdateAnnotationSize = (annId: string, newSize: number) => {
      onUpdateAnnotations(layer.id, (layer.annotations || []).map(a => {
          if (a.id === annId) {
              if (a.type === 'text') return { ...a, fontSize: newSize };
              if (a.type === 'rectangle') return { ...a, strokeWidth: newSize };
              if (a.type === 'path') return { ...a, width: newSize };
          }
          return a;
      }));
      onDragEnd(layer.id);
  };
  const handleVertexMouseDown = (e: React.MouseEvent, annId: string, vertexIndex: number) => {
      e.stopPropagation(); e.preventDefault();
      setIsDraggingVertex(true);
      setDraggingVertexIndex(vertexIndex);
      setSelectedAnnotationId(annId);
      const ann = layer.annotations?.find(a => a.id === annId);
      if (ann && ann.type === 'rectangle') {
          annotationDragStartRef.current = {
              x: e.clientX,
              y: e.clientY,
              initialX: 0,
              initialY: 0,
              initialVertices: [...ann.vertices]
          };
      }
  };
  useEffect(() => {
      const handleGlobalMouseMove = (e: MouseEvent) => {
          if (!isDraggingAnnotation && !isResizingAnnotation && !isDraggingVertex) return;
          if (!selectedAnnotationId) return;
          const deltaX = (e.clientX - annotationDragStartRef.current.x) / scale;
          const deltaY = (e.clientY - annotationDragStartRef.current.y) / scale;
          if (isDraggingAnnotation) {
              onUpdateAnnotations(layer.id, (layer.annotations || []).map(a => a.id === selectedAnnotationId && a.type === 'text' ? { ...a, x: annotationDragStartRef.current.initialX + deltaX, y: annotationDragStartRef.current.initialY + deltaY } : a));
          } else if (isResizingAnnotation) {
              const newSize = Math.max(10, (annotationDragStartRef.current.initialSize || 24) + ((deltaX + deltaY) * 0.5));
              onUpdateAnnotations(layer.id, (layer.annotations || []).map(a => a.id === selectedAnnotationId && a.type === 'text' ? { ...a, fontSize: newSize } : a));
          } else if (isDraggingVertex && draggingVertexIndex !== null && annotationDragStartRef.current.initialVertices) {
              onUpdateAnnotations(layer.id, (layer.annotations || []).map(a => {
                  if (a.id === selectedAnnotationId && a.type === 'rectangle') {
                      // Vertex indices: 0=TL, 1=TR, 2=BR, 3=BL
                      const newVertices = annotationDragStartRef.current.initialVertices!.map(v => ({ ...v }));
                      const draggedIdx = draggingVertexIndex;
                      const newPos = {
                          x: annotationDragStartRef.current.initialVertices![draggedIdx].x + deltaX,
                          y: annotationDragStartRef.current.initialVertices![draggedIdx].y + deltaY
                      };

                      // Update dragged vertex
                      newVertices[draggedIdx] = newPos;

                      // Update adjacent vertices to maintain rectangle shape:
                      // - Vertex sharing X with dragged gets new X
                      // - Vertex sharing Y with dragged gets new Y
                      if (draggedIdx === 0) { // TL: fix BR(2), update TR(1).y and BL(3).x
                          newVertices[1] = { ...newVertices[1], y: newPos.y };
                          newVertices[3] = { ...newVertices[3], x: newPos.x };
                      } else if (draggedIdx === 1) { // TR: fix BL(3), update TL(0).y and BR(2).x
                          newVertices[0] = { ...newVertices[0], y: newPos.y };
                          newVertices[2] = { ...newVertices[2], x: newPos.x };
                      } else if (draggedIdx === 2) { // BR: fix TL(0), update TR(1).x and BL(3).y
                          newVertices[1] = { ...newVertices[1], x: newPos.x };
                          newVertices[3] = { ...newVertices[3], y: newPos.y };
                      } else if (draggedIdx === 3) { // BL: fix TR(1), update TL(0).x and BR(2).y
                          newVertices[0] = { ...newVertices[0], x: newPos.x };
                          newVertices[2] = { ...newVertices[2], y: newPos.y };
                      }

                      return { ...a, vertices: newVertices };
                  }
                  return a;
              }));
          }
      };
      const handleGlobalMouseUp = () => {
          if (isDraggingAnnotation || isResizingAnnotation || isDraggingVertex) {
              setIsDraggingAnnotation(false); setIsResizingAnnotation(false); setIsDraggingVertex(false); setDraggingVertexIndex(null); onDragEnd(layer.id);
          }
      };
      if (isDraggingAnnotation || isResizingAnnotation || isDraggingVertex) { window.addEventListener('mousemove', handleGlobalMouseMove); window.addEventListener('mouseup', handleGlobalMouseUp); }
      return () => { window.removeEventListener('mousemove', handleGlobalMouseMove); window.removeEventListener('mouseup', handleGlobalMouseUp); };
  }, [isDraggingAnnotation, isResizingAnnotation, isDraggingVertex, draggingVertexIndex, selectedAnnotationId, scale, layer.annotations, onUpdateAnnotations, onDragEnd, layer.id]);

  // ... [Canvas Drawing Handlers]
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
      if (tool === 'pencil') {
          e.stopPropagation(); e.preventDefault();
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          setDrawingPath([{x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale}]);
      } else if (tool === 'text') {
          e.stopPropagation(); e.preventDefault();
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          if (textInput) commitText();
          setTextInput({ x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale, value: '' });
      } else if (tool === 'rectangle') {
          e.stopPropagation(); e.preventDefault();
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          setDrawingRect({ startX: (e.clientX - rect.left) / scale, startY: (e.clientY - rect.top) / scale });
      } else if (tool === 'cursor') {
          setSelectedAnnotationId(null);
      }
  };
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
      if (tool === 'pencil' && drawingPath.length > 0) {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          setDrawingPath(prev => [...prev, {x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale}]);
      } else if (tool === 'rectangle' && drawingRect && drawingRect.startX !== undefined) {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          setDrawingRect({
              ...drawingRect,
              endX: (e.clientX - rect.left) / scale,
              endY: (e.clientY - rect.top) / scale
          });
      }
  };
  const handleCanvasMouseUp = (e?: React.MouseEvent) => {
      if (tool === 'pencil' && drawingPath.length > 0) {
          const newPath: Annotation = { id: crypto.randomUUID(), type: 'path', points: drawingPath, color: color, width: strokeWidth };
          onUpdateAnnotations(layer.id, [...(layer.annotations || []), newPath]);
          onDragEnd(layer.id); setDrawingPath([]);
      }
      if (tool === 'rectangle' && drawingRect && e) {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const endX = (e.clientX - rect.left) / scale;
          const endY = (e.clientY - rect.top) / scale;
          const minX = Math.min(drawingRect.startX, endX);
          const minY = Math.min(drawingRect.startY, endY);
          const maxX = Math.max(drawingRect.startX, endX);
          const maxY = Math.max(drawingRect.startY, endY);

          // Only create rectangle if it has some size
          if (Math.abs(maxX - minX) > 5 && Math.abs(maxY - minY) > 5) {
              const vertices = [
                  { x: minX, y: minY },        // top-left
                  { x: maxX, y: minY },        // top-right
                  { x: maxX, y: maxY },        // bottom-right
                  { x: minX, y: maxY }         // bottom-left
              ];
              const newRect: Annotation = {
                  id: crypto.randomUUID(),
                  type: 'rectangle',
                  vertices,
                  color: color,
                  strokeWidth: strokeWidth
              };
              onUpdateAnnotations(layer.id, [...(layer.annotations || []), newRect]);
              onDragEnd(layer.id);
              setSelectedAnnotationId(newRect.id);
              setTool('cursor');
          }
          setDrawingRect(null);
      }
  };
  const commitText = () => {
      if (textInput && textInput.value.trim()) {
          const newText: Annotation = { id: crypto.randomUUID(), type: 'text', x: textInput.x, y: textInput.y, text: textInput.value, color: color, fontSize: annotationFontSize };
          onUpdateAnnotations(layer.id, [...(layer.annotations || []), newText]);
          onDragEnd(layer.id); setSelectedAnnotationId(newText.id); setTool('cursor');
      }
      setTextInput(null);
  };
  const clearAnnotations = () => { onUpdateAnnotations(layer.id, []); onDragEnd(layer.id); setSelectedAnnotationId(null); };

  // ... [Resize Layer Handlers]
  const handleResizeStart = (e: React.MouseEvent, corner: string) => {
      e.stopPropagation(); e.preventDefault(); setIsResizingLayer(true);
      resizeStartRef.current = { corner, startX: layer.x, startY: layer.y, startWidth: layer.width, startHeight: layer.height, mouseX: e.clientX, mouseY: e.clientY };
  };

  const handleCropResizeStart = (e: React.MouseEvent, corner: string) => {
      e.stopPropagation(); e.preventDefault(); setIsResizingCrop(true);
      resizeStartRef.current = { 
          corner: 'crop-' + corner, 
          startX: resizeBounds.x, startY: resizeBounds.y, 
          startWidth: resizeBounds.width, startHeight: resizeBounds.height, 
          mouseX: e.clientX, mouseY: e.clientY 
      };
  };

  useEffect(() => {
      const handleGlobalMouseMove = (e: MouseEvent) => {
          if ((!isResizingLayer && !isResizingCrop) || !resizeStartRef.current) return;
          const { corner, startX, startY, startWidth, startHeight, mouseX, mouseY } = resizeStartRef.current;
          const deltaX = (e.clientX - mouseX) / scale;
          const deltaY = (e.clientY - mouseY) / scale;
          
          if (isResizingCrop && corner.startsWith('crop-')) {
             let newX = startX, newY = startY, newWidth = startWidth, newHeight = startHeight;
             const c = corner.replace('crop-', '');
             
             if (c === 'se') {
                 newWidth = Math.max(50, startWidth + deltaX);
                 newHeight = Math.max(50, startHeight + deltaY);
             } else if (c === 'sw') {
                 newWidth = Math.max(50, startWidth - deltaX);
                 newHeight = Math.max(50, startHeight + deltaY);
                 newX = (startX + startWidth) - newWidth; // Adjust X based on new width diff
                 newX = startX - (newWidth - startWidth); // Correct logic: StartX shifts left as width grows
             } else if (c === 'nw') {
                 newWidth = Math.max(50, startWidth - deltaX);
                 newHeight = Math.max(50, startHeight - deltaY);
                 newX = startX - (newWidth - startWidth);
                 newY = startY - (newHeight - startHeight);
             } else if (c === 'ne') {
                 newWidth = Math.max(50, startWidth + deltaX);
                 newHeight = Math.max(50, startHeight - deltaY);
                 newY = startY - (newHeight - startHeight);
             }
             setResizeBounds({ x: newX, y: newY, width: newWidth, height: newHeight });
          } else {
              // Standard Layer Resize
              let newX = startX, newY = startY, newWidth = startWidth, newHeight = startHeight;
              const isMedia = layer.type === 'image' || layer.type === 'video';
              const aspectRatio = startWidth / startHeight;

              if (corner === 'se') {
                 newWidth = Math.max(50, startWidth + deltaX);
                 newHeight = isMedia ? newWidth / aspectRatio : Math.max(50, startHeight + deltaY);
              } else if (corner === 'sw') {
                 newWidth = Math.max(50, startWidth - deltaX);
                 newHeight = isMedia ? newWidth / aspectRatio : Math.max(50, startHeight + deltaY);
                 newX = (startX + startWidth) - newWidth;
              } else if (corner === 'nw') {
                 newWidth = Math.max(50, startWidth - deltaX);
                 newHeight = isMedia ? newWidth / aspectRatio : Math.max(50, startHeight - deltaY);
                 newX = (startX + startWidth) - newWidth;
                 newY = (startY + startHeight) - newHeight;
              } else if (corner === 'ne') {
                 newWidth = Math.max(50, startWidth + deltaX);
                 newHeight = isMedia ? newWidth / aspectRatio : Math.max(50, startHeight - deltaY);
                 newY = (startY + startHeight) - newHeight;
              }
              onUpdateTransform(layer.id, newX, newY, newWidth, newHeight);
          }
      };
      const handleGlobalMouseUp = () => { 
          if (isResizingLayer) { setIsResizingLayer(false); resizeStartRef.current = null; onDragEnd(layer.id); }
          if (isResizingCrop) { setIsResizingCrop(false); resizeStartRef.current = null; }
      };
      if (isResizingLayer || isResizingCrop) { window.addEventListener('mousemove', handleGlobalMouseMove); window.addEventListener('mouseup', handleGlobalMouseUp); }
      return () => { window.removeEventListener('mousemove', handleGlobalMouseMove); window.removeEventListener('mouseup', handleGlobalMouseUp); };
  }, [isResizingLayer, isResizingCrop, layer.id, onUpdateTransform, onDragEnd, scale, layer.type]);

  // ... [Dragging Handler]
  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool !== 'cursor') return;
    if (layer.isLoading || layer.error) return;
    if (isResizingMode || isResizingLayer || isResizingCrop) return;
    if ((e.target as HTMLElement).closest('.layer-controls')) return;
    if ((e.target as HTMLElement).closest('.video-controls')) return;
    if ((e.target as HTMLElement).closest('.annotation-overlay')) return;
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

    e.stopPropagation();
    onSelect(layer.id);
    setShowMenu(false);
    setSelectedAnnotationId(null);

    // In selection mode, just select - don't start dragging
    if (isSelectionMode) return;

    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialLayerPosRef.current = { x: layer.x, y: layer.y };
  };
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = (e.clientX - dragStartRef.current.x) / scale;
      const deltaY = (e.clientY - dragStartRef.current.y) / scale;
      onUpdatePosition(layer.id, initialLayerPosRef.current.x + deltaX, initialLayerPosRef.current.y + deltaY);
    };
    const handleMouseUp = () => { if (isDragging) { setIsDragging(false); onDragEnd(layer.id); } };
    if (isDragging) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isDragging, layer.id, onUpdatePosition, onDragEnd, scale]);

  const togglePlay = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (videoRef.current) {
          if (isPlaying) videoRef.current.pause(); else videoRef.current.play().catch(console.error);
          setIsPlaying(!isPlaying);
      } else if (audioRef.current) {
          if (isPlaying) audioRef.current.pause(); else audioRef.current.play().catch(console.error);
          setIsPlaying(!isPlaying);
      }
  };
  useEffect(() => {
      if (videoRef.current) {
          videoRef.current.onended = () => setIsPlaying(false);
          videoRef.current.onpause = () => setIsPlaying(false);
          videoRef.current.onplay = () => setIsPlaying(true);
      }
      if (audioRef.current) {
          audioRef.current.onended = () => setIsPlaying(false);
          audioRef.current.onpause = () => setIsPlaying(false);
          audioRef.current.onplay = () => setIsPlaying(true);
      }
  }, [layer.src]);

  // --- Actions ---
  const handleRenameClick = () => { const n = window.prompt("Rename:", layer.title); if (n) onRename(layer.id, n); setShowMenu(false); };
  const handleDuplicateClick = () => { onDuplicate(layer.id); setShowMenu(false); }
  const handleExtendClick = () => { setIsExtendingMode(!isExtendingMode); setShowMenu(false); };
  
  const handlePromptSubmit = async (p: string, a: Attachment[], m: ModelId, ar: string, c: number, s: string, res: '720p'|'1080p', mt: MediaType, d: string, vm: VideoMode, si?: number, count?: number, voice?: string) => {
        if (isExtendingMode && onExtendVideo) { onExtendVideo(layer.id, p); setIsExtendingMode(false); } 
        else if (isResizingMode) { handleResizeGenerate(p); } 
        else {
            let finalA = a;
            if (layer.annotations && layer.annotations.length > 0) {
                 const comp = await compositeLayerImage();
                 if (comp) finalA = [...finalA, { id: 'comp-'+layer.id, file: new File([],"c.png"), previewUrl: comp, mimeType: 'image/png', base64: comp }];
            }
            onGenerate(layer.id, p, finalA, m, ar, c, s, res, mt, d, vm, si, count, voice);
        }
  };

  const compositeLayerImage = async (): Promise<string | null> => {
      const canvas = document.createElement('canvas'); canvas.width = layer.width; canvas.height = layer.height;
      const ctx = canvas.getContext('2d'); if (!ctx) return null;
      try {
          // Draw Background Color for Stickies
          if ((layer.type === 'sticky' || layer.type === 'text') && layer.color && layer.type !== 'text') {
              ctx.fillStyle = layer.color;
              ctx.fillRect(0,0, canvas.width, canvas.height);
          }
          if (layer.type === 'image' && layer.src) {
              const img = new Image(); img.crossOrigin = 'anonymous'; img.src = layer.src; await new Promise(r => img.onload = r);
              ctx.save(); ctx.translate(layer.flipX?canvas.width:0, layer.flipY?canvas.height:0); ctx.scale(layer.flipX?-1:1, layer.flipY?-1:1);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height); ctx.restore();
          }
          // Draw Sticky/Text Text
          if ((layer.type === 'sticky' || layer.type === 'text') && layer.text) {
              ctx.font = `${layer.fontSize || (layer.type === 'text' ? 48 : 24)}px sans-serif`;
              ctx.fillStyle = layer.type === 'text' ? (layer.color || '#ffffff') : getContrastColor(layer.color || '#fff8c5'); 
              ctx.textBaseline = 'top'; wrapText(ctx, layer.text, 20, 20, layer.width - 40, (layer.fontSize || 24) * 1.2);
          }
      } catch (e) { console.error("Composite error", e); }
      if (layer.annotations) {
          layer.annotations.forEach(ann => {
              if (ann.type === 'path') {
                  if (ann.points.length < 2) return;
                  ctx.beginPath(); ctx.strokeStyle = ann.color; ctx.lineWidth = ann.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                  ctx.moveTo(ann.points[0].x, ann.points[0].y); for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y); ctx.stroke();
              } else if (ann.type === 'text') {
                  ctx.fillStyle = ann.color; ctx.font = `bold ${ann.fontSize}px sans-serif`; ctx.textBaseline = 'top'; ctx.fillText(ann.text, ann.x, ann.y);
              } else if (ann.type === 'rectangle') {
                  if (ann.vertices.length !== 4) return;
                  ctx.beginPath(); ctx.strokeStyle = ann.color; ctx.lineWidth = ann.strokeWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                  ctx.moveTo(ann.vertices[0].x, ann.vertices[0].y);
                  for (let i = 1; i < ann.vertices.length; i++) ctx.lineTo(ann.vertices[i].x, ann.vertices[i].y);
                  ctx.closePath(); ctx.stroke();
              }
          });
      }
      return canvas.toDataURL('image/png');
  };

  const compositeResizeImage = async (): Promise<string | null> => {
      const canvas = document.createElement('canvas'); 
      canvas.width = resizeBounds.width; 
      canvas.height = resizeBounds.height;
      const ctx = canvas.getContext('2d'); if (!ctx) return null;
      
      try {
          // Fill transparent/black bg
          // ctx.fillStyle = '#000000'; ctx.fillRect(0,0, canvas.width, canvas.height);

          if (layer.type === 'image' && layer.src) {
              const img = new Image(); img.crossOrigin = 'anonymous'; img.src = layer.src; 
              await new Promise(r => img.onload = r);
              
              // Calculate offset: resizeBounds is relative to layer origin (0,0)
              // If resizeBounds.x = -50, it means the crop box starts 50px left of layer.
              // So layer is at x = 50 in the new canvas.
              // Logic: Layer pos in new canvas = -resizeBounds.x, -resizeBounds.y
              
              ctx.drawImage(img, -resizeBounds.x, -resizeBounds.y, layer.width, layer.height);
          }
      } catch (e) { console.error("Resize composite error", e); }
      return canvas.toDataURL('image/png');
  };

  // Helper for sticky text wrapping in export
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
      const words = text.split(' '); let line = '';
      for(let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' '; const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) { ctx.fillText(line, x, y); line = words[n] + ' '; y += lineHeight; } else { line = testLine; }
      }
      ctx.fillText(line, x, y);
  };

  const handleExport = async (format: 'png' | 'jpg' | 'mp4' | 'wav') => {
      try {
        let exportUrl = layer.src;
        
        if (layer.type === 'video' || layer.type === 'audio') {
            const link = document.createElement('a'); 
            link.download = `${layer.title.replace(/\s+/g, '_')}.${format}`;
            link.href = exportUrl;
            link.click();
            setShowMenu(false); 
            setShowExportMenu(false);
            return;
        }

        if (layer.type === 'sticky' || layer.type === 'text' || layer.type === 'drawing' || (layer.annotations && layer.annotations.length > 0)) {
            const comp = await compositeLayerImage(); if (comp) exportUrl = comp;
        }
        const link = document.createElement('a'); link.download = `${layer.title.replace(/\s+/g, '_')}.${format}`;
        if (format === 'png') { link.href = exportUrl; link.click(); } 
        else {
             const img = new Image(); img.crossOrigin = 'anonymous'; img.src = exportUrl; await new Promise(r => img.onload = r);
             const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
             const ctx = canvas.getContext('2d'); if (ctx) { ctx.fillStyle = '#FFF'; ctx.fillRect(0,0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); link.href = canvas.toDataURL('image/jpeg', 0.9); link.click(); }
        }
        setShowMenu(false); setShowExportMenu(false);
      } catch (error) { console.error("Export failed", error); }
  };

  const enterResizeMode = () => { if (layer.type === 'video') return; setIsResizingMode(true); setShowMenu(false); setResizeBounds({ x: 0, y: 0, width: layer.width, height: layer.height }); };
  const handleResizeGenerate = async (p?: string) => {
      const comp = await compositeResizeImage();
      if (!comp) return;

      const w = resizeBounds.width; const h = resizeBounds.height; const ratioVal = w/h;
      const supported = [{ s: '1:1', v: 1 }, { s: '16:9', v: 16/9 }, { s: '9:16', v: 9/16 }, { s: '3:4', v: 0.75 }, { s: '4:3', v: 1.33 }, { s: '3:2', v: 1.5 }, { s: '2:3', v: 0.66 }, { s: '5:4', v: 1.25 }, { s: '4:5', v: 0.8 }];
      const closest = supported.reduce((prev, curr) => Math.abs(curr.v - ratioVal) < Math.abs(prev.v - ratioVal) ? curr : prev);
      
      const attachment: Attachment = { id: layer.id, file: new File([], "layer.png"), previewUrl: comp, mimeType: 'image/png', base64: comp };
      
      // Update the layer position/size to match the new bounds before generating (so it replaces seamlessly)
      // Actually, we usually want to generate a new layer or replace this one. 
      // Current architecture replaces current layer.
      // We should update layer x,y,w,h to match resizeBounds absolute position.
      onUpdateTransform(layer.id, layer.x + resizeBounds.x, layer.y + resizeBounds.y, resizeBounds.width, resizeBounds.height);
      
      onGenerate(layer.id, p || "Extend the image", [attachment], ModelId.GEMINI_2_5_FLASH_IMAGE, closest.s, 65, "1K", '720p', 'image', "6", 'standard', -1); 
      setIsResizingMode(false);
  };
  
  const layerAttachment: Attachment = { id: layer.id, file: new File([], "layer.png"), previewUrl: layer.src, mimeType: layer.type === 'video' ? 'video/mp4' : 'image/png', base64: resolvedBase64 };

  if (layer.isLoading) {
    const progress = generationTask?.progress || 0;
    const isVideo = generationTask?.mediaType === 'video';
    const statusText = isVideo
        ? (progress > 10 ? `Rendering video... ${Math.round(progress)}%` : 'Starting video generation...')
        : 'Creating your image...';

    return (
        <div className="absolute bg-elevated/90 backdrop-blur-xl border border-border/50 rounded-2xl flex flex-col items-center justify-center shadow-2xl shadow-black/40" style={{ left: layer.x, top: layer.y, width: layer.width, height: layer.height, zIndex: isSelected ? 50 : 10 }}>
            {/* Animated rings - Warm Ember */}
            <div className="relative w-16 h-16 mb-4">
                <div className="absolute inset-0 border-2 border-primary/30 rounded-full animate-ring-expand ring-delay-1" />
                <div className="absolute inset-2 border-2 border-primary/50 rounded-full animate-ring-expand ring-delay-2" />
                <div className="absolute inset-4 bg-primary/20 rounded-full animate-ember-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 size={20} className="text-primary animate-spin" />
                </div>
            </div>

            <span className="text-sm font-medium text-text-primary mb-1">{statusText}</span>

            {/* Progress bar for video */}
            {isVideo && progress > 0 && (
                <div className="w-3/4 max-w-[200px] h-1.5 bg-surface rounded-full overflow-hidden mt-2 mb-3">
                    <div
                        className="h-full bg-gradient-to-r from-primary to-primary-hover rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}

            {!isVideo && (
                <span className="text-xs text-text-secondary animate-pulse">This usually takes 5-10 seconds</span>
            )}

            {/* Cancel button */}
            {onCancelGeneration && (
                <button
                    onClick={(e) => { e.stopPropagation(); onCancelGeneration(layer.id); }}
                    className="mt-4 flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-border/50 border border-border/50 rounded-lg text-xs text-text-secondary hover:text-text-primary transition-all duration-200"
                >
                    <X size={12} />
                    Cancel
                </button>
            )}
        </div>
    );
  }
  if (layer.error) {
    return (
        <div className="absolute bg-red-950/50 backdrop-blur-xl border border-red-500/30 rounded-2xl flex flex-col items-center justify-center shadow-2xl shadow-black/40 p-6" style={{ left: layer.x, top: layer.y, width: layer.width, height: layer.height, zIndex: isSelected ? 50 : 10 }}>
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center mb-3">
                <AlertCircle size={24} className="text-red-400" />
            </div>
            <span className="text-sm font-medium text-red-300 mb-1">Generation Failed</span>
            <span className="text-xs text-red-400/80 text-center max-w-[80%] mb-4">{layer.error}</span>
            <button onClick={() => onDelete(layer.id)} className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-xs rounded-lg transition-colors">Dismiss</button>
        </div>
    );
  }

  // Define z-index based on layer type (groups at back)
  const zIndex = layer.type === 'group' ? (isSelected ? 5 : 1) : (isSelected ? 50 : 10);
  
  // Choose Palette
  const getCurrentPalette = () => {
      if (layer.type === 'sticky') return STICKY_COLORS;
      if (layer.type === 'group') return GROUP_COLORS;
      return DRAWING_COLORS;
  };

  // Logic to show color tools
  const showColorTools = layer.type === 'drawing' || layer.type === 'sticky' || layer.type === 'group' || layer.type === 'text' || tool === 'pencil' || tool === 'text' || tool === 'rectangle';

  // Logic to show text size tools
  const showTextSizeTools = (layer.type === 'sticky' || layer.type === 'text') && onUpdateFontSize;

  return (
    <div ref={layerRef} className={`absolute transition-shadow duration-200 group ${isSelectionMode ? 'cursor-crosshair' : ''}`} style={{ left: layer.x, top: layer.y, zIndex, touchAction: 'none' }} onMouseDown={handleMouseDown}>
      {isSelected && !isResizingMode && tool === 'cursor' && (
          <>
             <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-primary rounded-full cursor-nw-resize z-50 hover:scale-125 transition-transform" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
             <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-primary rounded-full cursor-ne-resize z-50 hover:scale-125 transition-transform" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
             <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-primary rounded-full cursor-sw-resize z-50 hover:scale-125 transition-transform" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
             <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-primary rounded-full cursor-se-resize z-50 hover:scale-125 transition-transform" onMouseDown={(e) => handleResizeStart(e, 'se')} />
          </>
      )}

      {/* Resize/Crop Mode Overlay Controls */}
      {isResizingMode && (
         <>
             <div className="absolute z-[60] pointer-events-none" style={{ left: resizeBounds.x, top: resizeBounds.y, width: resizeBounds.width, height: resizeBounds.height }}>
                 <div className="w-full h-full border-2 border-dashed border-primary bg-primary/10 relative pointer-events-auto">
                     <div className="absolute -top-2 -left-2 w-4 h-4 bg-white border border-primary rounded-full cursor-nw-resize hover:scale-125 transition-transform" onMouseDown={(e) => handleCropResizeStart(e, 'nw')} />
                     <div className="absolute -top-2 -right-2 w-4 h-4 bg-white border border-primary rounded-full cursor-ne-resize hover:scale-125 transition-transform" onMouseDown={(e) => handleCropResizeStart(e, 'ne')} />
                     <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border border-primary rounded-full cursor-sw-resize hover:scale-125 transition-transform" onMouseDown={(e) => handleCropResizeStart(e, 'sw')} />
                     <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border border-primary rounded-full cursor-se-resize hover:scale-125 transition-transform" onMouseDown={(e) => handleCropResizeStart(e, 'se')} />
                 </div>
                 {/* Floating Prompt Bar for Resize Mode */}
                 <div className="absolute top-full left-1/2 mt-4 -translate-x-1/2 w-[500px] pointer-events-auto shadow-2xl">
                     <PromptBar 
                        variant="floating" 
                        onSubmit={handleResizeGenerate} 
                        isGenerating={isGenerating} 
                        placeholder="Describe how to fill the new space..." 
                        onCancel={() => setIsResizingMode(false)}
                        contextAttachments={[]}
                     />
                 </div>
             </div>
             {/* Dimmer overlay for everything else */}
             <div className="absolute -inset-[2000px] bg-black/50 z-50 pointer-events-none" style={{ clipPath: `polygon(0% 0%, 0% 100%, ${resizeBounds.x}px 100%, ${resizeBounds.x}px ${resizeBounds.y}px, ${resizeBounds.x + resizeBounds.width}px ${resizeBounds.y}px, ${resizeBounds.x + resizeBounds.width}px ${resizeBounds.y + resizeBounds.height}px, ${resizeBounds.x}px ${resizeBounds.y + resizeBounds.height}px, ${resizeBounds.x}px 100%, 100% 100%, 100% 0%)` }}></div>
         </>
      )}

      {isSelected && !isResizingMode && !isResizingLayer && (
          <div className="absolute -top-12 left-0 z-[60] layer-controls origin-bottom-left" style={{ transform: `scale(${1/scale})` }}>
              <div className="flex items-center gap-1 bg-surface/95 backdrop-blur-xl border border-border rounded-xl p-1.5 shadow-2xl shadow-black/40">
                  <div className="p-1.5 text-gray-400 cursor-grab active:cursor-grabbing border-r border-white/10 pr-2 mr-1"><Move size={16} /></div>
                  
                  {/* General Controls */}
                  <button onClick={() => onFlip(layer.id, 'x')} className="p-1.5 hover:bg-white/5 rounded-md text-gray-300 transition-all active:scale-[0.95]" title="Flip Horizontal"><FlipHorizontal size={16} /></button>
                  <button onClick={() => onFlip(layer.id, 'y')} className="p-1.5 hover:bg-white/5 rounded-md text-gray-300 transition-all active:scale-[0.95]" title="Flip Vertical"><FlipVertical size={16} /></button>
                  {layer.type === 'image' && <button onClick={() => onRemoveBackground(layer.id)} className="p-1.5 hover:bg-white/5 rounded-md text-gray-300 transition-all active:scale-[0.95]" title="Remove Background"><Eraser size={16} /></button>}
                  {layer.type === 'image' && <button onClick={enterResizeMode} className="p-1.5 hover:bg-white/5 rounded-md text-gray-300 transition-all active:scale-[0.95]" title="Outpaint / Expand"><Maximize size={16} /></button>}

                  <div className="w-px h-4 bg-white/10 mx-1"></div>

                  {/* Annotation Tools */}
                  <button onClick={() => setTool(tool === 'pencil' ? 'cursor' : 'pencil')} className={`p-1.5 rounded-md transition-all active:scale-[0.95] ${tool === 'pencil' ? 'bg-primary text-white' : 'text-gray-300 hover:bg-white/5'}`} title="Draw"><Pencil size={16} /></button>
                  <button onClick={() => setTool(tool === 'text' ? 'cursor' : 'text')} className={`p-1.5 rounded-md transition-all active:scale-[0.95] ${tool === 'text' ? 'bg-primary text-white' : 'text-gray-300 hover:bg-white/5'}`} title="Add Text Overlay"><TypeIcon size={16} /></button>
                  <button onClick={() => setTool(tool === 'rectangle' ? 'cursor' : 'rectangle')} className={`p-1.5 rounded-md transition-all active:scale-[0.95] ${tool === 'rectangle' ? 'bg-primary text-white' : 'text-gray-300 hover:bg-white/5'}`} title="Draw Rectangle"><Square size={16} /></button>

                  {(tool === 'pencil' || tool === 'rectangle') && (
                    <div className="relative flex items-center gap-1 border-r border-white/10 pr-2 mr-1">
                        <button onClick={() => setShowStrokePicker(!showStrokePicker)} className="p-1.5 rounded-md text-gray-300 hover:bg-white/5 transition-all flex items-center gap-1 text-[10px] font-mono">
                            <div className="w-0.5 rounded-full bg-gray-300" style={{ height: `${Math.min(strokeWidth * 2, 16)}px` }}></div>
                            <span>{strokeWidth}px</span>
                        </button>
                        {showStrokePicker && (
                            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-surface border border-border p-2 rounded-lg flex flex-col gap-1 shadow-xl z-50 min-w-[80px]">
                                {STROKE_WIDTHS.map(w => (
                                    <button
                                        key={w}
                                        onClick={() => { setStrokeWidth(w); setShowStrokePicker(false); }}
                                        className={`px-2 py-1.5 rounded text-xs hover:bg-white/10 flex items-center gap-2 ${strokeWidth === w ? 'bg-white/10 text-white' : 'text-gray-400'}`}
                                    >
                                        <div className="w-0.5 rounded-full bg-current" style={{ height: `${Math.min(w * 2, 16)}px` }}></div>
                                        <span>{w}px</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                  )}

                  {tool === 'text' && (
                    <div className="relative flex items-center gap-1 border-r border-white/10 pr-2 mr-1">
                        <button onClick={() => setShowFontSizePicker(!showFontSizePicker)} className="p-1.5 rounded-md text-gray-300 hover:bg-white/10 flex items-center gap-1 text-[10px] font-mono">
                            <TypeIcon size={12} />
                            <span>{annotationFontSize}px</span>
                        </button>
                        {showFontSizePicker && (
                            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-surface border border-border p-2 rounded-lg flex flex-col gap-1 shadow-xl z-50 min-w-[80px]">
                                {FONT_SIZES.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => { setAnnotationFontSize(s); setShowFontSizePicker(false); }}
                                        className={`px-2 py-1.5 rounded text-xs hover:bg-white/10 flex items-center gap-2 ${annotationFontSize === s ? 'bg-white/10 text-white' : 'text-gray-400'}`}
                                    >
                                        <span>{s}px</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                  )}

                  {showTextSizeTools && (
                    <div className="flex items-center gap-1 border-r border-white/10 pr-2 mr-1">
                        <button onClick={() => onUpdateFontSize?.(layer.id, -4)} className="p-1.5 hover:bg-white/10 rounded-md text-gray-300" title="Decrease Font Size"><Minus size={12} /></button>
                        <span className="text-[10px] w-6 text-center text-gray-400">{layer.fontSize || (layer.type === 'text' ? 48 : 24)}</span>
                        <button onClick={() => onUpdateFontSize?.(layer.id, 4)} className="p-1.5 hover:bg-white/10 rounded-md text-gray-300" title="Increase Font Size"><Plus size={12} /></button>
                    </div>
                  )}

                  {showColorTools && (
                    <div className="relative group">
                        <button onClick={() => setShowColorPicker(!showColorPicker)} className="p-1.5 rounded-md text-gray-300 hover:bg-white/10 flex items-center gap-1"><div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: color }}></div><Palette size={14} /></button>
                        {showColorPicker && (
                            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-surface border border-border p-2 rounded-lg grid grid-cols-3 gap-1 shadow-xl z-50 w-24">
                                {getCurrentPalette().map(c => <button key={c} onClick={() => { setColor(c); if(layer.type === 'sticky' || layer.type === 'group' || layer.type === 'text') onUpdateColor(layer.id, c); setShowColorPicker(false); }} className={`w-6 h-6 rounded-full border ${color === c ? 'border-white' : 'border-transparent hover:border-white/50'}`} style={{ backgroundColor: c }} />)}
                            </div>
                        )}
                    </div>
                  )}

                  {/* Selected Annotation Controls */}
                  {tool === 'cursor' && selectedAnnotationId && (() => {
                      const selectedAnn = layer.annotations?.find(a => a.id === selectedAnnotationId);
                      if (!selectedAnn) return null;
                      return (
                          <>
                              <div className="w-px h-4 bg-white/10 mx-1"></div>
                              {/* Color Picker for Selected Annotation */}
                              <div className="relative">
                                  <button onClick={() => setShowColorPicker(!showColorPicker)} className="p-1.5 rounded-md text-gray-300 hover:bg-white/10 flex items-center gap-1">
                                      <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: selectedAnn.color }}></div>
                                      <Palette size={14} />
                                  </button>
                                  {showColorPicker && (
                                      <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-surface border border-border p-2 rounded-lg grid grid-cols-3 gap-1 shadow-xl z-50 w-24">
                                          {DRAWING_COLORS.map(c => (
                                              <button key={c} onClick={() => { handleUpdateAnnotationColor(selectedAnnotationId, c); setShowColorPicker(false); }} className={`w-6 h-6 rounded-full border ${selectedAnn.color === c ? 'border-white' : 'border-transparent hover:border-white/50'}`} style={{ backgroundColor: c }} />
                                          ))}
                                      </div>
                                  )}
                              </div>
                              {/* Size Control for Text Annotations */}
                              {selectedAnn.type === 'text' && (
                                  <div className="relative flex items-center gap-1">
                                      <button onClick={() => setShowFontSizePicker(!showFontSizePicker)} className="p-1.5 rounded-md text-gray-300 hover:bg-white/10 flex items-center gap-1 text-[10px] font-mono">
                                          <TypeIcon size={12} />
                                          <span>{selectedAnn.fontSize}px</span>
                                      </button>
                                      {showFontSizePicker && (
                                          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-surface border border-border p-2 rounded-lg flex flex-col gap-1 shadow-xl z-50 min-w-[80px]">
                                              {FONT_SIZES.map(s => (
                                                  <button key={s} onClick={() => { handleUpdateAnnotationSize(selectedAnnotationId, s); setShowFontSizePicker(false); }} className={`px-2 py-1.5 rounded text-xs hover:bg-white/10 flex items-center gap-2 ${selectedAnn.fontSize === s ? 'bg-white/10 text-white' : 'text-gray-400'}`}>
                                                      <span>{s}px</span>
                                                  </button>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              )}
                              {/* Size Control for Rectangle/Path Annotations */}
                              {(selectedAnn.type === 'rectangle' || selectedAnn.type === 'path') && (
                                  <div className="relative flex items-center gap-1">
                                      <button onClick={() => setShowStrokePicker(!showStrokePicker)} className="p-1.5 rounded-md text-gray-300 hover:bg-white/10 flex items-center gap-1 text-[10px] font-mono">
                                          <div className="w-0.5 rounded-full bg-gray-300" style={{ height: `${Math.min((selectedAnn.type === 'rectangle' ? selectedAnn.strokeWidth : selectedAnn.width) * 2, 16)}px` }}></div>
                                          <span>{selectedAnn.type === 'rectangle' ? selectedAnn.strokeWidth : selectedAnn.width}px</span>
                                      </button>
                                      {showStrokePicker && (
                                          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-surface border border-border p-2 rounded-lg flex flex-col gap-1 shadow-xl z-50 min-w-[80px]">
                                              {STROKE_WIDTHS.map(w => (
                                                  <button key={w} onClick={() => { handleUpdateAnnotationSize(selectedAnnotationId, w); setShowStrokePicker(false); }} className={`px-2 py-1.5 rounded text-xs hover:bg-white/10 flex items-center gap-2 ${(selectedAnn.type === 'rectangle' ? selectedAnn.strokeWidth : selectedAnn.width) === w ? 'bg-white/10 text-white' : 'text-gray-400'}`}>
                                                      <div className="w-0.5 rounded-full bg-current" style={{ height: `${Math.min(w * 2, 16)}px` }}></div>
                                                      <span>{w}px</span>
                                                  </button>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              )}
                              {/* Delete button */}
                              <button onClick={() => handleDeleteAnnotation(selectedAnnotationId)} className="p-1.5 hover:bg-red-500/20 text-gray-300 hover:text-red-400 rounded-md transition-colors" title="Delete Annotation">
                                  <X size={16} />
                              </button>
                          </>
                      );
                  })()}
                  <button onClick={clearAnnotations} className="p-1.5 hover:bg-red-500/20 text-gray-300 hover:text-red-400 rounded-md transition-colors" title="Clear Annotations"><RotateCcw size={16} /></button>

                  <div className="w-px h-4 bg-white/10 mx-1"></div>
                  <div className="relative">
                      <button onClick={() => { setShowMenu(!showMenu); setShowExportMenu(false); setShowArrangeMenu(false); }} className={`p-1.5 rounded-md text-gray-300 transition-all active:scale-[0.95] ${showMenu ? 'bg-white/10 text-white' : 'hover:bg-white/5'}`}><MoreHorizontal size={16} /></button>
                      {showMenu && (
                          <div className="absolute top-full left-0 mt-2 w-48 bg-elevated border border-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden py-1.5 flex flex-col gap-0.5 z-50">
                                <button onClick={handleRenameClick} className="flex items-center gap-3 px-3 py-2 text-xs text-left w-full text-gray-300 hover:bg-white/5"><Edit3 size={14}/> Rename</button>
                                <button onClick={handleDuplicateClick} className="flex items-center gap-3 px-3 py-2 text-xs text-left w-full text-gray-300 hover:bg-white/5"><Copy size={14}/> Make a Copy</button>
                                {layer.type === 'image' && <button onClick={() => { onAddReference(layer.id); setShowMenu(false); }} className="flex items-center gap-3 px-3 py-2 text-xs text-left w-full text-gray-300 hover:bg-white/5"><PlusCircle size={14}/> Add as Reference</button>}
                                <button onClick={() => setShowArrangeMenu(!showArrangeMenu)} className="flex items-center justify-between px-3 py-2 text-xs text-left w-full text-gray-300 hover:bg-white/5"><div className="flex items-center gap-3"><ArrowUp size={14}/> Arrange</div><ChevronRight size={12}/></button>
                                {showArrangeMenu && (
                                    <div className="bg-black/20 border-y border-white/5">
                                        <button onClick={() => onReorder(layer.id, 'front')} className="flex items-center gap-2 w-full text-left px-6 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5"><BringToFront size={12}/> Bring to Front</button>
                                        <button onClick={() => onReorder(layer.id, 'forward')} className="flex items-center gap-2 w-full text-left px-6 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5"><ArrowUp size={12}/> Bring Forward</button>
                                        <button onClick={() => onReorder(layer.id, 'backward')} className="flex items-center gap-2 w-full text-left px-6 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5"><ArrowDown size={12}/> Send Backward</button>
                                        <button onClick={() => onReorder(layer.id, 'back')} className="flex items-center gap-2 w-full text-left px-6 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5"><SendToBack size={12}/> Send to Back</button>
                                    </div>
                                )}
                                <button onClick={() => setShowExportMenu(!showExportMenu)} className="flex items-center justify-between px-3 py-2 text-xs text-left w-full text-gray-300 hover:bg-white/5"><div className="flex items-center gap-3"><Download size={14}/> Export as</div><ChevronRight size={12}/></button>
                                {showExportMenu && (
                                    <div className="bg-black/20 border-y border-white/5">
                                        {layer.type === 'video' ? (
                                            <button onClick={() => handleExport('mp4')} className="block w-full text-left px-8 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5">MP4 Video</button>
                                        ) : layer.type === 'audio' ? (
                                             <button onClick={() => handleExport('wav')} className="block w-full text-left px-8 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5">WAV Audio</button>
                                        ) : (
                                            <>
                                                <button onClick={() => handleExport('png')} className="block w-full text-left px-8 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5">PNG Image</button>
                                                <button onClick={() => handleExport('jpg')} className="block w-full text-left px-8 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5">JPG Image</button>
                                            </>
                                        )}
                                    </div>
                                )}
                                <button onClick={() => onDelete(layer.id)} className="flex items-center gap-3 px-3 py-2 text-xs text-left w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 border-t border-white/5"><Trash2 size={14}/> Delete</button>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      <div 
        className={`relative rounded-lg overflow-hidden select-none transition-all duration-150
          ${isSelected && !isResizingMode ? 'ring-2 ring-primary shadow-2xl shadow-black/50' : ''}
          ${!isSelected && !isResizingMode && !isSelectionMode ? 'hover:ring-1 hover:ring-border shadow-xl' : ''}
          ${!isSelected && isSelectionMode ? 'hover:ring-2 hover:ring-primary/70 hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.01]' : ''}
          ${isExtendingMode ? 'ring-2 ring-yellow-500' : ''}
          ${layer.type === 'group' ? 'border-2 border-dashed' : 'bg-surface'}
        `}
        style={{
             width: layer.width > 0 ? layer.width : 'auto',
             height: layer.height > 0 ? layer.height : 'auto',
             opacity: isResizingMode ? 0.7 : 1,
             backgroundColor: layer.type === 'sticky' ? (layer.color || '#fff8c5') : (layer.type === 'group' ? (layer.color ? hexToRgba(layer.color, 0.2) : 'transparent') : (layer.type === 'drawing' || layer.type === 'text' ? 'transparent' : undefined)),
             borderColor: layer.type === 'group' ? (layer.color || '#3f3f46') : undefined,
             boxShadow: layer.type === 'sticky' ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' : undefined
        }}
        onDoubleClick={(e) => {
            if (layer.type === 'sticky' || layer.type === 'text') {
                e.stopPropagation();
                setIsEditingSticky(true);
            }
        }}
      >
        {/* Render Layer Content Based on Type */}
        {layer.type === 'image' && (
          <div className="relative w-full h-full bg-[#101012] pattern-grid-lg">
            {/* Conditional rendering: only one image in DOM at a time */}
            {(!shouldShowFullRes || !fullResLoaded) && layer.thumbnail ? (
              <img
                src={layer.thumbnail}
                alt=""
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{
                  transform: `scaleX(${layer.flipX?-1:1}) scaleY(${layer.flipY?-1:1})`
                }}
                draggable={false}
              />
            ) : (
              <img
                src={layer.src}
                alt={layer.title}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{
                  transform: `scaleX(${layer.flipX?-1:1}) scaleY(${layer.flipY?-1:1})`
                }}
                draggable={false}
                onLoad={() => setFullResLoaded(true)}
              />
            )}
            {/* Hidden preloader: load full-res in background when needed */}
            {shouldShowFullRes && !fullResLoaded && layer.thumbnail && (
              <img
                src={layer.src}
                alt=""
                className="hidden"
                onLoad={() => setFullResLoaded(true)}
              />
            )}
          </div>
        )}
        
        {layer.type === 'video' && (
            <div className="relative w-full h-full bg-black group-hover:bg-[#101012]">
                <video ref={videoRef} src={layer.src} className="block w-full h-full object-contain pointer-events-none" loop muted={isMuted} playsInline style={{ transform: `scaleX(${layer.flipX?-1:1}) scaleY(${layer.flipY?-1:1})` }} />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-transparent transition-colors cursor-pointer" onClick={togglePlay}>{!isPlaying && <div className="bg-white/20 backdrop-blur-sm p-3 rounded-full shadow-lg"><Play size={24} fill="white" className="text-white ml-1" /></div>}</div>
                <button onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }} className="absolute bottom-2 right-2 bg-black/60 p-1.5 rounded text-white hover:bg-black/80 transition-colors z-20 video-controls">{isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
            </div>
        )}

        {/* Audio Layer Player */}
        {layer.type === 'audio' && (
            <div className="w-full h-full bg-[#18181b] border border-white/10 flex flex-col items-center justify-center relative p-4 gap-2 group-hover:bg-[#202023] transition-colors">
                <audio ref={audioRef} src={layer.src} className="hidden" />
                <div className="flex items-center gap-4 w-full">
                    <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white hover:bg-primary-hover shadow-lg transition-transform hover:scale-105">
                        {isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" className="ml-0.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">{layer.title || "Audio"}</div>
                        <div className="text-[10px] text-gray-400 flex items-center gap-1"><Mic size={10} /> {layer.generationMetadata?.voice || "Speech"}</div>
                    </div>
                </div>
                {/* Simple waveform graphic */}
                <div className="w-full h-8 flex items-end gap-0.5 opacity-50">
                    {[...Array(20)].map((_,i) => (
                        <div key={i} className="flex-1 bg-primary rounded-t-sm" style={{ height: `${30 + Math.random()*70}%`, opacity: isPlaying ? 0.8 : 0.4 }}></div>
                    ))}
                </div>
            </div>
        )}

        {(layer.type === 'sticky' || layer.type === 'text') && (
            <div className="w-full h-full p-4 overflow-hidden relative">
                {isEditingSticky ? (
                    <textarea 
                        ref={stickyInputRef}
                        value={layer.text || ''}
                        onChange={(e) => onUpdateText(layer.id, e.target.value)}
                        onBlur={() => setIsEditingSticky(false)}
                        onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) e.currentTarget.blur(); }}
                        className="w-full h-full bg-transparent resize-none border-none outline-none font-sans leading-relaxed"
                        style={{ color: layer.type === 'text' ? (layer.color || '#ffffff') : getContrastColor(layer.color || '#fff8c5'), fontSize: `${layer.fontSize || (layer.type === 'text' ? 48 : 24)}px` }}
                        placeholder="Type something..."
                    />
                ) : (
                    <div 
                        className="w-full h-full font-sans leading-relaxed whitespace-pre-wrap break-words"
                        style={{ color: layer.type === 'text' ? (layer.color || '#ffffff') : getContrastColor(layer.color || '#fff8c5'), fontSize: `${layer.fontSize || (layer.type === 'text' ? 48 : 24)}px` }}
                    >
                        {layer.text || "Double click to edit"}
                    </div>
                )}
            </div>
        )}

        {layer.type === 'group' && (
            <div className="absolute top-0 left-0 bg-surface/80 backdrop-blur text-[10px] font-bold px-2 py-1 rounded-br text-gray-300 pointer-events-none" style={{ backgroundColor: layer.color || '#3f3f46' }}>
                {layer.title}
            </div>
        )}
        
        {/* Transparent drawing layer indicator */}
        {layer.type === 'drawing' && !layer.annotations?.length && tool !== 'pencil' && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="bg-black/50 text-white px-3 py-1 rounded-full text-xs backdrop-blur-sm">Drawing Layer</div>
            </div>
        )}

        {/* Text Overlays (Annotations) */}
        {layer.annotations?.map(ann => {
            if (ann.type !== 'text') return null;
            const isAnnSelected = selectedAnnotationId === ann.id;
            return (
                <div key={ann.id} onMouseDown={(e) => handleAnnotationMouseDown(e, ann.id)} className={`absolute annotation-overlay cursor-move flex items-start select-none group ${isAnnSelected ? 'z-40 border border-primary bg-black/10' : 'z-30 hover:border hover:border-white/20'}`} style={{ left: ann.x, top: ann.y, color: ann.color, fontSize: `${ann.fontSize}px`, fontWeight: '400', fontFamily: 'sans-serif', lineHeight: 1.3, whiteSpace: 'pre-wrap', padding: '2px 4px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                    {ann.text}
                    {isAnnSelected && (
                        <>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteAnnotation(ann.id); }} className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 shadow-md"><X size={8} /></button>
                            <div onMouseDown={(e) => handleAnnotationResizeMouseDown(e, ann.id)} className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-primary rounded-full cursor-se-resize z-50 hover:scale-125 shadow-md" />
                        </>
                    )}
                </div>
            );
        })}

        {/* Rectangle Annotations with Vertex Handles */}
        {layer.annotations?.map(ann => {
            if (ann.type !== 'rectangle') return null;
            const isAnnSelected = selectedAnnotationId === ann.id;
            return (
                <div key={ann.id} className="absolute annotation-overlay pointer-events-none z-30" style={{ inset: 0 }}>
                    {/* Clickable overlay for selection - only the polygon stroke area is clickable */}
                    <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                    >
                        <polygon
                            points={ann.vertices.map(v => `${v.x},${v.y}`).join(' ')}
                            fill="transparent"
                            stroke="transparent"
                            strokeWidth={ann.strokeWidth + 10}
                            style={{ cursor: tool === 'cursor' ? 'pointer' : 'default', pointerEvents: tool === 'cursor' ? 'auto' : 'none' }}
                            onMouseDown={(e) => handleAnnotationMouseDown(e, ann.id)}
                        />
                    </svg>
                    {isAnnSelected && (
                        <>
                            {/* Delete button */}
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteAnnotation(ann.id); }}
                                className="absolute bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 shadow-md pointer-events-auto z-50"
                                style={{
                                    left: ann.vertices[0].x - 6,
                                    top: ann.vertices[0].y - 12
                                }}
                            >
                                <X size={8} />
                            </button>
                            {/* Vertex handles */}
                            {ann.vertices.map((vertex, idx) => (
                                <div
                                    key={idx}
                                    onMouseDown={(e) => handleVertexMouseDown(e, ann.id, idx)}
                                    className="absolute w-3 h-3 bg-white border-2 border-primary rounded-full cursor-move z-50 hover:scale-125 shadow-md pointer-events-auto transition-transform"
                                    style={{
                                        left: vertex.x - 6,
                                        top: vertex.y - 6
                                    }}
                                />
                            ))}
                        </>
                    )}
                </div>
            );
        })}

        <canvas ref={canvasRef} className="absolute inset-0 z-20 pointer-events-none" style={{ pointerEvents: tool !== 'cursor' ? 'auto' : 'none', cursor: tool === 'pencil' ? 'crosshair' : tool === 'text' ? 'text' : tool === 'rectangle' ? 'crosshair' : 'default' }} onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp} />
        {textInput && (
            <div className="absolute z-30" style={{ left: textInput.x, top: textInput.y }} onMouseDown={(e) => e.stopPropagation()}>
                <textarea
                    ref={textInputRef}
                    autoFocus
                    value={textInput.value}
                    onChange={(e) => {
                        setTextInput({...textInput, value: e.target.value});
                        e.target.style.height = 'auto';
                        e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            commitText();
                        }
                    }}
                    onBlur={commitText}
                    placeholder="Type here..."
                    className="bg-black/60 backdrop-blur-sm text-white border border-primary/50 px-3 py-2 rounded-lg outline-none shadow-xl resize-none overflow-hidden"
                    style={{
                        color: color,
                        fontSize: `${annotationFontSize}px`,
                        fontWeight: '400',
                        minWidth: '100px',
                        maxWidth: '400px',
                        lineHeight: '1.3',
                    }}
                    rows={1}
                />
            </div>
        )}
      </div>

      {isSelected && !isResizingMode && !isResizingLayer && (layer.type === 'image' || layer.type === 'video') && (
        <div className="absolute top-full left-1/2 mt-4 z-50 layer-controls animate-in fade-in slide-in-from-top-2 duration-200 origin-top" style={{ transform: `translateX(-50%) scale(${1 / scale})` }}>
           <PromptBar variant="floating" onSubmit={handlePromptSubmit} isGenerating={isGenerating} initialValues={draftState} onStateChange={handleDraftStateChange} contextAttachments={!isExtendingMode && layer.type === 'image' ? [layerAttachment] : []} attachments={promptAttachments} onAttachmentsChange={setPromptAttachments} onSelectOnCanvasStart={onSelectOnCanvasStart} placeholder={isExtendingMode ? "Describe how to extend this video..." : (layer.type === 'video' ? "Remix this video..." : "Edit or remix this image...")} onCancel={() => onSelect('')} isExtension={isExtendingMode} inputRef={promptInputRef} />
        </div>
      )}
    </div>
  );
};

// Memoize to prevent re-renders when parent state changes but this layer's props haven't
export default React.memo(CanvasLayer, (prev, next) => {
  // Return true if props are equal (should NOT re-render)
  return (
    prev.layer === next.layer &&
    prev.isSelected === next.isSelected &&
    prev.scale === next.scale &&
    prev.isGenerating === next.isGenerating &&
    prev.generationTask === next.generationTask &&
    prev.injectedAttachment === next.injectedAttachment &&
    prev.isSelectionMode === next.isSelectionMode
  );
});
