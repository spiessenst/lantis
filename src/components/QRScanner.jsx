import { useEffect, useRef, useState } from "react";

/**
 * Mobile QR Scanner overlay component
 *
 * Props
 * - onDetected: (value: string) => void
 * - onClose: () => void
 *
 * Uses BarcodeDetector when available (Chrome, Android). Falls back to @zxing/browser if installed.
 * Torch toggle is attempted when supported.
 */
export default function QRScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const zxingReaderRef = useRef(null);

  const [error, setError] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [usingZXing, setUsingZXing] = useState(false);

  useEffect(() => {
    let stopped = false;

    const start = async () => {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();

        const [track] = stream.getVideoTracks();
        trackRef.current = track;

        // Prefer native BarcodeDetector
        const hasBarcodeDetector = "BarcodeDetector" in window;
        if (hasBarcodeDetector) {
          const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          let rafId = 0;
          const scan = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              if (codes && codes.length) {
                const value = codes[0].rawValue || codes[0].displayValue;
                if (value) {
                  onDetected?.(value);
                  return; // do not schedule next frame
                }
              }
            } catch (e) {
              // ignore transient errors
            }
            rafId = requestAnimationFrame(scan);
          };
          rafId = requestAnimationFrame(scan);

          return () => cancelAnimationFrame(rafId);
        }

        // Fallback: @zxing/browser (optional dependency)
        setUsingZXing(true);
        const { BrowserMultiFormatReader, NotFoundException } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        zxingReaderRef.current = reader;
        const previewElem = videoRef.current;

        const loop = async () => {
          if (stopped) return;
          try {
            const result = await reader.decodeOnceFromVideoElement(previewElem);
            if (result?.text) onDetected?.(result.text);
          } catch (e) {
            if (!(e instanceof NotFoundException)) {
              console.warn("ZXing decode error", e);
            }
            // continue trying
            requestAnimationFrame(loop);
          }
        };
        loop();
      } catch (e) {
        setError(e?.message || "Camera access failed");
      }
    };

    start();

    return () => {
      stopped = true;
      try {
        zxingReaderRef.current?.reset();
      } catch {}
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [onDetected]);

  const toggleTorch = async () => {
    try {
      const track = trackRef.current;
      if (!track) return;
      const capabilities = track.getCapabilities?.();
      if (!capabilities || !capabilities.torch) return; // not supported
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch (e) {
      console.warn("Torch toggle failed", e);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/90 text-white flex flex-col">
      <div className="absolute inset-0 pointer-events-none">
        {/* framing */}
        <div className="absolute inset-0 grid place-items-center">
          <div className="w-64 h-64 rounded-xl border-2 border-white/80" />
        </div>
      </div>

      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />

      <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2">
        <button
          onClick={onClose}
          className="bg-white/90 text-black px-4 py-2 rounded-full shadow"
        >
          Close
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTorch}
            className="bg-white/90 text-black px-3 py-2 rounded-full shadow disabled:opacity-50"
            disabled={!trackRef.current || !(trackRef.current.getCapabilities?.()?.torch)}
            title="Toggle flashlight"
          >
            🔦 Torch
          </button>
          {usingZXing && (
            <span className="text-xs bg-white/20 px-2 py-1 rounded">ZXing fallback</span>
          )}
        </div>
      </div>

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600/90 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
