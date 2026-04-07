"""Face encoding/matching service for fw-gatekeeper.
Uses OpenCV DNN face detector + Facenet ONNX model.
No dlib, no tensorflow, no cmake — pure pip install.
"""

import base64
import io
import os
import urllib.request
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel
import onnxruntime as ort

app = FastAPI(title="Face Encoding Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

MODEL_DIR = Path("/app/models")
MODEL_DIR.mkdir(parents=True, exist_ok=True)

FACENET_URL = "https://huggingface.co/onnxmodelzoo/arcfaceresnet100-8/resolve/main/arcfaceresnet100-8.onnx"
FACENET_PATH = MODEL_DIR / "arcfaceresnet100-8.onnx"

# Lazy globals
_face_detector = None
_session = None


def download_model():
    """Download ArcFace ONNX model if not cached."""
    if not FACENET_PATH.exists():
        print(f"Downloading ArcFace model to {FACENET_PATH}...")
        urllib.request.urlretrieve(FACENET_URL, str(FACENET_PATH))
        print("Download complete.")


def get_face_detector():
    global _face_detector
    if _face_detector is None:
        # OpenCV's built-in DNN face detector (no extra files needed)
        _face_detector = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
    return _face_detector


def get_session():
    global _session
    if _session is None:
        download_model()
        _session = ort.InferenceSession(
            str(FACENET_PATH),
            providers=["CPUExecutionProvider"],
        )
    return _session


class EncodeRequest(BaseModel):
    photos: list[str]

class EncodeResponse(BaseModel):
    encoding: list[float]

class WorkerEncoding(BaseModel):
    worker_id: str
    encoding: list[float]

class MatchRequest(BaseModel):
    photo: str
    encodings: list[WorkerEncoding]

class MatchResult(BaseModel):
    worker_id: str
    confidence: float

class MatchResponse(BaseModel):
    match: Optional[MatchResult] = None


def decode_image(data_url: str) -> np.ndarray:
    """Decode base64 data URL to BGR numpy array."""
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    img = Image.open(io.BytesIO(base64.b64decode(data_url))).convert("RGB")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def detect_and_align(img: np.ndarray) -> Optional[np.ndarray]:
    """Detect face and return 112x112 aligned crop for ArcFace.
    
    Tries multiple detection strategies for robustness:
    1. Haar cascade with relaxed params
    2. Haar cascade with very relaxed params
    3. Assume center crop if image looks like a selfie (fallback)
    """
    detector = get_face_detector()
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Try 1: Standard detection
    faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=3, minSize=(30, 30))
    
    # Try 2: More lenient if nothing found
    if len(faces) == 0:
        faces = detector.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=2, minSize=(20, 20))
    
    # Try 3: Center crop fallback (assumes face is roughly centered, like a selfie)
    if len(faces) == 0:
        h, w = img.shape[:2]
        # Take center 60% of image as face region
        margin_x = int(w * 0.2)
        margin_y = int(h * 0.1)
        face_crop = img[margin_y:h-margin_y, margin_x:w-margin_x]
        if face_crop.shape[0] > 10 and face_crop.shape[1] > 10:
            face_resized = cv2.resize(face_crop, (112, 112))
            return face_resized
        return None

    # Take largest face
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])

    # Add padding
    pad = int(max(w, h) * 0.25)
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(img.shape[1], x + w + pad)
    y2 = min(img.shape[0], y + h + pad)

    face_crop = img[y1:y2, x1:x2]
    face_resized = cv2.resize(face_crop, (112, 112))
    return face_resized


def get_embedding(img: np.ndarray) -> Optional[list[float]]:
    """Get 512-dim face embedding using ArcFace ONNX."""
    face = detect_and_align(img)
    if face is None:
        return None

    session = get_session()

    # Preprocess: BGR -> RGB, normalize, NCHW
    face_rgb = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
    face_float = face_rgb.astype(np.float32) / 255.0
    face_float = (face_float - 0.5) / 0.5  # normalize to [-1, 1]
    face_chw = np.transpose(face_float, (2, 0, 1))  # HWC -> CHW
    batch = np.expand_dims(face_chw, axis=0)  # add batch dim

    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: batch})
    embedding = outputs[0][0]

    # L2 normalize
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm

    return embedding.tolist()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/encode", response_model=EncodeResponse)
def encode(req: EncodeRequest):
    if not req.photos:
        raise HTTPException(400, "No photos provided")

    embeddings = []
    for photo in req.photos:
        try:
            img = decode_image(photo)
            emb = get_embedding(img)
            if emb is not None:
                embeddings.append(emb)
        except Exception:
            continue

    if not embeddings:
        raise HTTPException(422, "No faces detected in any photo")

    avg = np.mean(embeddings, axis=0).tolist()
    # Normalize the average
    norm = float(np.linalg.norm(avg))
    if norm > 0:
        avg = [x / norm for x in avg]

    return EncodeResponse(encoding=avg)


@app.post("/match", response_model=MatchResponse)
def match(req: MatchRequest):
    if not req.encodings:
        return MatchResponse(match=None)

    try:
        img = decode_image(req.photo)
        emb = get_embedding(img)
    except Exception:
        raise HTTPException(422, "Could not process photo")

    if emb is None:
        return MatchResponse(match=None)

    emb_arr = np.array(emb)
    known = np.array([w.encoding for w in req.encodings])

    # Cosine similarity (embeddings are already L2-normalized)
    similarities = known @ emb_arr
    best_idx = int(np.argmax(similarities))
    best_sim = float(similarities[best_idx])

    # ArcFace threshold: 0.4 cosine similarity
    if best_sim < 0.4:
        return MatchResponse(match=None)

    return MatchResponse(match=MatchResult(
        worker_id=req.encodings[best_idx].worker_id,
        confidence=round(best_sim, 4),
    ))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5557)
