"""Make src/ importable without installing the package (src layout)."""

import sys
from pathlib import Path

SRC = str(Path(__file__).resolve().parent / "src")
if SRC not in sys.path:
    sys.path.insert(0, SRC)
