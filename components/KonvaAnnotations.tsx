import React from 'react';
import { Line, Rect, Text, Group } from 'react-konva';
import { Annotation, DrawingPath, TextAnnotation, RectangleAnnotation } from '../types';

interface KonvaAnnotationsProps {
  annotations: Annotation[];
  layerWidth: number;
  layerHeight: number;
}

/**
 * Renders annotations (pencil strokes, rectangles, text) as Konva shapes
 * Annotations are positioned relative to the layer (0,0 is top-left of layer)
 */
const KonvaAnnotations: React.FC<KonvaAnnotationsProps> = ({
  annotations,
  layerWidth,
  layerHeight,
}) => {
  if (!annotations || annotations.length === 0) return null;

  return (
    <Group>
      {annotations.map((ann) => {
        if (ann.type === 'path') {
          return <PencilStroke key={ann.id} annotation={ann} />;
        }
        if (ann.type === 'rectangle') {
          return <RectangleShape key={ann.id} annotation={ann} />;
        }
        if (ann.type === 'text') {
          return <TextShape key={ann.id} annotation={ann} />;
        }
        return null;
      })}
    </Group>
  );
};

/**
 * Pencil stroke as Konva Line with tension for smoothing
 */
const PencilStroke: React.FC<{ annotation: DrawingPath }> = ({ annotation }) => {
  const { points, color, width } = annotation;

  if (points.length < 2) return null;

  // Flatten points array for Konva: [x1, y1, x2, y2, ...]
  const flatPoints = points.flatMap((p) => [p.x, p.y]);

  return (
    <Line
      points={flatPoints}
      stroke={color}
      strokeWidth={width}
      tension={0.5} // Smooth curves
      lineCap="round"
      lineJoin="round"
      globalCompositeOperation="source-over"
    />
  );
};

/**
 * Rectangle annotation as Konva Rect (stroke only, no fill)
 */
const RectangleShape: React.FC<{ annotation: RectangleAnnotation }> = ({ annotation }) => {
  const { vertices, color, strokeWidth } = annotation;

  if (vertices.length < 4) return null;

  // Calculate bounding box from vertices
  const xs = vertices.map((v) => v.x);
  const ys = vertices.map((v) => v.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return (
    <Rect
      x={minX}
      y={minY}
      width={maxX - minX}
      height={maxY - minY}
      stroke={color}
      strokeWidth={strokeWidth}
      fill="transparent"
    />
  );
};

/**
 * Text annotation as Konva Text
 */
const TextShape: React.FC<{ annotation: TextAnnotation }> = ({ annotation }) => {
  const { x, y, text, color, fontSize } = annotation;

  return (
    <Text
      x={x}
      y={y}
      text={text}
      fontSize={fontSize}
      fill={color}
      fontFamily="sans-serif"
    />
  );
};

export default React.memo(KonvaAnnotations);
