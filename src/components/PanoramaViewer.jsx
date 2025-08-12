import { useEffect, useRef, useState } from "react";
import { Viewer as PhotoSphereViewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";

export default function PanoramaViewer({ image, onClose }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!image || !containerRef.current) return;

    const loadImageAndInitialize = async () => {
      setLoading(true);
      setError(null);

      try {
        // Preload the image first
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = () => reject(new Error('Failed to load panorama image'));
          img.src = image;
        });

        // Initialize viewer
        viewerRef.current = new PhotoSphereViewer({
          container: containerRef.current,
          panorama: image,
          defaultYaw: 0,
          navbar: false,
          loadingImg: false,
          touchmoveTwoFingers: true,
          size: {
            width: '100%',
            height: '100%'
          }
        });

        // Listen for ready state using the correct event system
        const handler = viewerRef.current.addEventListener('ready', () => {
          setLoading(false);
        });

        return () => {
          viewerRef.current?.removeEventListener('ready', handler);
        };

      } catch (err) {
        setError(err.message || 'Failed to load panorama');
        setLoading(false);
      }
    };

    loadImageAndInitialize();

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
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
          <button
            onClick={onClose}
            className="bg-white/90 hover:bg-white text-black px-4 py-2 rounded"
          >
           Terug
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className={`flex-1 w-full h-full ${loading || error ? "invisible" : "visible"}`}
        style={{ opacity: loading ? 0 : 1, transition: 'opacity 0.3s ease' }}
      />
    </div>
  );
}