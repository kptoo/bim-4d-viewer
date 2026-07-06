from pathlib import Path

# ==========================================
# CONFIGURATION
# ==========================================

PROJECT_ROOT = Path(r"C:\Users\User\OneDrive\Desktop\Upwork\BIM\bim-4d-viewer")
OUTPUT_FILE = PROJECT_ROOT / "bim-4d-viewer-all-code.txt"

# Directories to skip
SKIP_DIRS = {
    "node_modules",
    "public",
    ".git",
}

# Files to skip
SKIP_FILES = {
    ".gitignore",
    "SimpleWall.ifc",
    "bim-4d-viewer-all-code.txt",
}

# File extensions to include
INCLUDE_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".css",
    ".scss",
    ".sass",
    ".html",
    ".md",
    ".txt",
    ".yml",
    ".yaml",
    ".xml",
    ".sql",
    ".env",
    ".toml",
    ".lock",
    ".mjs",
    ".cjs",
    ".sh",
    ".bat",
}

# ==========================================
# WRITE FILE
# ==========================================

with OUTPUT_FILE.open("w", encoding="utf-8") as outfile:

    outfile.write("=" * 100 + "\n")
    outfile.write("BIM 4D VIEWER PROJECT SOURCE EXPORT\n")
    outfile.write("=" * 100 + "\n\n")

    for file in sorted(PROJECT_ROOT.rglob("*")):

        # Skip directories
        if any(part in SKIP_DIRS for part in file.parts):
            continue

        # Skip non-files
        if not file.is_file():
            continue

        # Skip excluded files
        if file.name in SKIP_FILES:
            continue

        # Skip unwanted extensions
        if file.suffix.lower() not in INCLUDE_EXTENSIONS:
            continue

        relative_path = file.relative_to(PROJECT_ROOT)

        outfile.write("\n")
        outfile.write("=" * 100 + "\n")
        outfile.write(f"FILE: {relative_path}\n")
        outfile.write("=" * 100 + "\n\n")

        try:
            content = file.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            try:
                content = file.read_text(encoding="latin-1")
            except Exception as e:
                outfile.write(f"[Could not read file: {e}]\n")
                continue
        except Exception as e:
            outfile.write(f"[Could not read file: {e}]\n")
            continue

        outfile.write(content)
        outfile.write("\n\n")

print(f"\nDone!")
print(f"Output written to:\n{OUTPUT_FILE}")