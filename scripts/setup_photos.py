#!/usr/bin/env python3
# Prepares the local Python/OpenCV face-presence checker used by PhotoService.
# Run during setup, not on every upload; detection is local and is not identity proof.

"""Install the local photo checker. Images never leave the API host."""
from pathlib import Path
import hashlib
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / "apps/backend/photo-check"
MODEL_SHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"


def setup():
    if sys.version_info < (3, 12):
        raise SystemExit(
            "Photo checking needs Python 3.12 or newer. Run this script with that Python interpreter."
        )
    model = CHECKER / "models/yunet-2023mar.onnx"
    if (
        not model.is_file()
        or hashlib.sha256(model.read_bytes()).hexdigest() != MODEL_SHA256
    ):
        raise SystemExit(
            "Bundled YuNet model is missing or changed. Restore the checked-in model before continuing."
        )
    environment = CHECKER / ".venv"
    if not environment.exists():
        venv.create(environment, with_pip=True)
    python = environment / (
        "Scripts/python.exe" if sys.platform == "win32" else "bin/python"
    )
    subprocess.run(
        [str(python), "-m", "pip", "install", "-r", str(CHECKER / "requirements.txt")],
        check=True,
    )
    subprocess.run(
        [str(python), "-c", 'import cv2; assert hasattr(cv2, "FaceDetectorYN")'],
        check=True,
    )
    print(
        "Local face-presence checker ready. No external image-analysis service is used."
    )


if __name__ == "__main__":
    setup()
