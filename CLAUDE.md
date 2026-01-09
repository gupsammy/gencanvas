# GenCanvas

React 19 + Vite infinite canvas for generating AI images, videos, and audio via Gemini API.

## Commands

```bash
npm run dev     # Start dev server
npm run build   # Production build
```

## Environment

Set `GEMINI_API_KEY` in `.env.local`. Vite exposes it as `process.env.API_KEY`.

## Architecture

Flat component structure with state centralized in App.tsx.

**Core files:**
- `App.tsx` - Canvas state, layer CRUD, history (undo/redo), generation handlers
- `types.ts` - `LayerData`, `ModelId` enum, `MediaType`, `VideoMode`, `Annotation`
- `constants.ts` - Model definitions, voice configs, color palettes

**Components:**
- `CanvasLayer.tsx` - Layer rendering, drag/resize, annotations, media playback
- `PromptBar.tsx` - Generation UI with media type selection and model config
- `Sidebar.tsx` - Layer list with group hierarchy and property inspector
- `Minimap.tsx` - Canvas navigation overview

**Services:**
- `geminiService.ts` - GenAI SDK wrapper (`generateImageContent`, `generateVideoContent`, `generateSpeechContent`)
- `storageService.ts` - IndexedDB persistence for layers, view state, and history
- `thumbnailService.ts` - 256px thumbnail generation for LOD rendering

## Key Patterns

**Layer management:** Flat array with `parentId` references for group hierarchy. Supports drag snapping, aspect-ratio-locked resize, z-ordering.

**Generation flow:** PromptBar submission → placeholder layer with `isLoading: true` → service call → layer update with result.

**Persistence:** IndexedDB stores layers, view state (offset/scale), and history (max 20 states). Auto-migrates old layers to include thumbnails.

**Canvas controls:** Shift+drag or middle mouse to pan. Ctrl/Cmd+scroll to zoom. Ctrl+Z/Ctrl+Shift+Z for undo/redo.

## Veo Constraints

- Interpolation mode: exactly 2 images, locked to 8s duration
- Reference images mode: 16:9 aspect ratio, 720p, 8s duration, max 3 images
- Video extension: uses high-quality Veo model only
