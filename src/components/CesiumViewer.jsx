// src/components/CesiumViewer.jsx
import { useEffect, useRef, useState } from "react";
import { Viewer, Cesium3DTileset, Entity ,Camera } from "resium";
import {
  Cartesian3,
  Ion,
  IonResource,
  Math as CesiumMath,
  VerticalOrigin,
  ShadowMode,
  ScreenSpaceEventType,
  Color,
  IonGeocodeProviderType,
  ClippingPolygonCollection,
  ClippingPolygon,
  defined,
  GeoJsonDataSource,
  Ellipsoid,
  ColorMaterialProperty

} from "cesium";
import FlyToButton from "./FlyToButton";
import MarkerPopup from "./MarkerPopup";

import CameraLogger from "./CameraLogger";

import PanoramaViewer from "./PanoramaViewer";


// Cesium Ion Token
//const ION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZjAzZTkxOS02ZjlkLTQ2MjctOWZiNi1kY2Y1NGZkNGRhNDQiLCJpZCI6MTEwMDQwLCJpYXQiOjE2NjQ4ODQxMjV9.6XX7lAjYrYVtE4EzIHaoDV3tDU4NNsHJTbuC5OzUnl4";
const ION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmZGUxMjY5Ni0wZTAyLTQ5MDAtYTUxZi1jZjRjMTIyMzRmM2QiLCJpZCI6MTQ4MjkwLCJpYXQiOjE3NTQ2NjM0Nzd9.yFKwuluk4NO594-ARWwRcxOWlvLCbycKW3YBWnDOfTs"
Ion.defaultAccessToken = ION_TOKEN;

// Viewer Configuration
const VIEWER_OPTIONS = {
 
  timeline: false,
  animation: false,
  baseLayerPicker: false,
  //geocoder: IonGeocodeProviderType.GOOGLE,
  fullscreenButton: false,
  homeButton: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  infoBox: false,
  selectionIndicator: false,
  terrainShadows: ShadowMode.ENABLED,
  shouldAnimate: false, 
};


// Main Tileset Asset ID
const TILESET_ASSET_ID = 2275207;


