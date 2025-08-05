// src/components/CesiumViewer.jsx
import { useEffect, useRef, useState } from "react";
import { Viewer, Cesium3DTileset, CameraFlyTo, Entity } from "resium";
import { Cartesian3, Ion, IonResource, Math as CesiumMath, Color, VerticalOrigin } from "cesium";

import FlyToButton from "./FlyToButton";
import MarkerPopup from "./MarkerPopup";

Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhNzZiZGUxYS0zNDQwLTQxOWEtOTUxYy02ZTMzY2JmMTgwMGEiLCJpZCI6MTEwMDQwLCJpYXQiOjE3MzY0Mjc5MjJ9.rNoNK8m6dDeKhtghIr8p0sOYz3uuxYq_yFnhHNOFbas';

const viewerOptions = {
  timeline: false,
  animation: false,
  baseLayerPicker: false,
  geocoder: false,
  fullscreenButton: false,
  homeButton: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  infoBox: false,
  selectionIndicator: false, 
};

const cameraViews = {
  toren1: {
    destination: Cartesian3.fromDegrees(4.324704, 51.176033, 100),
    orientation: {
      heading: CesiumMath.toRadians(45),
      pitch: CesiumMath.toRadians(-30),
      roll: 0,
    },
  },
  toren2: {
    destination: Cartesian3.fromDegrees(4.3147, 51.1700, 150),
    orientation: {
      heading: CesiumMath.toRadians(90),
      pitch: CesiumMath.toRadians(-20),
      roll: 0,
    },
  },
  toren3: {
    destination: Cartesian3.fromDegrees(4.3340, 51.1800, 120),
    orientation: {
      heading: CesiumMath.toRadians(135),
      pitch: CesiumMath.toRadians(-25),
      roll: 0,
    },
  },
};



export default function CesiumViewer() {
  const viewerRef = useRef(null);
  const [tilesetUrl, setTilesetUrl] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [markers, setMarkers] = useState([]);

  useEffect(() => {
    IonResource.fromAssetId(2275207).then(setTilesetUrl);
    fetch("./public/markers.json")
      .then((res) => res.json())
      .then(setMarkers)
      .catch(console.error);
  }, []);

  const handleFlyTo = (view) => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer) {
      viewer.camera.flyTo({
        destination: view.destination,
        orientation: view.orientation,
        duration: 2.0,
      });
    }
  };

  return (
    <div className="relative w-full h-screen">
      <Viewer ref={viewerRef} full {...viewerOptions}>
        {tilesetUrl && <Cesium3DTileset url={tilesetUrl} />}

      

        {markers.map((marker) => (
          <Entity
            key={marker.id}
            name={marker.name}
            position={Cartesian3.fromDegrees(
              marker.longitude,
              marker.latitude,
              marker.height
            )}
            billboard={{
              image: "./public/marker.svg",
              verticalOrigin: VerticalOrigin.BOTTOM,
              scale: 1,
            }}
            onClick={() => setSelectedMarker(marker)}
          />
        ))}
      </Viewer>

      {/* Fly-to Buttons */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 z-50">
        <FlyToButton label="Toren 1" onClick={() => handleFlyTo(cameraViews.toren1)} />
        <FlyToButton label="Toren 2" onClick={() => handleFlyTo(cameraViews.toren2)} />
        <FlyToButton label="Toren 3" onClick={() => handleFlyTo(cameraViews.toren3)} />
      </div>

      {/* Popup */}
      <MarkerPopup marker={selectedMarker} onClose={() => setSelectedMarker(null)} />
    </div>
  );
}
