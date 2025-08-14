import { useEffect, useRef, useState } from "react";
import { Viewer as PSVViewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";

export default function PanoramaViewer({ image, onClose }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [needsMotionPerm, setNeedsMotionPerm] = useState(false);

  // Helper: get initial yaw (deg) from URL (?yaw=, ?heading=, or ?bearing=)
  const getInitialYaw = () => {
    const sp = new URLSearchParams(window.location.search);
    const raw = sp.get("yaw") ?? sp.get("heading") ?? sp.get("bearing");
    const n = raw != null ? parseFloat(raw) : NaN;
    return Number.isFinite(n) ? n : 0;
  };

  // Helper: get a compass heading in degrees from a deviceorientation event
  const getHeadingFromEvent = (e) => {
    // iOS Safari gives absolute north bearing here (0..360, clockwise)
    if (typeof e.webkitCompassHeading === "number") return e.webkitCompassHeading;
    // Many Androids expose alpha as 0..360, absolute when 'absolute' is true
    if (typeof e.alpha === "number") return e.alpha;
    return null;
  };

  // Instantly set yaw (no animation)
  const setYawInstant = (deg) => {
    const v = viewerRef.current;
    if (!v || typeof deg !== "number") return;
    try {
      // setOption is instantaneous on PSV v5
      v.setOption("yaw", `${deg}deg`);
    } catch {
      // Very old builds: as a fallback, set defaultYaw then force a render
      try { v.setOption("defaultYaw", `${deg}deg`); } catch {}
    }
  };

  useEffect(() => {
    if (!image || !containerRef.current) return;

    let destroyed = false;
    let stopMotion = () => {};

    const init = async () => {
      setLoading(true);
      setError(null);

      try {
        // Preload the pano
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = () => reject(new Error("Failed to load panorama image"));
          img.src = image;
        });

        const initialYawDeg = getInitialYaw();

        const viewer = new PSVViewer({
          container: containerRef.current,
          panorama: image,
          // set initial angle immediately (no animation)
          defaultYaw: `${initialYawDeg}deg`,
          navbar: false,
          loadingImg: false,
          touchmoveTwoFingers: true,
          size: { width: "100%", height: "100%" },
        });
        viewerRef.current = viewer;

        const onReady = () => {
          if (destroyed) return;
          setLoading(false);
          // Force-set yaw again instantly, in case build applies after first render
          setYawInstant(initialYawDeg);
        };

        viewer.addEventListener("ready", onReady);

        // Live device-heading tracking:
        // We keep the pano aligned so that when the device returns to the
        // same physical heading as at open, the yaw equals initialYawDeg.
        // offset = initialYawDeg + heading_at_start
        // live yaw = offset - currentHeading
        const startMotion = async () => {
          try {
            // iOS 13+: permission gate
            if (
              typeof DeviceOrientationEvent !== "undefined" &&
              typeof DeviceOrientationEvent.requestPermission === "function"
            ) {
              const res = await DeviceOrientationEvent.requestPermission();
              if (res !== "granted") {
                setNeedsMotionPerm(true);
                return;
              }
            }
            // If we got here, we can listen
            setNeedsMotionPerm(false);

            let offsetDeg = null;
            const handler = (e) => {
              const hdg = getHeadingFromEvent(e);
              if (hdg == null) return;
              if (offsetDeg == null) {
                // calibrate on first event so current heading maps to the requested yaw
                offsetDeg = (initialYawDeg + hdg) % 360;
              }
              const target = (offsetDeg - hdg + 360) % 360;
              setYawInstant(target); // instantaneous updates, no animation
            };

            // Prefer absolute when available
            window.addEventListener("deviceorientationabsolute", handler, true);
            window.addEventListener("deviceorientation", handler, true);

            stopMotion = () => {
              window.removeEventListener("deviceorientationabsolute", handler, true);
              window.removeEventListener("deviceorientation", handler, true);
            };
          } catch {
            setNeedsMotionPerm(true);
          }
        };

        // Try to start motion tracking; if iOS blocks, we show a button
        startMotion();

        return () => {
          viewer.removeEventListener("ready", onReady);
          stopMotion();
          viewer.destroy();
          viewerRef.current = null;
        };
      } catch (e) {
        setError(e?.message || "Failed to load panorama");
        setLoading(false);
      }
    };

    const cleanupPromise = init();

    return () => {
      destroyed = true;
      Promise.resolve(cleanupPromise).then((cleanup) => cleanup && cleanup());
    };
  }, [image]);

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col" style={{ overflow: "hidden" }}>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 bg-white/90 hover:bg-white text-black px-4 py-2 rounded-full shadow-lg z-[10000] select-none transition-all"
        type="button"
        aria-label="Close panorama viewer"
      >
        ✕ Close
      </button>

      {/* iOS motion permission (only shown if needed) */}
      {needsMotionPerm && (
        <button
          onClick={async () => {
            try {
              const res = await DeviceOrientationEvent.requestPermission();
              // Trigger a reload so the effect re-runs and attaches listeners
              if (res === "granted") window.location.replace(window.location.href);
            } catch {/* ignore */}
          }}
          className="absolute top-4 left-4 bg-white/90 text-black px-3 py-2 rounded-full shadow z-[10000]"
        >
          Enable motion
        </button>
      )}

      {loading && (
        <div className="w-full h-screen flex items-center justify-center bg-blue-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-blue-600">Panorama Laden...</p>
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
