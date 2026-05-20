#!/usr/bin/env python3
"""Pad portrait avatar to square (no crop) and export web + desktop icons."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "frontend" / "public"
DESKTOP_ICON = ROOT / "desktop" / "build" / "icon.png"
ORIGINAL = Path("/tmp/avatar-original.jpg")


def load_source() -> Image.Image:
    if not ORIGINAL.exists():
        ORIGINAL.write_bytes(
            subprocess.check_output(
                ["git", "show", "d43bf8d^:frontend/public/avatar.png"],
                cwd=ROOT,
            )
        )
    return Image.open(ORIGINAL).convert("RGBA")


def pad_to_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 255))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas


def save_scaled(img: Image.Image, path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.resize((size, size), Image.Resampling.LANCZOS).save(path, format="PNG", optimize=True)


def main() -> None:
    src = load_source()
    square = pad_to_square(src)
    save_scaled(square, PUBLIC / "avatar.png", 512)
    save_scaled(square, PUBLIC / "icon-512.png", 512)
    save_scaled(square, PUBLIC / "icon-192.png", 192)
    save_scaled(square, PUBLIC / "apple-touch-icon.png", 180)
    save_scaled(square, DESKTOP_ICON, 1024)
    print(f"OK: padded {src.size[0]}x{src.size[1]} -> {square.size[0]}x{square.size[1]}")


if __name__ == "__main__":
    main()
