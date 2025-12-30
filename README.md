# Aether

An infinite canvas for AI-powered media generation. Create images, videos, and audio using Google's Gemini API on a pannable, zoomable workspace.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Infinite Canvas** - Pan and zoom freely across your workspace
- **AI Image Generation** - Generate images with Gemini Flash or Pro models
- **AI Video Generation** - Create videos with Veo, including interpolation between images
- **AI Audio Generation** - Text-to-speech with multiple voice options
- **Layer System** - Organize content with layers, groups, and z-ordering
- **Annotations** - Draw and add text overlays on any layer
- **Remix Workflow** - Use generated content as references for new generations
- **Persistent State** - Canvas state saved locally via IndexedDB

## Getting Started

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Create environment file
echo "GEMINI_API_KEY=your_api_key_here" > .env.local

# Start development server
npm run dev
```

Get your API key from [Google AI Studio](https://aistudio.google.com/apikey).

## Usage

| Action | Input |
|--------|-------|
| Pan | `Shift` + drag or middle mouse |
| Zoom | `Ctrl/Cmd` + scroll |
| Select | Click layer |
| Generate | Enter prompt in bottom bar |

## Tech Stack

- React 18 with TypeScript
- Vite for bundling
- Google GenAI SDK
- IndexedDB for persistence
- Tailwind CSS

## License

MIT
