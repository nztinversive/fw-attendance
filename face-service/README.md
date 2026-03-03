# Face Encoding Service

FastAPI service for face encoding and matching, used by fw-gatekeeper.

## Endpoints

- `GET /health` — health check
- `POST /encode` — `{ photos: string[] }` → `{ encoding: number[] }` (128-dim average embedding)
- `POST /match` — `{ photo: string, encodings: [{ worker_id, encoding }] }` → `{ match: { worker_id, confidence } | null }`

Photos are base64 JPEG data URLs. Match threshold: 0.6 distance.

## Run

```bash
py -m pip install -r requirements.txt
py main.py
# or: start.bat
```

Runs on port 5557.
