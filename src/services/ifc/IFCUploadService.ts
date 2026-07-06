/**
 * IFCUploadService — Validates and prepares IFC files for loading.
 *
 * Handles all file I/O concerns before the model reaches
 * the ViewerEngine. Zero React dependencies.
 */

export interface IFCValidationResult {
  valid:   boolean
  error?:  string
  buffer?: Uint8Array
  fileName: string
  fileSize: number
}

/** Maximum supported IFC file size: 200MB */
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024

/** Supported IFC MIME types and extensions */
const SUPPORTED_EXTENSIONS = ['.ifc', '.ifczip']

export class IFCUploadService {
  /**
   * Validates an IFC File object and reads it into a Uint8Array buffer.
   * Returns a typed result — never throws.
   *
   * @param file - The File object from an <input> or drag-and-drop event
   * @returns IFCValidationResult
   */
  static async validateAndRead(file: File): Promise<IFCValidationResult> {
    const base: Pick<IFCValidationResult, 'fileName' | 'fileSize'> = {
      fileName: file.name,
      fileSize: file.size,
    }

    // ── Extension check ──────────────────────────────────────
    const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      return {
        ...base,
        valid: false,
        error: `Unsupported file type "${extension}". Please upload a .ifc file.`,
      }
    }

    // ── Size check ───────────────────────────────────────────
    if (file.size === 0) {
      return { ...base, valid: false, error: 'The file is empty.' }
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
      return {
        ...base,
        valid: false,
        error: `File is too large (${sizeMB} MB). Maximum supported size is 200 MB.`,
      }
    }

    // ── Read file ────────────────────────────────────────────
    try {
      const arrayBuffer = await file.arrayBuffer()
      const buffer      = new Uint8Array(arrayBuffer)

      // ── IFC magic bytes check ─────────────────────────────
      // Valid IFC files start with "ISO-10303-21" in ASCII
      if (!IFCUploadService.hasIFCMagicBytes(buffer)) {
        return {
          ...base,
          valid: false,
          error: 'File does not appear to be a valid IFC file (missing ISO-10303-21 header).',
        }
      }

      return { ...base, valid: true, buffer }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read file'
      return { ...base, valid: false, error: `Could not read file: ${message}` }
    }
  }

  /**
   * Checks for the IFC STEP file magic bytes (ISO-10303-21).
   * This is a fast sanity check before passing to the WASM parser.
   */
  private static hasIFCMagicBytes(buffer: Uint8Array): boolean {
    // "ISO-10303-21" in ASCII = [73, 83, 79, 45, 49, 48, 51, 48, 51, 45, 50, 49]
    const magic  = 'ISO-10303-21'
    const header = new TextDecoder().decode(buffer.slice(0, 100))
    return header.includes(magic)
  }

  /**
   * Formats a file size in bytes to a human-readable string.
   */
  static formatFileSize(bytes: number): string {
    if (bytes < 1024)        return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}