export default function MarkerPopup({ marker, onClose }) {
  if (!marker) return null;

  return (
    <div
      className={`
        absolute z-50 w-[90%] max-w-sm bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col
        left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+2rem)]
        md:left-auto md:-translate-x-0 md:right-6 md:top-24 md:bottom-auto
      `}
      style={{
        maxHeight: "80vh", // Limit height for both mobile & desktop
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

      {/* Optional image */}
      {marker.image && (
        <img
          src={marker.image}
          alt={`Afbeelding van ${marker.name}`}
          className="w-full h-44 object-cover"
        />
      )}

      {/* Scrollable content */}
      <div className="p-4 pt-2 overflow-y-auto">
        <p className="text-sm text-gray-700 leading-relaxed">
          {marker.description}
        </p>
      </div>
    </div>
  );
}
