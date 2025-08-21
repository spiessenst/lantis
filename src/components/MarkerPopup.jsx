import { useState } from "react";
import { X } from "lucide-react";

export default function MarkerPopup({ marker, onClose }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!marker) return null;

  return (
    <>
      {/* Popup */}
      <div
        className={`
          absolute z-50 w-[90%] max-w-sm bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col
          left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+2rem)]
          md:left-auto md:-translate-x-0 md:right-6 md:top-24 md:bottom-auto
        `}
        style={{
          maxHeight: "80vh",
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-start p-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {marker.name}
          </h3>
          <button
            onClick={onClose}
            aria-label="Sluit popup"
            className="text-gray-500 hover:text-gray-800 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Optional image (clickable) */}
        {marker.image && (
          <img
            src={marker.image}
            alt={`Afbeelding van ${marker.name}`}
            className="w-full h-44 object-cover cursor-pointer"
            onClick={() => setIsFullscreen(true)}
          />
        )}

        {/* Scrollable content */}
        <div className="p-4 pt-2 overflow-y-auto">
          <p className="text-sm text-gray-700 leading-relaxed">
            {marker.description}
          </p>
        </div>
      </div>

      {/* Fullscreen image overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] bg-black bg-opacity-90 flex items-center justify-center">
            <button
        onClick={onClose}
        className="absolute top-4 right-4 bg-white/90 hover:bg-white text-black px-4 py-2 rounded-full shadow-lg z-[10000] select-none transition-all"
        type="button"
        aria-label="Close panorama viewer"
      >
       <X className="w-5 h-5" />
      </button>
          <img
            src={marker.image}
            alt={`Fullscreen van ${marker.name}`}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </>
  );
}
