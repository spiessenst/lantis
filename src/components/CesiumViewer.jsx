// src/components/CesiumViewer.jsx
import { useEffect, useRef, useState } from "react";
import { Viewer, Cesium3DTileset, Entity } from "resium";
import {
  Cartesian3,
  Ion,
  IonResource,
  Math as CesiumMath,
  VerticalOrigin,
  ShadowMode,
  ScreenSpaceEventType,
  Color
} from "cesium";

import FlyToButton from "./FlyToButton";
import MarkerPopup from "./MarkerPopup";

Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZjAzZTkxOS02ZjlkLTQ2MjctOWZiNi1kY2Y1NGZkNGRhNDQiLCJpZCI6MTEwMDQwLCJpYXQiOjE2NjQ4ODQxMjV9.6XX7lAjYrYVtE4EzIHaoDV3tDU4NNsHJTbuC5OzUnl4";

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
//globe : false,
  terrainShadows: ShadowMode.ENABLED,
 shouldAnimate: false,
};

const projectCenter = Cartesian3.fromDegrees(4.324704, 51.176033, 600); // bird's-eye height

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
    destination: Cartesian3.fromDegrees(4.3147, 51.17, 150),
    orientation: {
      heading: CesiumMath.toRadians(90),
      pitch: CesiumMath.toRadians(-20),
      roll: 0,
    },
  },
  toren3: {
    destination: Cartesian3.fromDegrees(4.334, 51.18, 120),
    orientation: {
      heading: CesiumMath.toRadians(135),
      pitch: CesiumMath.toRadians(-25),
      roll: 0,
    },
  },
  toren5: {
    destination: Cartesian3.fromDegrees(4.324704, 51.17605, 200),
    orientation: {
      heading: CesiumMath.toRadians(45),
      pitch: CesiumMath.toRadians(-30),
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

        IonResource.fromAssetId(2988671).then(setTilesetUrl);
  
   
  }, []);


  const handleTilesetReady = () => {


    fetch("/markers.json")
      .then((res) => res.json())
      .then(setMarkers)
      .catch(console.error);
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer) {
       viewer.scene.screenSpaceCameraController.minimumZoomDistance = 100;
       viewer.scene.screenSpaceCameraController.maximumZoomDistance = 2000; 
        viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      viewer.camera.setView({
        destination: projectCenter,
        orientation: {
          heading: CesiumMath.toRadians(90),
          pitch: CesiumMath.toRadians(-30),
          roll: 0,
        },
           
      });
    }
  };

  const handleFlyTo = (view) => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer) {
     
      viewer.camera.cancelFlight();
      viewer.camera.flyTo({
        destination: view.destination,
        orientation: view.orientation,
        duration: 2.0,
      });
      setSelectedMarker(null);
    }
  };

  

  return (
    <div className="relative w-full h-screen">
      <Viewer ref={viewerRef} full {...viewerOptions}   >
        {tilesetUrl && (
          <Cesium3DTileset
            url={tilesetUrl}
            shadows={ShadowMode.ENABLED}
           onReady={handleTilesetReady} 
          /> 

          
        )}
 <Entity
       position={Cartesian3.fromDegrees(4.3243588, 51.1760186, 100)}
        model={{
          uri: tilesetUrl,
          minimumPixelSize: 64,    // Ensures model remains visible when zoomed out
          maximumScale: 20000,     // Prevents model from becoming too large
          show: true,              // Visibility toggle
          scale: 1.0,             // Adjust scale as needed
          color: undefined,        // Optional: Add color tint (e.g., Cesium.Color.RED.withAlpha(0.5))
     
        }}
        // Optional event handlers:
        onClick={() => console.log('Model clicked')}
        onMouseEnter={() => console.log('Mouse over model')}
        onMouseLeave={() => console.log('Mouse left model')}
         onReady={console.log('Model is ready')} 
      />
      
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
              image: "/marker.svg",
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
        <FlyToButton label="Toren 5" onClick={() => handleFlyTo(cameraViews.toren5)} />
      </div>

      {/* Popup */}
      <MarkerPopup marker={selectedMarker} onClose={() => setSelectedMarker(null)} />



   
    </div>



  );
}
