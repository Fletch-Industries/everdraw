# Everdraw

<div align="center">

**Draw Forever. Own Forever.**

A professional open-source drawing application with blockchain-backed artwork ownership.

Visit the deployed version at: [Everdraw.art](https://everdraw.art)

[![License: Open BSV](https://img.shields.io/badge/License-Open%20BSV-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://reactjs.org/)
[![BSV](https://img.shields.io/badge/BSV-Blockchain-orange)](https://bitcoinsv.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Features](#features) • [Getting Started](#getting-started) • [Documentation](#documentation) • [Contributing](#contributing) • [License](#license)

</div>

---

## Overview

Everdraw is a powerful, browser-based drawing application built for artists, designers, and creative professionals. It features a high-performance WebGL rendering engine, pressure-sensitive brush support (optimized for Apple Pencil), and a professional layer system—with integrated blockchain technology for artwork authentication and decentralized storage.

**Key Highlights:**
- 🎨 **Professional Brush Engine** – Multiple brush types with pressure, tilt, and velocity sensitivity
- 🖼️ **Layer System** – Full layer support with opacity, visibility, and merging
- ⚡ **WebGL Rendering** – Hardware-accelerated rendering for smooth performance
- 📱 **Mobile-First** – Optimized for iPad and touch devices with Apple Pencil support
- 🔐 **AuthSig Integration** – Cryptographically sign and authenticate your artwork on the BSV blockchain
- ☁️ **UHRP Storage** – Decentralized, content-addressed storage ensuring your art lives forever

## Features

### Brush Types
- **Pencil** – Natural graphite texture with pressure-sensitive shading
- **Pen** – Clean, consistent strokes for inking and lineart
- **Paintbrush** – Soft, blendable strokes with wet mixing
- **Charcoal** – Textured, expressive marks with grain
- **Fountain Pen** – Variable-width calligraphic strokes
- **Oil Paint** – Thick, impasto-style paint application
- **Acrylic** – Quick-drying paint simulation
- **Watercolor** – Transparent, flowing washes with edge effects
- **Marker** – Bold, flat color application
- **Custom Brushes** – Create and save your own brush presets

### Canvas Features
- **Infinite Undo/Redo** – Never lose your work
- **Multi-layer Support** – Organize your artwork with layers
- **Layer Merging** – Combine layers non-destructively
- **Reference Images** – Import reference photos for tracing
- **Background Colors** – Customizable canvas backgrounds
- **Zoom & Pan** – Navigate your canvas with touch gestures
- **Canvas Rotation** – Rotate your canvas for comfortable drawing angles

### Export Options
- **PNG/JPG/WebP** – Export as raster images with quality control
- **Everdraw Format** – Native format preserving all layers and strokes
- **Scale Export** – Export at 0.5x to 4x resolution

### Blockchain Features
- **AuthSig Signing** – Cryptographically sign artwork with your BSV identity
- **UHRP Publishing** – Upload artwork to decentralized, content-addressed storage
- **Public Gallery** – Browse and discover artwork published by other artists
- **Provenance** – Verifiable ownership and creation timestamps on-chain

### Input Support
- **Apple Pencil** – Full pressure, tilt, and altitude support
- **Stylus Support** – Works with other pressure-sensitive styluses
- **Touch Gestures** – Two-finger zoom, pan, and rotate
- **Keyboard Shortcuts** – Quick access to common tools

## Getting Started

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm, yarn, or bun package manager
- Modern browser with WebGL2 support

### Installation

```bash
# Clone the repository
git clone https://github.com/Fletch-Industries/everdraw.git
cd everdraw

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Building for Production

```bash
# Create optimized production build
npm run build

# Preview production build locally
npm run preview
```

## Documentation

### Project Structure

```
everdraw/
├── src/
│   ├── components/          # React components
│   │   ├── ui/              # Reusable UI components (shadcn/ui)
│   │   ├── BrushStudio/     # Brush customization interface
│   │   ├── Canvas.tsx       # Canvas2D fallback renderer
│   │   ├── WebGLCanvas.tsx  # WebGL primary renderer
│   │   ├── DrawingApp.tsx   # Main application component
│   │   ├── ExportDialog.tsx # Export with AuthSig/UHRP
│   │   └── ...
│   ├── hooks/               # Custom React hooks
│   │   ├── useDrawing.ts    # Drawing state management
│   │   ├── useMultiTouchGestures.ts  # Touch gesture handling
│   │   └── ...
│   ├── utils/               # Core utilities
│   │   ├── brushEngine.ts   # Brush rendering algorithms
│   │   ├── webglPaintEngine.ts  # WebGL rendering engine
│   │   ├── strokeSmoothing.ts   # Input smoothing
│   │   ├── fileExport.ts    # Export functionality
│   │   └── ...
│   ├── types/               # TypeScript definitions
│   │   ├── drawing.ts       # Core drawing types
│   │   ├── customBrush.ts   # Custom brush configuration
│   │   └── ...
│   └── pages/               # Page components
├── public/                  # Static assets
└── index.html               # Entry HTML
```

### Key Concepts

#### Brush Engine
The brush engine (`src/utils/brushEngine.ts`) handles all stroke rendering with support for:
- Pressure curves (linear, light touch, heavy, S-curve)
- Bristle simulation for natural brush feel
- Texture and grain effects
- Wet mixing for paint-like color pickup

#### WebGL Rendering
The WebGL engine (`src/utils/webglPaintEngine.ts`) provides:
- Hardware-accelerated stroke rendering
- Efficient layer compositing
- Real-time brush preview

#### Layer System
Layers support:
- Independent opacity control
- Visibility toggling
- Drag-and-drop reordering
- Non-destructive merging

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `E` | Toggle Eraser |
| `I` | Toggle Eyedropper |

## Technology Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (Radix primitives)
- **State Management**: React hooks + useReducer patterns
- **Graphics**: WebGL2 / Canvas2D fallback
- **Compression**: pako (gzip for file format)
- **Blockchain**: @bsv/sdk, authsig, @bsv/uhrp-react

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome 90+ | ✅ Full |
| Safari 15+ | ✅ Full (including iPadOS) |
| Firefox 90+ | ✅ Full |
| Edge 90+ | ✅ Full |

**Note**: WebGL2 is required for optimal performance. The app falls back to Canvas2D on unsupported browsers.

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:
- Setting up your development environment
- Our coding standards
- The pull request process
- How to report bugs or suggest features

### Areas We Need Help

- Additional brush types and presets
- WebGL shader optimizations
- Accessibility improvements
- Internationalization (i18n)
- Documentation and tutorials

## Roadmap

### Completed
- [x] AuthSig artwork signing integration
- [x] UHRP decentralized storage
- [x] Public gallery for discovering artwork

### Whiteboarding Features
- [ ] Text input and annotations
- [ ] Import images directly to canvas
- [ ] Vector shapes (rectangles, circles, arrows, lines)
- [ ] Real-time collaboration

### Other Planned Features
- [ ] Animation/timeline support
- [ ] Plugin system for custom brushes
- [ ] Cloud/Overlay sync and backup

## License

This project is licensed under the Open BSV License version 4 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [React](https://reactjs.org/) and [Vite](https://vitejs.dev/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)

---

<div align="center">

**Made with ❤️ by the Everdraw community**

[⬆ Back to top](#everdraw)

</div>
