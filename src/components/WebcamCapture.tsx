'use client';

import { useRef, useState, useCallback } from 'react';

interface WebcamCaptureProps {
  onCapture: (base64: string) => void;
}

export default function WebcamCapture({ onCapture }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streaming, setStreaming] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreaming(true);
      }
    } catch {
      alert('Camera access denied');
    }
  }, []);

  const capture = useCallback(() => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(videoRef.current, 0, 0, 320, 240);
    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    onCapture(base64);

    // Stop camera
    const stream = videoRef.current.srcObject as MediaStream;
    stream?.getTracks().forEach((t) => t.stop());
    setStreaming(false);
  }, [onCapture]);

  return (
    <div className="space-y-2">
      <video ref={videoRef} autoPlay playsInline className="w-full max-w-xs rounded-lg bg-gray-800" />
      <div className="flex gap-2">
        {!streaming ? (
          <button onClick={startCamera} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm">
            📷 Open Camera
          </button>
        ) : (
          <button onClick={capture} className="px-3 py-1.5 bg-gold hover:bg-gold-light text-black rounded text-sm font-medium">
            📸 Snap Photo
          </button>
        )}
      </div>
    </div>
  );
}
