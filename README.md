# 🏗️ 4D BIM Viewer — Client Demo MVP

A professional browser-based 4D BIM Viewer for construction progress visualization, designed as a client demonstration platform.
Test the live viewer here:

![4D BIM Viewer](https://bim-4d-viewer.vercel.app/)

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## ✨ Features

- **3D IFC Model Viewer** — Three.js scene with orbit controls and color-coded construction elements
- **4D Timeline Slider** — Scrub through construction dates, or press Play for auto-animation
- **Gantt Chart** — Custom-built schedule panel with bidirectional selection
- **IFC Inspector** — Properties panel showing GlobalId, type, status, and linked task
- **Bidirectional Linking** — Click 3D element → highlights Gantt task; click Gantt → highlights 3D element
- **Color-coded Progress** — Green (completed), Blue (active), Gray (upcoming), Gold (selected)

## 🗂 Architecture

```
src/
├── components/
│   ├── Layout.tsx          ← Master dashboard grid
│   ├── IFCViewer.tsx       ← Three.js 3D scene + raycasting
│   ├── GanttPanel.tsx      ← Custom SVG/HTML Gantt chart
│   ├── TimelineSlider.tsx  ← 4D playback control
│   └── IFCInspector.tsx    ← Properties inspector panel
└── state/
    └── bimStore.ts         ← Zustand global store
```

## 🛠 Tech Stack

- React 18 + TypeScript
- Three.js (3D rendering + OrbitControls)
- Zustand (state management)
- Vite (build tool)

## 🎮 How to Use

1. **Drag** the 3D viewport to orbit; scroll to zoom
2. **Click** any 3D element to select it and see its properties
3. **Drag** the timeline slider to simulate construction progress
4. **Press ▶** to auto-play the 4D simulation
5. **Click** a Gantt task row to highlight related 3D elements