export default function CesiumViewer() {
  const viewerRef = useRef(null);
  const [tilesetUrl, setTilesetUrl] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [views, setViews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clipping, setClipping] = useState(null);
  const [panoramaPoints, setPanoramaPoints] = useState([]);
  const [selectedPano, setSelectedPano] = useState(null);

  useEffect(() => {
  const loadResources = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const results = await Promise.allSettled([
        IonResource.fromAssetId(TILESET_ASSET_ID), // 0: tileset
        fetch("/models.json").then(r => r.ok ? r.json() : Promise.reject("Failed to load models")), // 1: models
        fetch("/markers.json").then(r => r.ok ? r.json() : Promise.reject("Failed to load markers")), // 2: markers
        fetch("/views.json").then(r => r.ok ? r.json() : Promise.reject("Failed to load views")), // 3: views
        fetch("/panoramaPoints.json").then(r => r.ok ? r.json() : Promise.reject("Failed to load panorama points")), // 4: panorama points
      ]);

      // Tileset URL
      if (results[0].status === "fulfilled") {
        setTilesetUrl(results[0].value);
      } else {
        console.error(results[0].reason);
        setError(prev => (prev ? prev + " | Tileset failed" : "Tileset failed"));
      }

      // Models
      if (results[1].status === "fulfilled") {
        try {
          const modelsData = results[1].value;
          const modelsWithUrls = await Promise.all(
            modelsData.map(async (model) => {
              const modelUrl = await IonResource.fromAssetId(model.assetId);
              return { ...model, url: modelUrl };
            })
          );
          setModels(modelsWithUrls);
        } catch (err) {
          console.error("Model processing error:", err);
          setError(prev => (prev ? prev + " | Models failed" : "Models failed"));
        }
      } else {
        console.error(results[1].reason);
        setError(prev => (prev ? prev + " | Models failed" : "Models failed"));
      }

      // Markers
      if (results[2].status === "fulfilled") {
        setMarkers(results[2].value);
      } else {
        console.warn(results[2].reason);
        // Markers are non-critical, so we skip setting global error
      }

      // Views
      if (results[3].status === "fulfilled") {
        setViews(results[3].value);
      } else {
        console.warn(results[3].reason);
        // No views → no crash, but can't use fly-to buttons
      }

          // Panorama Points
      if (results[4].status === "fulfilled") {
        setPanoramaPoints(results[4].value);
      } else {
        console.warn(results[4].reason);
        // No panos → no crash, but can't use Pano buttons
      }


    } catch (err) {
      console.error("Unexpected load error:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  loadResources();
}, []);

  const loadGeoJsonFromIon = async (viewer) => {
   
  if (!viewer) return;
      let footprint = null;
  try {
    
    // Load GeoJSON from Cesium Ion using the asset ID    
    const resource = await IonResource.fromAssetId(3617274);
    const dataSource = await GeoJsonDataSource.load(resource, {
      clampToGround: true,
    
    });
   // viewer.dataSources.add(dataSource);
    
      footprint = dataSource.entities.values.find((entity) =>
        defined(entity.polygon),
    );
  footprint.polygon.outline = true;

  const positions = footprint.polygon.hierarchy.getValue().positions;

  const clippingPolygons = new ClippingPolygonCollection({
  polygons: [
    new ClippingPolygon({
      positions: positions,
    }),
  ], 
});
setClipping(clippingPolygons);
  } catch (err) {
     setError(err.message);
    console.error("Failed to load or process GeoJSON:", err);
  }
};
   
 
const handleTilesetReady = () => {
  const viewer = viewerRef.current?.cesiumElement;
  if (!viewer) return;

  try {
    // Configure scene
    viewer.scene.globe.show = false;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 50;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 4000;
    viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    //viewer.resolutionScale = 0.75;

    // If we have at least one view, set it as the initial view
    if (views && Object.keys(views).length > 0) {
      const firstView = Object.values(views)[0];
      if (
        firstView &&
        Array.isArray(firstView.destination) &&
        firstView.destination.length === 3
      ) {
        viewer.camera.setView({
          destination: Cartesian3.fromDegrees(...firstView.destination),
          orientation: firstView.orientation || {},
        });
      }
    }
  } catch (err) {
    setError("Failed to configure tileset: " + err.message);
    console.error("Tileset configuration error:", err);
  }

  loadGeoJsonFromIon(viewer);
};


const handleFlyTo = (view) => {
  const viewer = viewerRef.current?.cesiumElement;
  if (!viewer) return;

  // Cancel current camera movement
  viewer.camera.cancelFlight();

  // Manually fly to the position
 viewer.camera.flyTo({
  destination: Cartesian3.fromDegrees(...view.destination),
  orientation: { ...view.orientation },
  duration: 2,
});

  setSelectedMarker(null);
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
          <p className="mt-4 text-blue-600">Laden 3D Map...</p>
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
            onlyUsingWithGoogleGeocoder={true}
            //test
            maximumScreenSpaceError={32}
            maximumMemoryUsage={512}
            shadows={ShadowMode.ENABLED}
            clippingPolygons={clipping}
            onReady={handleTilesetReady}
             
          />
        )}


     {models && models.map(({ id, url, maximumScreenSpaceError }) => (
  <Cesium3DTileset
    key={id}
    url={url}
    maximumScreenSpaceError={maximumScreenSpaceError}
    maximumMemoryUsage={512}
   // preloadWhenHidden={false}
    //skipScreenSpaceErrorFactor={128}
    shadows={ShadowMode.ENABLED}
  />
))}

        {markers && markers.map((marker) => (
          <Entity
            key={marker.id}
            name={marker.name}
            position={Cartesian3.fromDegrees(
              marker.longitude,
              marker.latitude,
              marker.height
            )}
            billboard={{
              image: "/green_marker.svg",
              verticalOrigin: VerticalOrigin.BOTTOM,
              scale: 0.3,
            }}
            onClick={() => setSelectedMarker(marker)}
          />
        ))}

        {panoramaPoints.map((pano) => (
  <Entity
    key={pano.id}
    name={pano.name}
    position={Cartesian3.fromDegrees(
      pano.longitude,
      pano.latitude,
      pano.height
    )}
    billboard={{
      image: "/blue_marker.svg", // the icon we made earlier
      verticalOrigin: VerticalOrigin.BOTTOM,
      scale: 0.3
    }}
    onClick={() => {
      // Here you open the panorama viewer component
      setSelectedPano(pano.imageUrl); // Assuming pano.imageUrl is the image path
   
    
    }}
  />
))}
      </Viewer>

      {selectedPano && (
  <PanoramaViewer
    image={selectedPano}
    
    onClose={() => setSelectedPano(null)}
  />

)}


   {/* Navigation Controls - only show if pano is NOT open */}
    {!selectedPano && (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 z-50">
        {Object.entries(views).map(([name, view]) => (
          <FlyToButton
            key={name}
            label={name.charAt(0).toUpperCase() + name.slice(1)}
            onClick={() => handleFlyTo(view)}
          />
        ))}
        <CameraLogger viewerRef={viewerRef} label="Log View" />
      </div>
    )}

      {/* Marker Popup */}
      <MarkerPopup 
        marker={selectedMarker} 
        onClose={() => setSelectedMarker(null)} 
      />
    </div>
  );
}