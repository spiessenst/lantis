import { useEffect, useRef , useState} from "react";
import { Viewer as PhotoSphereViewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";

export default function PanoramaViewer({ image, onClose }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
    const [loading, setLoading] = useState(true);

  useEffect(() => {
     setLoading(true);
try {
  if (containerRef.current && image) {
    viewerRef.current = new PhotoSphereViewer({
      container: containerRef.current,
      panorama: image,
      defaultYaw: 0,
      touchmoveTwoFingers: true,
      navbar: false,  // <-- this hides all default controls
      loadingImg: false, // disable default loading image
    });
  }
} finally {
  setLoading(false);
}

    return () => {
      viewerRef.current?.destroy();
    };
  }, [image]);

    return (
    <div
      className="fixed inset-0 bg-black z-[9999] flex flex-col"
      style={{ overflow: "hidden" }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 bg-white text-black px-4 py-2 rounded shadow-lg z-[10000] select-none"
        type="button"
      >
        ✕ Close
      </button>

      {loading && (
        <div className="w-full h-screen flex items-center justify-center bg-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-blue-600">Loading Pano...</p>
        </div>
      </div>
      )}

      <div
        ref={containerRef}
        className={`flex-1 ${loading ? "hidden" : "block"}`}
      />
    </div>
  );
}