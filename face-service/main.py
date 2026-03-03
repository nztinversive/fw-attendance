"""Face encoding/matching service for fw-gatekeeper."""

import base64
import io
from typing import Optional

import face_recognition
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

app = FastAPI(title="Face Encoding Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


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
    """Decode a base64 data URL or raw base64 to a numpy image array."""
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    img = Image.open(io.BytesIO(base64.b64decode(data_url))).convert("RGB")
    return np.array(img)


def get_encoding(img: np.ndarray) -> Optional[np.ndarray]:
    """Get face encoding from image, returns None if no face found."""
    encodings = face_recognition.face_encodings(img)
    return encodings[0] if encodings else None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/encode", response_model=EncodeResponse)
def encode(req: EncodeRequest):
    if not req.photos:
        raise HTTPException(400, "No photos provided")

    encodings = []
    for photo in req.photos:
        try:
            img = decode_image(photo)
            enc = get_encoding(img)
            if enc is not None:
                encodings.append(enc)
        except Exception as e:
            continue  # skip bad photos

    if not encodings:
        raise HTTPException(422, "No faces detected in any photo")

    avg = np.mean(encodings, axis=0)
    return EncodeResponse(encoding=avg.tolist())


@app.post("/match", response_model=MatchResponse)
def match(req: MatchRequest):
    if not req.encodings:
        return MatchResponse(match=None)

    try:
        img = decode_image(req.photo)
        enc = get_encoding(img)
    except Exception:
        raise HTTPException(422, "Could not process photo")

    if enc is None:
        return MatchResponse(match=None)

    known = np.array([w.encoding for w in req.encodings])
    distances = face_recognition.face_distance(known, enc)
    best_idx = int(np.argmin(distances))
    best_dist = distances[best_idx]

    if best_dist > 0.6:  # threshold
        return MatchResponse(match=None)

    confidence = round(1.0 - best_dist, 4)
    return MatchResponse(match=MatchResult(
        worker_id=req.encodings[best_idx].worker_id,
        confidence=confidence,
    ))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5557)
