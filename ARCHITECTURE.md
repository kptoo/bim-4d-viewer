# 4D BIM Viewer — Architecture Reference

**Version:** 3.0.0 (Phase 5 — Production Release)  
**Last updated:** 2026-07

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Folder Structure](#3-folder-structure)
4. [Application Architecture](#4-application-architecture)
5. [State Management](#5-state-management)
6. [Viewer Architecture](#6-viewer-architecture)
7. [IFC Processing Pipeline](#7-ifc-processing-pipeline)
8. [Data Flow](#8-data-flow)
9. [API Layer](#9-api-layer)
10. [Database Layer](#10-database-layer)
11. [React Query Strategy](#11-react-query-strategy)
12. [Activity Synchronisation](#12-activity-synchronisation)
13. [Layer Synchronisation](#13-layer-synchronisation)
14. [Simulation Engine](#14-simulation-engine)
15. [Filter Engine](#15-filter-engine)
16. [Selection Synchronisation](#16-selection-synchronisation)
17. [Error Handling Strategy](#17-error-handling-strategy)
18. [Performance Design Decisions](#18-performance-design-decisions)
19. [Extension Guidelines](#19-extension-guidelines)

---

## 1. Project Overview

The 4D BIM Viewer is a production-grade browser application for construction progress visualisation. It allows users to:

- Upload and render IFC (Industry Foundation Classes) 3D building models.
- Define construction schedule activities and link them to IFC elements.
- Visualise the 4D timeline: how the building is built over time.
- Organise IFC elements into information layers for project management.
- Inspect element properties, spatial hierarchy, and schedule links.
- Filter the 3D view by information layers.

### Non-Goals

- This is not a full BIM authoring tool (no model editing).
- This is not a clash detection or code compliance checker.
- No user authentication is implemented (demo/internal tool).

---

## 2. Technology Stack

| Layer             | Technology                     | Why                                                    |
|-------------------|--------------------------------|--------------------------------------------------------|
| UI                | React 18 + TypeScript (strict) | Component model; strict mode catches subtle bugs       |
| Build             | Vite + vite-plugin-wasm        | Fast HMR; WASM support for IFC parser                  |
| 3D Rendering      | Three.js + That Open Engine    | Mature WebGL; ThatOpen handles IFC geometry            |
| IFC Parsing       | web-ifc (WASM)                 | Full IFC STEP file support in the browser              |
| State             | Zustand 4                      | Minimal boilerplate; no context provider required       |
| Server Data Cache | TanStack React Query 5         | Fetch deduplication, background refresh, error states  |
| Database          | Neon PostgreSQL (serverless)   | Serverless Postgres; runs from the browser via fetch   |
| DB Driver         | @neondatabase/serverless       | HTTP-based Neon driver; works without a backend server |

---

## 3. Folder Structure

```
src/
├── app/
│   └── providers/
│       ├── ErrorBoundary.tsx       # Panel-level React error boundary
│       └── QueryProvider.tsx       # TanStack Query client + provider
│
├── components/
│   ├── activities/
│   │   ├── ActivityForm.tsx        # Create/edit activity form
│   │   └── ActivityPanel.tsx       # Activity list panel
│   ├── layers/
│   │   ├── LayerAssignmentPanel.tsx # Assign objects to layers
│   │   ├── LayerFilterBar.tsx      # Layer filter toggle bar
│   │   └── LayerPanel.tsx          # Layer management panel
│   ├── zones/
│   │   ├── ExistingZonesPanel.tsx  # Browse + filter existing zones
│   │   ├── ZoneAssignWidget.tsx    # Assign selected objects to a zone
│   │   ├── ZoneFilterBar.tsx       # Active zone filter indicator
│   │   └── ZonePanel.tsx           # Zone CRUD panel
│   ├── ui/
│   │   ├── EmptyState.tsx          # Shared empty-data placeholder
│   │   ├── ErrorMessage.tsx        # Shared error display
│   │   ├── LoadingSpinner.tsx      # Shared loading indicator
│   │   └── index.ts                # Barrel export
│   ├── GanttPanel.tsx              # Gantt chart
│   ├── IFCInspector.tsx            # IFC object property inspector
│   ├── IFCObjectTree.tsx           # Spatial hierarchy tree
│   ├── IFCViewer.tsx               # 3D viewer host + engine bridge
│   ├── Layout.tsx                  # Master dashboard grid
│   ├── SelectionLabel.tsx          # 3D callout label overlay
│   └── TimelineSlider.tsx          # 4D playback slider
│
├── core/
│   ├── filter/
│   │   ├── FilterEngine.ts         # Pure layer/type filter logic
│   │   └── FilterEngine.test.ts
│   ├── ifc/
│   │   ├── ActivityLinker.ts       # Bidirectional activity ↔ IFC link maps
│   │   └── IFCObjectMapper.ts      # Raw IFC data → IFCObject domain type
│   └── simulation/
│       ├── SimulationEngine.ts     # Pure 4D simulation status computation
│       └── SimulationEngine.test.ts
│
├── database/
│   ├── client.ts                   # Neon tagged-template SQL executor
│   └── types.ts                    # Raw database row types
│
├── features/
│   └── viewer/
│       └── IFCUploadZone.tsx       # Drag-and-drop IFC file upload
│
├── hooks/
│   ├── useActivities.ts            # React Query hooks: activity CRUD
│   ├── useAssignments.ts           # React Query hooks: layer assignment CRUD
│   └── useLayers.ts                # React Query hooks: layer CRUD
│
├── services/
│   ├── api/
│   │   ├── activities.api.ts       # DB queries for activities
│   │   ├── assignments.api.ts      # DB queries for layer assignments
│   │   └── layers.api.ts           # DB queries for information layers
│   └── ifc/
│       ├── IFCParserService.ts     # Orchestrates IFC parsing pipeline
│       └── IFCUploadService.ts     # IFC file validation + reading
│
├── store/
│   ├── activity.store.ts           # Zustand: activities + link map
│   ├── layer.store.ts              # Zustand: layers + assignments + filters
│   ├── selection.store.ts          # Zustand: bidirectional selection
│   ├── simulation.store.ts         # Zustand: timeline + simulation state
│   ├── ui.store.ts                 # Zustand: loading states, errors
│   └── viewer.store.ts             # Zustand: IFC objects, load state, engine actions
│
├── styles/
│   ├── activities.css              # Activity panel styles
│   ├── layers.css                  # Layer panel styles
│   ├── upload.css                  # Upload zone styles
│   └── zones.css                   # Zone panel styles
│
├── types/
│   ├── activity.types.ts           # Activity domain types
│   ├── ifc.types.ts                # IFC object, spatial tree types
│   ├── index.ts                    # Barrel export
│   ├── layer.types.ts              # Information layer types
│   ├── simulation.types.ts         # Simulation status, colors
│   └── viewer.types.ts             # Viewer engine event types
│
├── utils/
│   ├── color.utils.ts              # Hex color helpers
│   ├── date.utils.ts               # Date formatting + timeline math
│   └── ifc.utils.ts                # IFC string normalisation helpers
│
├── viewer/
│   ├── ColorManager.ts             # Applies color/opacity overrides to meshes
│   ├── IFCLoader.ts                # Wraps That Open Engine extraction APIs
│   ├── SelectionManager.ts         # Manages mesh highlight state
│   └── ViewerEngine.ts             # Master 3D viewer: Three.js + ThatOpen
│
├── App.css                         # Global styles + CSS variables
├── main.tsx                        # React root + providers
└── vite-env.d.ts                   # Vite env type declarations

migrations/
├── 001_create_layers.sql           # information_layers + layer_assignments tables
└── 002_create_activities.sql       # activities + activity_object_links tables

docs/
├── ARCHITECTURE.md                 # This document
└── DEPLOYMENT.md                   # Deployment guide
```

---

## 4. Application Architecture

The application follows a **Clean Architecture** with strict separation of concerns:

```
┌─────────────────────────────────────────┐
│              React Components           │  ← UI only; no business logic
├─────────────────────────────────────────┤
│         Zustand Stores (6 stores)       │  ← UI state + domain state cache
├─────────────────────────────────────────┤
│     React Query Hooks (3 hook files)    │  ← Server state management
├─────────────────────────────────────────┤
│          API Services (3 files)         │  ← Database query functions
├─────────────────────────────────────────┤
│        Core Engines (3 engines)         │  ← Pure business logic (no React)
├─────────────────────────────────────────┤
│     Viewer Engine (ViewerEngine.ts)     │  ← Three.js + ThatOpen (no React)
└─────────────────────────────────────────┘
```

### Architecture Rules (Non-Negotiable)

**Never:**
- Call `ViewerEngine` directly from React components (use store callbacks).
- Call `SimulationEngine` from JSX (use `useSimulationStore`).
- Call `FilterEngine` from JSX (use `useLayerStore` + `useEffect`).
- Execute SQL in React components (use hooks → services/api).
- Duplicate stores, services, or business logic.

**Always:**
- Use `services/api/*` for all database access.
- Maintain strict separation: components ← stores ← hooks ← services ← DB.
- Keep engines pure (no React, no Three.js in FilterEngine/SimulationEngine).
- Use React Query for all async server state.

---

## 5. State Management

Six Zustand stores — each owns a distinct domain slice:

| Store              | Owns                                             | Key consumers              |
|--------------------|--------------------------------------------------|----------------------------|
| `viewer.store`     | IFC objects, load state, engine callbacks        | IFCViewer, Inspector, Tree |
| `selection.store`  | Selected GlobalIds, primary selection, activity  | All panels (sync hub)      |
| `activity.store`   | Activities array, bidirectional link map         | ActivityPanel, Gantt       |
| `layer.store`      | Layers, assignments, active filter IDs           | LayerPanel, FilterEngine   |
| `simulation.store` | Timeline progress, play state, project dates     | TimelineSlider, IFCViewer  |
| `ui.store`         | Loading flags, error messages, panel visibility  | Layout, all panels         |

### Zustand Selector Pattern

Always use fine-grained selectors to avoid unnecessary re-renders:

```ts
// ✅ Good — only re-renders when `activities` changes
const activities = useActivityStore(s => s.activities)

// ❌ Bad — re-renders on ANY store change
const store = useActivityStore()
```

---

## 6. Viewer Architecture

```
IFCViewer (React component)
│
├── useEffect → creates ViewerEngine once at mount
│   └── ViewerEngine.init() → sets up Three.js scene + ThatOpen
│
├── Registers callbacks in onSceneReady:
│   ├── setEngineActions(zoom, isolate) → viewer.store
│   └── setCameraActions(perspective, top, front, wireframe) → viewer.store
│
├── IFCUploadZone (sub-component)
│   └── onFile(file) → IFCParserService.parseFile(file)
│       ├── IFCUploadService.validateAndRead(file)
│       ├── ViewerEngine.loadIFC(buffer, name)
│       └── IFCLoaderWrapper.extractObjects + extractSpatialTree
│
├── useEffect[simulation] → ViewerEngine.applyColorOverrides(frames)
├── useEffect[selection]  → ViewerEngine.updateSelection(selectedIds)
├── useEffect[filters]    → FilterEngine.applyLayerFilter → ViewerEngine.setVisibility
│
└── useEffect cleanup → ViewerEngine.dispose()
```

### ViewerEngine Contract

`ViewerEngine` is the ONLY interface to Three.js from outside `src/viewer/`.

Public API:
- `init()` — Initializes Three.js scene, camera, renderer, controls.
- `loadIFC(buffer, name)` — Loads an IFC model from a Uint8Array.
- `unloadAll()` — Removes all loaded models from the scene.
- `applyColorOverrides(map)` — Applies simulation/selection colors.
- `setObjectVisibility(globalIds, visible)` — Shows/hides objects.
- `zoomToObject(globalId)` — Animates camera to frame an object.
- `isolateObjects(globalIds)` — Hides everything except the given objects.
- `setCameraPerspective/Top/Front()` — Sets camera projection + position.
- `setWireframe(enabled)` — Toggles wireframe overlay.
- `dispose()` — Cleans up all Three.js resources.

---

## 7. IFC Processing Pipeline

```
User drops/selects an IFC file
         │
         ▼
IFCUploadService.validateAndRead(file)
  • Extension check (.ifc / .ifczip)
  • Size check (max 200MB)
  • Magic bytes check (ISO-10303-21 header)
  • Returns Uint8Array buffer
         │
         ▼
ViewerEngine.loadIFC(buffer, modelName)
  • Passes buffer to ThatOpen FragmentsManager
  • Three.js mesh is added to the scene
  • Returns FragmentsModel instance
         │
         ▼
IFCLoaderWrapper (runs in parallel):
  ├── extractObjects(model) → IFCObject[]
  │     For each element: GlobalId, name, type, properties
  ├── extractSpatialTree(model) → IFCSpatialTree
  │     Builds Project → Site → Building → Storey → Element hierarchy
  └── extractVoidFillRelations(model) → opening/door relationships
         │
         ▼
viewer.store.setIFCObjects(objects)
viewer.store.setSpatialTree(tree)
         │
         ▼
useGlobalIdLayerMap() → patches ifcObjects[].layerIds from DB
useGlobalIdActivityMap() → patches ifcObjects[].activityIds from DB
```

---

## 8. Data Flow

### IFC Element Selection

```
User clicks 3D mesh
    │
ViewerEngine.handleClick()
    │ raycasts → resolves GlobalId
    │
onObjectPicked(globalId, isMulti)
    │
useSelectionStore.selectObject(globalId)
    │
    ├── IFCViewer.useEffect[selection] → ViewerEngine.updateSelection()
    ├── IFCInspector reads primaryGlobalId
    ├── GanttPanel highlights matching activity rows
    └── ActivityPanel highlights matching activity cards
```

### Activity Selection

```
User clicks Gantt bar / Activity card
    │
useSelectionStore.selectActivity(activityId, firstLinkedGlobalId)
    │
    ├── IFCViewer.useEffect[selection] → ViewerEngine.updateSelection()
    ├── GanttPanel highlights the selected bar
    └── ActivityPanel highlights the card
```

---

## 9. API Layer

All database access goes through `src/services/api/`:

| File                  | Functions                                                           |
|-----------------------|---------------------------------------------------------------------|
| `activities.api.ts`   | `getActivities`, `createActivity`, `updateActivity`, `deleteActivity`, `buildGlobalIdToActivityIdsMap` |
| `assignments.api.ts`  | `fetchAllAssignments`, `assignObjectsToLayer`, `removeAssignment`, `buildGlobalIdToLayerIdsMap` |
| `layers.api.ts`       | `fetchLayers`, `createLayer`, `renameLayer`, `updateLayerColor`, `deleteLayer`, `fetchLayerCounts` |

**Pattern:** All functions use the `sql` tagged template from `database/client.ts`. 
They accept typed parameters, run parameterised queries, and return typed domain objects.

---

## 10. Database Layer

### Tables

```sql
-- Information layers (zones, costs, resources, etc.)
information_layers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'custom',
  color       TEXT        NOT NULL DEFAULT '#3498DB',
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)

-- Links layers to IFC objects by GlobalId
layer_assignments (
  id          UUID PRIMARY KEY,
  layer_id    UUID REFERENCES information_layers(id) ON DELETE CASCADE,
  global_id   TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (layer_id, global_id)
)

-- Construction schedule activities
activities (
  id           UUID        PRIMARY KEY,
  name         TEXT        NOT NULL,
  start_date   DATE        NOT NULL,
  end_date     DATE        NOT NULL,
  progress     INTEGER     DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  color        TEXT        NOT NULL DEFAULT '#3498DB',
  parent_id    UUID        REFERENCES activities(id) ON DELETE SET NULL,
  dependencies UUID[]      NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
)

-- Links activities to IFC objects by GlobalId
activity_object_links (
  id          UUID PRIMARY KEY,
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  global_id   TEXT NOT NULL,
  linked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_id, global_id)
)
```

### GlobalId as the bridge

IFC objects are runtime data (parsed from the uploaded file into Three.js). They are **not stored in the database**. The `global_id` column is the stable IFC identifier that bridges runtime objects (in the viewer) with persisted data (in the DB).

---

## 11. React Query Strategy

### Query Key Conventions

```ts
// Activities
activityKeys.all         = ['activities']
activityKeys.detail(id)  = ['activities', id]
activityKeys.globalIdMap = ['activities', 'globalIdMap']

// Layers
layerKeys.all            = ['layers']
layerKeys.counts         = ['layers', 'counts']
layerKeys.detail(id)     = ['layers', id]

// Assignments
assignmentKeys.all         = ['assignments']
assignmentKeys.byLayer(id) = ['assignments', 'layer', id]
assignmentKeys.byGlobalId  = ['assignments', 'globalIdMap']
```

### Cache Configuration

```ts
{
  staleTime: 60_000,           // 1 min — no background refetch during active session
  gcTime:    5 * 60_000,       // 5 min — garbage collect inactive entries
  retry:     2,                // Retry failed queries twice
  refetchOnWindowFocus: false, // BIM sessions use tab-switching frequently
}
```

### Optimistic Updates

Rename, color change, and delete operations use the optimistic update pattern:
1. Cancel in-flight queries.
2. Snapshot the current cache.
3. Apply the change immediately.
4. On error → roll back to snapshot.
5. On settle → invalidate to sync with server.

---

## 12. Activity Synchronisation

```
DB (activities + activity_object_links)
        │
   getActivities()
        │
  useActivities() hook
        │
  setActivities() → activity.store
        │
  ActivityLinker.buildLinkMap(activities)
    ├── objectToActivities: Map<GlobalId, ActivityId[]>
    └── activityToObjects:  Map<ActivityId, GlobalId[]>
        │
  ┌────┴──────────────────────────────────────────────┐
  │                                                    │
  getActivitiesForObject(globalId)       getObjectsForActivity(activityId)
  → Used by Inspector                    → Used by selection → viewer highlight
```

---

## 13. Layer Synchronisation

```
DB (information_layers + layer_assignments)
        │
   ┌────┴──────────────────────────────┐
   │                                    │
fetchLayers()                    buildGlobalIdToLayerIdsMap()
   │                                    │
useLayers() → layer.store       useGlobalIdLayerMap()
                                        │
                                 patches IFCObject.layerIds
                                        │
                              FilterEngine.applyLayerFilter(objects, activeLayerIds)
                                        │
                              ViewerEngine.setObjectVisibility(hidden, false)
```

---

## 14. Simulation Engine

`SimulationEngine` is a **pure static class** — it takes data and returns results. No side effects, no React, no Three.js.

```ts
// Compute all frames (batch — preferred for performance)
const frames = SimulationEngine.computeFrames(currentDate, activities)
// → Map<globalId, { status: 'future'|'active'|'completed', color: '#...' }>

// Apply to viewer
ViewerEngine.applyColorOverrides(frames)
```

**Status resolution rules:**
- `completed` — activity.endDate < currentDate
- `active`    — activity.startDate ≤ currentDate ≤ activity.endDate
- `future`    — activity.startDate > currentDate
- Priority: `active` > `completed` > `future` (when objects overlap activities)

---

## 15. Filter Engine

`FilterEngine` is a **pure static class**. Given objects and active layer IDs, returns which GlobalIds are visible and which are hidden.

```ts
const result = FilterEngine.applyLayerFilter(ifcObjects, activeLayerIds)
// → { visible: string[], hidden: string[] }

ViewerEngine.setObjectVisibility(result.hidden, false)
ViewerEngine.setObjectVisibility(result.visible, true)
```

**Filter logic:** AND semantics — an object must belong to ALL active layers to be visible.

---

## 16. Selection Synchronisation

The `selection.store` is the **single source of truth** for all selection state.

```
Viewer click
    → selectObject(globalId)
        ├── Viewer: highlight mesh (via useEffect in IFCViewer)
        ├── Inspector: show properties
        ├── Tree: highlight node
        ├── Gantt: highlight activity rows where globalId is in linkedGlobalIds
        └── Activities: highlight card where globalId is in linkedGlobalIds

Gantt/Activity click
    → selectActivity(activityId, firstGlobalId)
        ├── Viewer: highlight all linked meshes
        ├── Inspector: show properties for firstGlobalId
        ├── Gantt: highlight the selected bar
        └── Activities: highlight the selected card
```

---

## 17. Error Handling Strategy

### Error Boundaries

Every major panel is wrapped in an `<ErrorBoundary>`:
- A crash in one panel does not crash the rest of the application.
- The boundary shows a fallback UI with "Try Again" and "Reload Page" buttons.
- Error details are logged to the console for debugging.

### API Error Handling

- React Query surfaces errors via `isError` + `error` in each hook.
- Panels render `<ErrorMessage>` with an optional retry callback.
- Silent failures are never allowed — every error surfaces in the UI.
- Technical error messages go to the console; user-facing messages are descriptive.

### IFC Load Errors

- `IFCUploadService` returns a typed `IFCValidationResult` (never throws).
- `IFCParserService` catches all errors and returns a typed `ParseResult`.
- `ViewerEngine.onError` callback propagates engine errors to `ui.store`.

---

## 18. Performance Design Decisions

### React

- `GanttRow`, `ActivityCard`, and `LayerRow` are wrapped in `React.memo`.
- All event handlers in list items use `useCallback` to stabilise references.
- Gantt chart uses `useMemo` for `deriveProjectRange` and `computeAllFrames`.
- `SelectionLabel` uses a RAF loop with direct DOM mutation — never React state.

### Zustand

- All store subscriptions use fine-grained selectors (one field per selector).
- `isSelected()` uses a `Set` for O(1) membership checks.
- `getActivitiesForObject()` and `getObjectsForActivity()` use the pre-computed `LinkMap`.

### React Query

- `staleTime: 30_000` on activity queries prevents re-fetching during active editing.
- `refetchOnWindowFocus: false` prevents disruptive background refreshes.
- Query keys are structured hierarchically so targeted invalidation is possible.

### Viewer

- `applyColorOverrides` batches all material changes in a single Three.js pass.
- `SelectionManager` only changes materials for selected/deselected objects, not the whole scene.
- `RequestAnimationFrame` renders only when dirty (Three.js `renderer.setAnimationLoop`).

---

## 19. Extension Guidelines

### Adding a New Panel

1. Create `src/components/MyPanel.tsx`.
2. Wrap with `<ErrorBoundary context="My Panel">` in `Layout.tsx`.
3. Add a tab button in the right panel tab bar (Layout.tsx).
4. Add loading/empty/error states using `<LoadingSpinner>`, `<EmptyState>`, `<ErrorMessage>`.

### Adding a New Domain Entity

1. Add TypeScript types to `src/types/myentity.types.ts`.
2. Export from `src/types/index.ts`.
3. Add SQL migration in `migrations/003_create_myentity.sql`.
4. Add DB row types to `src/database/types.ts`.
5. Add API service functions in `src/services/api/myentity.api.ts`.
6. Add React Query hooks in `src/hooks/useMyEntity.ts`.
7. Add a Zustand store if the entity needs to be shared across panels.

### Adding a New Filter Type

1. Extend `FilterEngine.ts` with a new static method.
2. Add the filter state to `layer.store.ts` or a new dedicated store.
3. Call the filter in `IFCViewer.tsx`'s filter `useEffect`.
4. Never call FilterEngine directly from JSX — always via a hook/effect.

### Modifying the Database Schema

1. Add a new migration file (do not modify existing ones).
2. Run the migration against the Neon database.
3. Add/update row types in `database/types.ts`.
4. Update API service functions as needed.
5. Update TypeScript types if the domain model changes.

---

*This document should be kept up to date whenever the architecture changes.*  
*For deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).*