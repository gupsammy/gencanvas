import React, { useEffect, useRef } from 'react';
import { Image, Group } from 'react-konva';
import Konva from 'konva';
import { LayerData } from '../types';
import { useKonvaImageWithThumbnail } from '../hooks/useKonvaImage';
import KonvaAnnotations from './KonvaAnnotations';

interface KonvaImageLayerProps {
  layer: LayerData;
  isSelected: boolean;
  scale: number;
  fullResThreshold: number;
  onSelect: () => void;
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
  registerRef: (node: Konva.Group | null) => void;
}

const KonvaImageLayer: React.FC<KonvaImageLayerProps> = ({
  layer,
  isSelected,
  scale,
  fullResThreshold,
  onSelect,
  onDragMove,
  onDragEnd,
  onTransformEnd,
  registerRef,
}) => {
  const groupRef = useRef<Konva.Group>(null);

  // LOD: show thumbnail when zoomed out, full res when zoomed in
  const renderedWidth = layer.width * scale;
  const shouldShowFull = renderedWidth >= fullResThreshold;

  const loadedImage = useKonvaImageWithThumbnail(
    layer.src,
    layer.thumbnail,
    shouldShowFull
  );

  // Register group ref for transformer
  useEffect(() => {
    registerRef(groupRef.current);
    return () => registerRef(null);
  }, [registerRef]);

  // Handle flips via scale
  const flipScaleX = layer.flipX ? -1 : 1;
  const flipScaleY = layer.flipY ? -1 : 1;

  return (
    <Group
      ref={groupRef}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    >
      {/* Image with flip transforms */}
      {loadedImage ? (
        <Image
          image={loadedImage}
          width={layer.width}
          height={layer.height}
          offsetX={layer.flipX ? layer.width : 0}
          offsetY={layer.flipY ? layer.height : 0}
          scaleX={flipScaleX}
          scaleY={flipScaleY}
          // Smooth rendering
          imageSmoothingEnabled
          // Shadow for depth
          shadowColor="black"
          shadowBlur={isSelected ? 20 : 10}
          shadowOpacity={isSelected ? 0.4 : 0.2}
          shadowOffsetX={0}
          shadowOffsetY={isSelected ? 8 : 4}
          // Corner radius
          cornerRadius={8 / scale}
        />
      ) : (
        // Placeholder while loading
        <Image
          width={layer.width}
          height={layer.height}
          fill="#1a1a1a"
        />
      )}

      {/* Annotations rendered on top of image */}
      {layer.annotations && layer.annotations.length > 0 && (
        <KonvaAnnotations
          annotations={layer.annotations}
          layerWidth={layer.width}
          layerHeight={layer.height}
        />
      )}

    </Group>
  );
};

export default React.memo(KonvaImageLayer, (prev, next) => {
  return (
    prev.layer.id === next.layer.id &&
    prev.layer.x === next.layer.x &&
    prev.layer.y === next.layer.y &&
    prev.layer.width === next.layer.width &&
    prev.layer.height === next.layer.height &&
    prev.layer.src === next.layer.src &&
    prev.layer.thumbnail === next.layer.thumbnail &&
    prev.layer.flipX === next.layer.flipX &&
    prev.layer.flipY === next.layer.flipY &&
    prev.layer.annotations === next.layer.annotations &&
    prev.isSelected === next.isSelected &&
    prev.scale === next.scale
  );
});
