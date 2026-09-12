"""Local face presence only: no identity matching, demographics or liveness."""
import sys
from pathlib import Path
import cv2
cv2.setNumThreads(1)
try:
    image = cv2.imread(sys.argv[1])
    if image is None:
        sys.exit(23)
    h, w = image.shape[:2]
    detector = cv2.FaceDetectorYN.create(str(Path(__file__).parent / 'models/yunet-2023mar.onnx'), '', (w, h), 0.85, 0.3, 5000)
    _, faces = detector.detect(image)
    if faces is None or len(faces) == 0:
        sys.exit(23)
    if len(faces) != 1:
        sys.exit(24)
    # Require a useful portrait rather than a tiny face in a landscape image.
    if faces[0][2] * faces[0][3] < w * h * 0.025:
        sys.exit(23)
    sys.exit(0)
except Exception:
    sys.exit(25)
