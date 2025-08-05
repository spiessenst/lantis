export default function MarkerPopup({ marker, onClose }) {
  if (!marker) return null;

  return (
    <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 w-[90%] max-w-sm bg-white rounded-xl shadow-lg border border-gray-200 z-50">
      <div className="flex justify-between items-start p-4">
        <h3 className="text-lg font-semibold text-gray-900">{marker.name}</h3>
        <button
          onClick={onClose}
          aria-label="Sluit popup"
          className="text-gray-500 hover:text-gray-800 text-xl leading-none"
        >
          ×
        </button>
      </div>

      {marker.image && (
        <img
          src={marker.image}
          alt={`Afbeelding van ${marker.name}`}
          className="w-full h-44 object-cover rounded-b-lg"
        />
      )}

      <div className="p-4 pt-2">
        <p className="text-sm text-gray-700 leading-relaxed">{marker.description}</p>
      </div>
    </div>
  );
}
