import { Math as CesiumMath, Ellipsoid, Cartesian3 } from "cesium";

export default function CameraLogger({ viewerRef, label = "Log View" }) {
  const logCameraPosition = () => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    const camera = viewer.scene.camera;

    // Convert to Lat/Lon/Height
    const carto = Ellipsoid.WGS84.cartesianToCartographic(camera.position);
    const lat = CesiumMath.toDegrees(carto.latitude);
    const lon = CesiumMath.toDegrees(carto.longitude);
    const height = carto.height;

    // Orientation in degrees
    const heading = camera.heading;
    const pitch = camera.pitch;
    const roll = camera.roll;

    console.log(`"Viewx": {
    "destination": [${lon}, ${lat}, ${height}],
    "orientation": {
      "heading": ${heading},
      "pitch": ${pitch},
      "roll": ${roll}
    }
  },`);
  };

  return (
    <button
      onClick={logCameraPosition}
      className="px-3 py-2 bg-white border rounded shadow hover:bg-gray-100"
    >
      {label}
    </button>
  );
}
