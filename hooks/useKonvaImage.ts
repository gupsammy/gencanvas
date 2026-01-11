import { useState, useEffect, useRef } from 'react';

/**
 * Hook to load an image from a URL (blob URL or base64) for use with Konva
 */
export function useKonvaImage(src: string | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const prevSrcRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (src === prevSrcRef.current) return;
    prevSrcRef.current = src;

    if (!src) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    imageRef.current = img;

    img.onload = () => {
      if (imageRef.current === img) {
        setImage(img);
      }
    };

    img.onerror = () => {
      console.error('Failed to load image:', src.substring(0, 100));
      if (imageRef.current === img) {
        setImage(null);
      }
    };

    img.src = src;

    return () => {
      if (imageRef.current === img) {
        imageRef.current = null;
      }
    };
  }, [src]);

  return image;
}

/**
 * Hook with LOD support - thumbnail when zoomed out, full res when zoomed in
 */
export function useKonvaImageWithThumbnail(
  src: string | undefined,
  thumbnail: string | undefined,
  shouldShowFull: boolean
): HTMLImageElement | null {
  const thumbnailImage = useKonvaImage(thumbnail);
  const fullImage = useKonvaImage(shouldShowFull ? src : undefined);

  if (shouldShowFull && fullImage) {
    return fullImage;
  }
  return thumbnailImage || fullImage;
}
