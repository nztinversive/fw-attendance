'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Step = 'name' | 'camera' | 'capturing' | 'processing' | 'done' | 'error';

const CAPTURES_REQUIRED = 3;
const CAPTURE_INTERVAL_MS = 1500; // time between auto-captures

export default function EnrollPage() {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [captureCount, setCaptureCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopCamera = useCallback(() => {
    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStep('camera');
    } catch {
      setErrorMsg('Camera access denied. Please allow camera permissions and try again.');
      setStep('error');
    }
  };

  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, 640, 480);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  const startCapturing = useCallback(() => {
    setStep('capturing');
    setCaptureCount(0);
    setPhotos([]);

    const captured: string[] = [];
    let count = 0;

    const doCapture = () => {
      if (count >= CAPTURES_REQUIRED) {
        setStep('processing');
        submitEnrollment(captured);
        return;
      }

      const frame = captureFrame();
      if (frame) {
        captured.push(frame);
        count++;
        setCaptureCount(count);
        setPhotos([...captured]);
      }

      if (count < CAPTURES_REQUIRED) {
        captureTimerRef.current = setTimeout(doCapture, CAPTURE_INTERVAL_MS);
      }
    };

    // First capture after a brief delay
    captureTimerRef.current = setTimeout(doCapture, 500);
  }, [captureFrame]);

  const submitEnrollment = async (capturedPhotos: string[]) => {
    try {
      const res = await fetch('/api/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          department: department.trim(),
          photos: capturedPhotos,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Enrollment failed');
      }

      const result = await res.json();
      stopCamera();
      setResultMsg(
        result.encoded
          ? `Face encoding saved! ${result.photosCount} photos captured.`
          : `${result.photosCount} photos saved. Face will be encoded on next kiosk sync.`
      );
      setStep('done');
    } catch (err) {
      stopCamera();
      setErrorMsg(err instanceof Error ? err.message : 'Enrollment failed');
      setStep('error');
    }
  };

  // Step: Enter Name
  if (step === 'name') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold">
              <span className="text-gold">FW</span> Face Enrollment
            </h1>
            <p className="text-gray-400 mt-2">Add a new team member to the attendance system</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Full Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Smith"
                autoFocus
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gold/60 text-lg"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Production, QC, Electrical"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gold/60"
              />
            </div>

            <button
              onClick={startCamera}
              disabled={!name.trim()}
              className="w-full py-3.5 bg-gold hover:bg-gold-light disabled:opacity-40 disabled:cursor-not-allowed text-black rounded-xl font-semibold text-lg transition"
            >
              Continue to Camera →
            </button>
          </div>

          <div className="text-center mt-4">
            <Link href="/workers" className="text-sm text-gray-500 hover:text-gold transition">
              ← Back to Workers
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Step: Camera Preview (before capturing)
  if (step === 'camera') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg text-center">
          <h2 className="text-2xl font-bold mb-1">
            Enrolling: <span className="text-gold">{name}</span>
          </h2>
          <p className="text-gray-400 mb-4">
            Position your face in the frame, then tap Start
          </p>

          <div className="relative rounded-2xl overflow-hidden border-2 border-gray-700 mb-4">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-[4/3] bg-black object-cover"
            />
            {/* Face guide overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-60 border-2 border-gold/40 rounded-[50%]" />
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={startCapturing}
              className="w-full py-3.5 bg-gold hover:bg-gold-light text-black rounded-xl font-semibold text-lg transition"
            >
              📸 Start Capture
            </button>
            <button
              onClick={() => { stopCamera(); setStep('name'); }}
              className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm transition"
            >
              ← Back
            </button>
          </div>

          <div className="mt-4 text-sm text-gray-500">
            <p>Tips: Look directly at camera • Good lighting • Remove glasses if possible</p>
          </div>
        </div>
      </div>
    );
  }

  // Step: Auto-capturing
  if (step === 'capturing') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg text-center">
          <h2 className="text-2xl font-bold mb-1">
            Capturing: <span className="text-gold">{name}</span>
          </h2>
          <p className="text-gold text-lg mb-4">
            Hold still... {captureCount}/{CAPTURES_REQUIRED}
          </p>

          <div className="relative rounded-2xl overflow-hidden border-2 border-gold mb-4">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-[4/3] bg-black object-cover"
            />
            {/* Flash effect */}
            <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-2 bg-gray-800">
              <div
                className="h-full bg-gold transition-all duration-500"
                style={{ width: `${(captureCount / CAPTURES_REQUIRED) * 100}%` }}
              />
            </div>
          </div>

          {/* Thumbnails */}
          <div className="flex gap-2 justify-center">
            {Array.from({ length: CAPTURES_REQUIRED }).map((_, i) => (
              <div
                key={i}
                className={`w-16 h-16 rounded-lg border-2 overflow-hidden ${
                  i < photos.length ? 'border-gold' : 'border-gray-700'
                }`}
              >
                {photos[i] ? (
                  <img src={photos[i]} alt={`Capture ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-600 text-xs">
                    {i + 1}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Step: Processing
  if (step === 'processing') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-14 w-14 animate-spin rounded-full border-4 border-gold border-t-transparent" />
          <h2 className="text-2xl font-bold">Processing...</h2>
          <p className="text-gray-400 mt-2">Saving photos and generating face encoding</p>
        </div>
      </div>
    );
  }

  // Step: Done
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="text-7xl mb-4">✅</div>
          <h2 className="text-3xl font-bold mb-2">
            <span className="text-gold">{name}</span> Enrolled!
          </h2>
          <p className="text-gray-400 mb-6">{resultMsg}</p>

          <div className="space-y-3">
            <button
              onClick={() => {
                setName('');
                setDepartment('');
                setPhotos([]);
                setCaptureCount(0);
                setStep('name');
              }}
              className="w-full py-3.5 bg-gold hover:bg-gold-light text-black rounded-xl font-semibold text-lg transition"
            >
              Enroll Another Person
            </button>
            <Link
              href="/workers"
              className="block w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm transition"
            >
              ← Back to Workers
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Step: Error
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="text-7xl mb-4">❌</div>
        <h2 className="text-2xl font-bold mb-2">Enrollment Failed</h2>
        <p className="text-gray-400 mb-6">{errorMsg}</p>

        <div className="space-y-3">
          <button
            onClick={() => {
              setPhotos([]);
              setCaptureCount(0);
              setErrorMsg('');
              setStep('name');
            }}
            className="w-full py-3.5 bg-gold hover:bg-gold-light text-black rounded-xl font-semibold text-lg transition"
          >
            Try Again
          </button>
          <Link
            href="/workers"
            className="block w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm transition"
          >
            ← Back to Workers
          </Link>
        </div>
      </div>
    </div>
  );
}
