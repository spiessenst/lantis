import { useEffect, useRef, useState, useCallback } from "react";
import { Viewer as PSVViewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";

export default function PanoramaViewer({ image, onClose }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // optional: call this when you want to align to a compass heading (degrees from North)
  const alignToHeading = useCallback((headingDeg, northOffsetDeg = 0) => {
    const viewer = viewerRef.current;
    if (!viewer || typeof headingDeg !== "number") return;
    const yawDeg = northOffsetDeg - headingDeg; // adjust if pano’s 0° isn’t true north
    // PSV v5+: use animate with degrees string
    viewer.animate({ yaw: `${yawDeg}deg`, pitch: 0, speed: "1rpm" });
  }, []);

  useEffect(() => {
    if (!image || !containerRef.current) return;

    let destroyed = false;

    const init = async () => {
      setLoading(true);
      setError(null);

      try {
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = () => reject(new Error("Failed to load panorama image"));
          img.src = image;
        });

        const viewer = new PSVViewer({
          container: containerRef.current,
          panorama: image,
          defaultYaw: 0,
          navbar: false,
          loadingImg: false,
          touchmoveTwoFingers: true,
          size: { width: "100%", height: "100%" },
        });
        viewerRef.current = viewer;

        const onReady = () => setLoading(false);
        viewer.addEventListener("ready", onReady);

        // cleanup just this effect's listeners/instances
        return () => {
          if (destroyed) return;
          viewer.removeEventListener("ready", onReady);
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
      // cleanupPromise returns a function once init finishes
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
