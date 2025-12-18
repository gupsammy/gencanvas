# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Gemini Infinite Canvas**, a React-based infinite canvas application for generating AI images, videos, and audio using Google's Gemini API. Users can create, manipulate, and remix media content on an infinite pannable/zoomable canvas.

## Development Commands

```bash
npm install     # Install dependencies
npm run dev     # Start dev server on port 3000
npm run build   # Production build
npm run preview # Preview production build
```

## Environment Setup

Set `GEMINI_API_KEY` in `.env.local` to your Gemini API key. The Vite config exposes this as `process.env.API_KEY`.

## Architecture

### Entry Point and Core Components

The application follows a flat structure with the main App component at root level:

- `App.tsx` - Main application component managing canvas state, layer operations, history (undo/redo), and generation handlers
- `index.tsx` - React DOM entry point
- `index.html` - HTML template with Tailwind CSS configuration embedded

### Component Structure

Components live in `/components/`:

- `CanvasLayer.tsx` (~890 lines) - Individual layer rendering with drag/resize, annotation drawing, text overlays, video/audio playback, and floating prompt bars for remix operations
- `PromptBar.tsx` - Generation input UI with media type selection (image/video/audio), attachment handling, and model configuration
- `Sidebar.tsx` - Layer list panel with hierarchical group display and property inspector

### Services

- `services/geminiService.ts` - Google GenAI SDK wrapper providing `generateImageContent`, `generateVideoContent`, `generateSpeechContent`, and `generateLayerTitle` functions

### Type System

`types.ts` defines:
- `LayerData` - Core layer interface with position, dimensions, media content, annotations, and generation metadata
- `ModelId` enum - Available Gemini models (image: Flash/Pro, video: Veo Fast/High, audio: TTS)
- `MediaType` - Layer types: image, video, audio, sticky, group, drawing, text
- `VideoMode` - Video generation modes: standard, interpolation, references
- `Annotation` - Drawing paths and text overlays on layers

### Constants

`constants.ts` contains model definitions, voice configurations, and color palettes for sticky notes/groups.

## Key Patterns

### Layer Management

Layers are stored in a flat array in `App.tsx` state. Group hierarchy uses `parentId` references rather than nested structures. The canvas supports:
- Drag with snapping to other layer edges/centers
- Aspect-ratio-locked resize for media layers
- Layer z-ordering (bring to front/back)
- Undo/redo via history array

### Generation Flow

1. User submits prompt via `PromptBar` (global or floating per-layer)
2. Placeholder layer created with `isLoading: true`
3. Service function called with attachments/references
4. Layer updated with result URL and metadata on completion

### Canvas Interaction

- Pan: Shift+drag or middle mouse button
- Zoom: Ctrl/Cmd + scroll wheel
- Selection: Click layer to select, click canvas background to deselect
- Layer selection mode: For choosing reference images from canvas

### Annotation System

`CanvasLayer` includes a canvas overlay for pencil drawing and text annotations stored in `layer.annotations`. Composite functions merge annotations with base layer for export or reference.

## Veo Video Constraints

The video generation service enforces Veo API constraints:
- Interpolation mode requires exactly 2 images, locked to 8s duration
- Reference images mode forces 16:9 aspect ratio, 720p, 8s duration, max 3 images
- Video extension uses the high-quality Veo model only
