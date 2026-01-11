import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Stage, Layer, Transformer } from 'react-konva';
import Konva from 'konva';
import { LayerData, GenerationTask } from '../types';
import KonvaImageLayer from './KonvaImageLayer';

interface KonvaCanvasProps {
  layers: LayerData[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onUpdateTransform: (id: string, x: number, y: number, width: number, height: number) => void;
  generationTasks: Map<string, GenerationTask>;
  isSelectionMode: boolean;
  canvasOffset: { x: number; y: number };
  scale: number;
  onCanvasOffsetChange: (offset: { x: number; y: number }) => void;
  onScaleChange: (scale: number) => void;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const FULL_RES_THRESHOLD = 400;

const KonvaCanvas: React.FC<KonvaCanvasProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onUpdatePosition,
  onUpdateTransform,
  generationTasks,
  isSelectionMode,
  canvasOffset,
  scale,
  onCanvasOffsetChange,
  onScaleChange,
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const layerRefs = useRef<Map<string, Konva.Group>>(new Map());

  const [stageSize, setStageSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setStageSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update transformer when selection changes
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    if (selectedLayerId) {
      const selectedNode = layerRefs.current.get(selectedLayerId);
      if (selectedNode) {
        transformer.nodes([selectedNode]);
        transformer.getLayer()?.batchDraw();
      } else {
        transformer.nodes([]);
      }
    } else {
      transformer.nodes([]);
    }
  }, [selectedLayerId, layers]);

  const registerLayerRef = useCallback((id: string, node: Konva.Group | null) => {
    if (node) {
      layerRefs.current.set(id, node);
    } else {
      layerRefs.current.delete(id);
    }
  }, []);

  // Wheel handler: zoom (ctrl/cmd) or pan (regular scroll)
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();

      const stage = stageRef.current;
      if (!stage) return;

      if (e.evt.ctrlKey || e.evt.metaKey) {
        // Zoom centered on mouse position
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const oldScale = scale;
        const mousePointTo = {
          x: (pointer.x - canvasOffset.x) / oldScale,
          y: (pointer.y - canvasOffset.y) / oldScale,
        };

        const scaleBy = 1.05;
        const direction = e.evt.deltaY > 0 ? -1 : 1;
        let newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
        newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

        const newOffset = {
          x: pointer.x - mousePointTo.x * newScale,
          y: pointer.y - mousePointTo.y * newScale,
        };

        onScaleChange(newScale);
        onCanvasOffsetChange(newOffset);
      } else {
        // Pan
        onCanvasOffsetChange({
          x: canvasOffset.x - e.evt.deltaX,
          y: canvasOffset.y - e.evt.deltaY,
        });
      }
    },
    [canvasOffset, scale, onCanvasOffsetChange, onScaleChange]
  );

  // Stage drag for panning
  const handleStageDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (e.target !== stageRef.current) return;

      const stage = stageRef.current;
      if (!stage) return;

      onCanvasOffsetChange({
        x: stage.x(),
        y: stage.y(),
      });
    },
    [onCanvasOffsetChange]
  );

  // Click on empty space to deselect
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target === stageRef.current) {
        onSelectLayer(null);
      }
    },
    [onSelectLayer]
  );

  // Layer drag handlers
  const handleLayerDragMove = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      onUpdatePosition(id, node.x(), node.y());
    },
    [onUpdatePosition]
  );

  const handleLayerDragEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      onUpdatePosition(id, node.x(), node.y());
    },
    [onUpdatePosition]
  );

  // Layer transform (resize) handler
  const handleLayerTransformEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<Event>) => {
      const node = e.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      // Reset scale and apply to dimensions
      node.scaleX(1);
      node.scaleY(1);

      onUpdateTransform(
        id,
        node.x(),
        node.y(),
        Math.max(50, node.width() * scaleX),
        Math.max(50, node.height() * scaleY)
      );
    },
    [onUpdateTransform]
  );

  // Filter for image layers only (non-loading)
  const imageLayers = layers.filter(
    (l) => l.type === 'image' && !l.isLoading && l.src
  );

  return (
    <Stage
      ref={stageRef}
      width={stageSize.width}
      height={stageSize.height}
      x={canvasOffset.x}
      y={canvasOffset.y}
      scaleX={scale}
      scaleY={scale}
      draggable
      onDragEnd={handleStageDragEnd}
      onWheel={handleWheel}
      onClick={handleStageClick}
      onTap={handleStageClick}
      style={{
        cursor: isSelectionMode ? 'crosshair' : 'default',
        background: 'transparent',
      }}
    >
      <Layer>
        {imageLayers.map((layer) => (
          <KonvaImageLayer
            key={layer.id}
            layer={layer}
            isSelected={selectedLayerId === layer.id}
            scale={scale}
            fullResThreshold={FULL_RES_THRESHOLD}
            onSelect={() => onSelectLayer(layer.id)}
            onDragMove={(e) => handleLayerDragMove(layer.id, e)}
            onDragEnd={(e) => handleLayerDragEnd(layer.id, e)}
            onTransformEnd={(e) => handleLayerTransformEnd(layer.id, e)}
            registerRef={(node) => registerLayerRef(layer.id, node)}
          />
        ))}

        {/* Single transformer for selected layer */}
        <Transformer
          ref={transformerRef}
          flipEnabled={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (Math.abs(newBox.width) < 50 || Math.abs(newBox.height) < 50) {
              return oldBox;
            }
            return newBox;
          }}
          anchorSize={8}
          anchorCornerRadius={2}
          anchorFill="#ff6b35"
          anchorStroke="#ff6b35"
          borderStroke="#ff6b35"
          borderStrokeWidth={1.5}
          rotateEnabled={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
        />
      </Layer>
    </Stage>
  );
};

export default React.memo(KonvaCanvas);
