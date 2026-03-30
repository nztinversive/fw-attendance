FROM python:3.11-slim

# Runtime deps only (no cmake/build-essential — we use pre-built dlib wheel)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libopenblas0 \
    liblapack3 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dlib from pre-built wheel (avoids 512MB RAM cmake OOM on free tier)
RUN pip install --no-cache-dir dlib-bin

# face_recognition will see dlib already installed and skip building it
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 5557

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5557"]
