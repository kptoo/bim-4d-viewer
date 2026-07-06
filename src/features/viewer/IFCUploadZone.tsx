import { useRef, useState, useCallback, type DragEvent } from 'react'
import { useViewerStore } from '../../store/viewer.store'
import { useSelectionStore } from '../../store/selection.store'
import { useSimulationStore } from '../../store/simulation.store'
import { useLayerStore } from '../../store/layer.store'
import { IFCParserService } from '../../services/ifc/IFCParserService'
import type { ViewerEngine } from '../../viewer/ViewerEngine'

interface IFCUploadZoneProps {
  viewerEngine: ViewerEngine | null
}

export default function IFCUploadZone({ viewerEngine }: IFCUploadZoneProps) {
  const inputRef                    = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Viewer store
  const setModelLoadState   = useViewerStore(s => s.setModelLoadState)
  const setModelError       = useViewerStore(s => s.setModelError)
  const setIFCObjects       = useViewerStore(s => s.setIFCObjects)
  const setModelMeta        = useViewerStore(s => s.setModelMeta)
  const modelLoadState      = useViewerStore(s => s.modelLoadState)
  const modelError          = useViewerStore(s => s.modelError)
  const sceneReady          = useViewerStore(s => s.sceneReady)
  const resetModel          = useViewerStore(s => s.resetModel)

  // Cross-store cleanup for model replacement
  const clearSelection       = useSelectionStore(s => s.clearSelection)
  const deactivateSimulation = useSimulationStore(s => s.deactivateSimulation)
  const clearLayerFilters    = useLayerStore(s => s.clearFilters)

  const handleFile = useCallback(async (file: File) => {
    if (!viewerEngine || !sceneReady) {
      setModelError('3D viewer is still initializing. Please wait a moment and try again.')
      setModelLoadState('error')
      return
    }

    // ── Step 1: Unload the previous 3D model ─────────────────
    // model.dispose() frees the worker thread slot, shared
    // MaterialManager entries, GPU tile geometry, and removes
    // model.object from the Three.js scene.
    // Must happen before store resets so colour/selection effects
    // that read loadedModels do not fire against stale data.
    try {
      await viewerEngine.unloadAll()
    } catch (err) {
      console.warn('[IFCUploadZone] unloadAll warning:', err)
      // Non-fatal — proceed with load
    }

    // ── Step 2: Clear all application state ──────────────────
    clearSelection()          // Inspector empties, Gantt deselects
    deactivateSimulation()    // Removes simulation colour overlay
    clearLayerFilters()       // Resets layer filter panel

    // ── Step 3: Transition to loading state ──────────────────
    setModelLoadState('loading')
    setModelError(null)
    setModelMeta(file.name, file.size)

    // ── Step 4: Parse and load ────────────────────────────────
    const parser = new IFCParserService(viewerEngine)
    const result = await parser.parseFile(file)

    if (!result.success && result.ifcObjects.length === 0) {
      setModelLoadState('error')
      setModelError(result.error ?? 'Unknown error loading IFC file.')
      return
    }

    // IMPORTANT: set ifcObjects BEFORE setting modelLoadState to 'loaded'
    // so any component reading ifcObjects.length on state change
    // already has the correct value.
    setIFCObjects(result.ifcObjects)
    setModelLoadState('loaded')

    if (result.error) {
      console.warn('[IFCUploadZone] Partial success:', result.error)
    }

  }, [
    viewerEngine,
    sceneReady,
    setModelLoadState,
    setModelError,
    setModelMeta,
    setIFCObjects,
    clearSelection,
    deactivateSimulation,
    clearLayerFilters,
  ])

  const handleDragOver  = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragging(false), [])

  const handleDrop      = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleInputChange = useCallback(() => {
    const file = inputRef.current?.files?.[0]
    if (file) handleFile(file)
    // Reset input so same file can be re-selected
    if (inputRef.current) inputRef.current.value = ''
  }, [handleFile])

  // ── Loading ───────────────────────────────────────────────
  if (modelLoadState === 'loading') {
    return (
      <div className="upload-zone upload-zone--loading">
        <div className="upload-spinner" />
        <p className="upload-zone__title">Parsing IFC Model...</p>
        <p className="upload-zone__subtitle">
          This may take up to 30 seconds for large files.
        </p>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────
  if (modelLoadState === 'error') {
    return (
      <div className="upload-zone upload-zone--error">
        <div className="upload-zone__icon">⚠️</div>
        <p className="upload-zone__title">Failed to Load IFC</p>
        <p className="upload-zone__error">{modelError}</p>
        <button
          className="upload-zone__btn"
          onClick={() => resetModel()}
        >
          Try Again
        </button>
      </div>
    )
  }

  // ── Viewer initializing ───────────────────────────────────
  if (!sceneReady) {
    return (
      <div className="upload-zone upload-zone--loading">
        <div className="upload-spinner" />
        <p className="upload-zone__title">Initializing Viewer...</p>
        <p className="upload-zone__subtitle">Setting up 3D engine.</p>
      </div>
    )
  }

  // ── Idle — ready to accept a file ─────────────────────────
  return (
    <div
      className={`upload-zone${isDragging ? ' upload-zone--dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".ifc,.ifczip"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
      <div className="upload-zone__icon">🏗️</div>
      <p className="upload-zone__title">Upload IFC Model</p>
      <p className="upload-zone__subtitle">
        Drag and drop your <strong>.ifc</strong> file here, or click to browse
      </p>
      <button
        className="upload-zone__btn"
        onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
      >
        Browse Files
      </button>
      <p className="upload-zone__hint">
        Supported: IFC 2x3, IFC 4 · Maximum size: 200 MB
      </p>
    </div>
  )
}