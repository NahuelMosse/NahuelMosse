"""Isolates the subject and boosts local contrast so the ASCII pass has real highlights.

    python scripts/portrait/prep_photo.py <photo> [out.png]

Writes a grayscale+alpha PNG: luminance after CLAHE, alpha from rembg's subject mask.
"""
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from rembg import new_session, remove

src = Path(sys.argv[1])
out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).with_name(".cache") / "prepped.png"
out.parent.mkdir(parents=True, exist_ok=True)

# rembg's default (BiRefNet) asks for ~8 GB on CPU; IS-Net is plenty for a head-and-shoulders crop.
rgba = np.array(remove(Image.open(src).convert("RGB"), session=new_session("isnet-general-use")))
alpha = rgba[:, :, 3]

gray = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2GRAY)
gray = cv2.createCLAHE(clipLimit=2.4, tileGridSize=(8, 8)).apply(gray)

# Stretch the subject's own range to 0..255 so the glyph ramp is used end to end.
subject = gray[alpha > 128]
lo, hi = np.percentile(subject, [2, 98])
gray = np.clip((gray.astype(np.float32) - lo) * 255.0 / max(hi - lo, 1), 0, 255).astype(np.uint8)

Image.fromarray(np.dstack([gray, alpha]), "LA").save(out)
print(f"{out}  {gray.shape[1]}x{gray.shape[0]}")
