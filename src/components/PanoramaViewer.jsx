import { useEffect, useRef, useState } from "react";
import { Viewer as PSVViewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";
import { GyroscopePlugin } from "@photo-sphere-viewer/gyroscope-plugin";
import { X } from "lucide-react";
/**
 * Props:
 *  - image (string, required): URL to the equirectangular panorama
 *  - onClose (fn): close handler
 *  - initialYawDeg (number, optional): initial yaw in degrees (no animation)
 *  - gyroscopeAbsolute (bool, optional): true -> absolute to world, false -> relative (default false)
 */
export default function PanoramaViewer({
  image,
  onClose,
  initialYawDeg,
  gyroscopeAbsolute = false,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const gyroRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [needsMotionPerm, setNeedsMotionPerm] = useState(false);

  // Fallback yaw from URL (?yaw= / ?heading= / ?bearing=) if prop not provided
  const getUrlYaw = () => {
    const sp = new URLSearchParams(window.location.search);
    const raw = sp.get("yaw") ?? sp.get("heading") ?? sp.get("bearing");
    const n = raw != null ? parseFloat(raw) : NaN;
    return Number.isFinite(n) ? n : 0;
  };

  // Set yaw instantly (no animation)
  const setYawInstant = (deg) => {
    const v = viewerRef.current;
    if (!v || typeof deg !== "number") return;
    try {
      v.setOption("yaw", `${deg}deg`);
    } catch {
      try { v.setOption("defaultYaw", `${deg}deg`); } catch {}
    }
  };

  useEffect(() => {
    if (!image || !containerRef.current) return;

    let destroyed = false;

    const init = async () => {
      setLoading(true);
      setError(null);

      try {
        // Preload the image
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = () => reject(new Error("Failed to load panorama image"));
          img.src = image;
        });

        const yawDeg = typeof initialYawDeg === "number" ? initialYawDeg : getUrlYaw();

        const viewer = new PSVViewer({
          container: containerRef.current,
          panorama: image,
          defaultYaw: `${yawDeg}deg`, // open instantly at yaw
          navbar: false,
          loadingImg: false,
          touchmoveTwoFingers: true,
          size: { width: "100%", height: "100%" },
         
          plugins: [
           // [GyroscopePlugin, { absolutePosition: gyroscopeAbsolute, moveMode: "smooth", roll: true }],
            [GyroscopePlugin, { absolutePosition: gyroscopeAbsolute, moveMode: "fast", roll: false }],
          ],
        });
        viewerRef.current = viewer;

    const onReady = async () => {
  if (destroyed) return;
  setLoading(false);

  // Ensure initial yaw is applied on all builds
  setYawInstant(yawDeg);

  // 🔹 Clamp device pixel ratio to reduce GPU load
  try {
    const maxDPR = window.matchMedia("(max-width: 768px)").matches ? 1.25 : 2;
    // @ts-ignore - viewer.renderer is from three.js
    viewer.renderer?.setPixelRatio?.(
      Math.min(window.devicePixelRatio || 1, maxDPR)
    );
    viewer.refresh?.();
  } catch {}

  const gyro = viewer.getPlugin(GyroscopePlugin);
  gyroRef.current = gyro;
  try {
    await gyro.start(); // iOS may require a user gesture/permission
  } catch {
    setNeedsMotionPerm(true);
  }
};

        viewer.addEventListener("ready", onReady);

        return () => {
          viewer.removeEventListener("ready", onReady);
          try { gyroRef.current?.stop?.(); } catch {}
          viewer.destroy();
          viewerRef.current = null;
          gyroRef.current = null;
        };
      } catch (e) {
        setError(e?.message || "Failed to load panorama");
        setLoading(false);
      }
    };

    const cleanup = init();
    return () => {
      destroyed = true;
      Promise.resolve(cleanup).then((fn) => fn && fn());
    };
  }, [image, initialYawDeg, gyroscopeAbsolute]);

  const enableMotion = async () => {
    try {
      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== "granted") return;
      }
      await gyroRef.current?.start?.();
      setNeedsMotionPerm(false);
    } catch {
      // keep button visible if still blocked
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col" style={{ overflow: "hidden" }}>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 bg-white/90 hover:bg-white text-black px-4 py-2 rounded-full shadow-lg z-[10000] select-none transition-all"
        type="button"
        aria-label="Close panorama viewer"
      >
       <X className="w-5 h-5" />
      </button>

      {needsMotionPerm && (
        <button
          onClick={enableMotion}
          className="absolute top-4 left-4 bg-white/90 text-black px-3 py-2 rounded-full shadow z-[10000]"
          type="button"
        >
          Enable motion
        </button>
      )}

      {loading && (
        <div className="w-full h-screen flex items-center justify-center bg-blue-50">
           <div className="text-center">
            <div
             className="animate-spin rounded-full h-12 w-12 border-2 border-[#009391] border-b-transparent mx-auto"

              style={{ borderColor: "#009391" }}
            />
            <p className="mt-4" style={{ color: "#009391" }}>Panorama laden...</p>
          </div>
        </div>
      )}
      

      {error && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black/50 text-white p-4">
          <p className="text-red-400 text-lg mb-2">Error loading panorama</p>
          <p className="text-sm mb-4">{error}</p>
          <button onClick={onClose} className="bg-white/90 hover:bg-white text-black px-4 py-2 rounded">
            Terug
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className={`flex-1 w-full h-full ${loading || error ? "invisible" : "visible"}`}
        style={{ opacity: loading ? 0 : 1, transition: "opacity 0.3s ease" }}
      />
    </div>
  );
}
