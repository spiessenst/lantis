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
} from "cesium";
import FlyToButton from "./FlyToButton";
import MarkerPopup from "./MarkerPopup";

// Cesium Ion Token
const ION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZjAzZTkxOS02ZjlkLTQ2MjctOWZiNi1kY2Y1NGZkNGRhNDQiLCJpZCI6MTEwMDQwLCJpYXQiOjE2NjQ4ODQxMjV9.6XX7lAjYrYVtE4EzIHaoDV3tDU4NNsHJTbuC5OzUnl4";
Ion.defaultAccessToken = ION_TOKEN;

// Viewer Configuration
const VIEWER_OPTIONS = {
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
  terrainShadows: ShadowMode.ENABLED,
  shouldAnimate: false,
};

// Project Center and Camera Views
const PROJECT_CENTER = Cartesian3.fromDegrees(4.324704, 51.176033, 600);

const CAMERA_VIEWS = {
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

// Main Tileset Asset ID
const TILESET_ASSET_ID = 2275207;

export default function CesiumViewer() {
  const viewerRef = useRef(null);
  const [tilesetUrl, setTilesetUrl] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadResources = async () => {
      try {
        setIsLoading(true);
        const url = await IonResource.fromAssetId(TILESET_ASSET_ID);
        setTilesetUrl(url);
        
        const response = await fetch("/markers.json");
        if (!response.ok) throw new Error("Failed to load markers");
        setMarkers(await response.json());
      } catch (err) {
        console.error("Loading error:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadResources();
  }, []);

  const handleTilesetReady = () => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    // Configure camera controls
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 300;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 4000;
    viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    
    // Set initial view
    viewer.camera.setView({
      destination: PROJECT_CENTER,
      orientation: {
        heading: CesiumMath.toRadians(90),
        pitch: CesiumMath.toRadians(-30),
        roll: 0,
      },
    });
  };

  const handleFlyTo = (view) => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer) {
      viewer.camera.cancelFlight();
      viewer.camera.flyTo({
        ...view,
        duration: 2.0,
      });
      setSelectedMarker(null);
    }
  };

  const resetView = () => {
    handleFlyTo({
      destination: PROJECT_CENTER,
      orientation: {
        heading: CesiumMath.toRadians(90),
        pitch: CesiumMath.toRadians(-30),
        roll: 0,
      }
    });
  };

  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-red-50 text-red-600">
        <div className="text-center p-4 max-w-md">
          <h2 className="text-xl font-bold mb-2">Error Loading Map</h2>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-100 rounded hover:bg-red-200"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-blue-600">Loading 3D Map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen">
      <Viewer ref={viewerRef} full {...VIEWER_OPTIONS}>
        {tilesetUrl && (
          <Cesium3DTileset
            url={tilesetUrl}
            shadows={ShadowMode.ENABLED}
            onReady={handleTilesetReady}
          />
        )}
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
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }}
            onClick={() => setSelectedMarker(marker)}
          />
        ))}
      </Viewer>

      {/* Navigation Controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 z-50">
        <FlyToButton 
          label="Overview" 
          onClick={resetView}
          aria-label="Reset camera to default view"
        />
        {Object.entries(CAMERA_VIEWS).map(([key, view]) => (
          <FlyToButton
            key={key}
            label={`POI ${key.slice(-1)}`}
            onClick={() => handleFlyTo(view)}
            aria-label={`Fly to view ${key}`}
          />
        ))}
      </div>

      {/* Marker Popup */}
      <MarkerPopup 
        marker={selectedMarker} 
        onClose={() => setSelectedMarker(null)} 
      />
    </div>
  );
}