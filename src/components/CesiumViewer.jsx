import { useCallback, useEffect, useRef, useState  } from "react";
import { Viewer, Cesium3DTileset, Entity  } from "resium";
import {
  Cartesian3,
  Ion,
  IonResource,
  VerticalOrigin,
  ShadowMode,
  ScreenSpaceEventType,
  GeoJsonDataSource,
  defined,
  ClippingPolygonCollection,
  ClippingPolygon,
  Color,
  DirectionalLight, ImageBasedLighting , Cartesian2  ,ImageryLayer , IonImageryProvider
 
} from "cesium";

import { QrCode } from "lucide-react";
import { X } from "lucide-react";

import FlyToButton from "./FlyToButton";
import MarkerPopup from "./MarkerPopup";
import CameraLogger from "./CameraLogger";
import PanoramaViewer from "./PanoramaViewer";
import QRScanner from "./QRScanner";

// In productie: token niet client-side bundelen.
//const ION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmZGUxMjY5Ni0wZTAyLTQ5MDAtYTUxZi1jZjRjMTIyMzRmM2QiLCJpZCI6MTQ4MjkwLCJpYXQiOjE3NTQ2NjM0Nzd9.yFKwuluk4NO594-ARWwRcxOWlvLCbycKW3YBWnDOfTs";
const ION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxMTUyNzQ2Ni01NDBkLTRmMWMtYmM5Yy1mNDk3ZTZjNjhiZmUiLCJpZCI6MzMzMjkyLCJpYXQiOjE3NTU1OTQzNjJ9.0dGGgdyWBvgJ2kiBz7tp32c9xwJcIIJOYTjbfs5iIdY";
Ion.defaultAccessToken = ION_TOKEN;


const VIEWER_OPTIONS = {
  timeline: false,
  animation: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  homeButton: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  infoBox: false,
  selectionIndicator: false,
// terrainShadows: ShadowMode.ENABLED,
  shouldAnimate: false,
  requestRenderMode: true,
  maximumRenderTimeChange: 0.0,
};

const TILESET_ASSET_ID = 2275207;

// Eenvoudige device check (gedrag, niet styling)
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer:coarse), (max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    if (mq.addEventListener) mq.addEventListener("change", update);
    else if (mq.addListener) mq.addListener(update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else if (mq.removeListener) mq.removeListener(update);
    };
  }, []);
  return isMobile;
}

export default function CesiumViewer() {
  const viewerRef = useRef(null);
  const isMobile = useIsMobile();

  // UI/flow state
  const [selectedPano, setSelectedPano] = useState(null);         // image url
  const [selectedPanoMeta, setSelectedPanoMeta] = useState(null); // lat/lng, northOffsetDeg
  const [scanOpen, setScanOpen] = useState(false);

  // Cesium data
  const [tilesetUrl, setTilesetUrl] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [views, setViews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clipping, setClipping] = useState(null);
  const [panoramaPoints, setPanoramaPoints] = useState([]);

  // Cache for cutouts across views
  const cutoutCacheRef = useRef(new Map()); // key → positions[]

  // Canvas pauzeren/verbergen wanneer panorama open is (spaart GPU)
  useEffect(() => {
    const v = viewerRef.current?.cesiumElement;
    if (!v) return;
    const canvas = v.canvas;
    if (selectedPano) {
      v.useDefaultRenderLoop = false;
      if (canvas) canvas.style.visibility = "hidden";
    } else {
      v.useDefaultRenderLoop = true;
      if (canvas) canvas.style.visibility = "visible";
      v.scene.requestRender();
    }
  }, [selectedPano]);

  // Helper: open panorama op basis van ID (gedeeld door marker & QR)
  const openPanoById = useCallback(async (panoId) => {
    if (!panoId) return;

    // 1) Probeer lokale lijst
    let meta = panoramaPoints.find((p) => String(p.id) === String(panoId));

    // 2) Indien nog niet geladen: optioneel fallback ophalen
    if (!meta) {
      try {
        const r = await fetch("/panoramaPoints.json");
        if (r.ok) {
          const list = await r.json();
          meta = list.find((p) => String(p.id) === String(panoId));
        }
      } catch {
        // negeer
      }
    }
    if (!meta) return;

    // 3) Open in-app (geen URL-wijzigingen)
    setScanOpen(false);
    setSelectedPano(meta.imageUrl);
    setSelectedPanoMeta(meta);
  }, [panoramaPoints]);

  // QR-scan handler: QR bevat enkel ID (of desnoods een URL: we strippen ID)
  const handleScanResult = useCallback((result) => {
    const raw = typeof result === "string" ? result : (result?.data ?? result?.text ?? "");
    const value = String(raw).trim();
    if (!value) return;

    // Normaliseer naar panoId:
    // - Als het een URL is met een path: pak laatste path segment
    // - Anders neem de string zoals hij is
    let panoId = value;
    try {
      const url = new URL(value, window.location.origin);
      const pathname = url.pathname.replace(/\/+$/, "");
      const last = pathname.split("/").filter(Boolean).pop();
      if (last) panoId = last;
    } catch {
      // geen geldige URL: laat value als ID
    }

    openPanoById(panoId);
  }, [openPanoById]);

  // QR UI (mobiel)
  const renderQRUI = useCallback(() => (
    <>
      {!scanOpen && !selectedPano && (
        <button
          onClick={() => setScanOpen(true)}
          className="fixed top-5 left-5 z-[10060] rounded-full p-4 bg-[#009391] shadow-lg md:hidden pointer-events-auto hover:opacity-90 active:opacity-80 transition"
          aria-label="Scan QR"
          type="button"
        >
          <QrCode className="w-6 h-6 text-white" />
        </button>
      )}

      {scanOpen && (
        <QRScanner
          onDetected={(v) => { setScanOpen(false); handleScanResult(v); }}
          onClose={() => setScanOpen(false)}
        />
      )}
    </>
  ), [scanOpen, selectedPano, handleScanResult]);

  // Resources laden (tileset + optionele jsons)
  useEffect(() => {
    Ion.defaultAccessToken = ION_TOKEN;
  }, []);

  useEffect(() => {
    const aborter = new AbortController();
    let ignore = false;
    const isAbort = (reason) => reason && (reason.name === "AbortError" || reason.code === 20);

    const loadResources = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const results = await Promise.allSettled([
          IonResource.fromAssetId(TILESET_ASSET_ID), // 0 tileset
          fetch("/models.json", { signal: aborter.signal }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("Failed to load models"))
          ), // 1 models (optional)
          fetch("/markers.json", { signal: aborter.signal }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("Failed to load markers"))
          ), // 2 markers (optional)
          fetch("/views.json", { signal: aborter.signal }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("Failed to load views"))
          ), // 3 views (optional)
          fetch("/panoramaPoints.json", { signal: aborter.signal }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("Failed to load panorama points"))
          ), // 4 panos (optional)
        ]);

        if (results[0].status === "fulfilled") {
          if (!ignore) setTilesetUrl(results[0].value);
        } else if (!isAbort(results[0].reason)) {
          console.error(results[0].reason);
          if (!ignore) setError((e) => (e ? e + " | Tileset failed" : "Tileset failed"));
        }

        if (results[1].status === "fulfilled") {
          try {
            const modelsData = Array.isArray(results[1].value) ? results[1].value : [];
            const modelsWithUrls = await Promise.all(
              modelsData
                .filter((m) => m && typeof m.assetId !== "undefined")
                .map(async (model) => {
                  try {
                    const url = await IonResource.fromAssetId(model.assetId);
                    return { ...model, url };
                  } catch (e) {
                    console.warn("Model IonResource failed for", model.assetId, e);
                    return null;
                  }
                })
            );
            if (!ignore) setModels(modelsWithUrls.filter(Boolean));
          } catch (e) {
            console.warn("Model processing error (non-critical):", e);
          }
        } else if (!isAbort(results[1].reason)) {
          console.warn(results[1].reason || "Models fetch failed (non-critical)");
        }

        if (results[2].status === "fulfilled") {
          if (!ignore) setMarkers(results[2].value);
        } else if (!isAbort(results[2].reason)) {
          console.warn(results[2].reason || "Markers failed (non-critical)");
        }

        if (results[3].status === "fulfilled") {
          if (!ignore) setViews(results[3].value);
        } else if (!isAbort(results[3].reason)) {
          console.warn(results[3].reason || "Views failed (non-critical)");
        }

        if (results[4].status === "fulfilled") {
          if (!ignore) setPanoramaPoints(results[4].value);
        } else if (!isAbort(results[4].reason)) {
          console.warn(results[4].reason || "Panorama points failed (non-critical)");
        }
      } catch (err) {
        if (!isAbort(err)) {
          console.error("Unexpected load error:", err);
          if (!ignore) setError(err.message);
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };

    loadResources();
    return () => {
      ignore = true;
      aborter.abort();
    };
  }, []);

  // --- CUTOUTS per-view -----------------------------------------------------
  // "cutouts" can be: number (Ion assetId), string (URL), or object { assetId } / { href }
  const specKey = (spec) => {
    if (spec == null) return "null";
    if (typeof spec === "number") return `ion:${spec}`;
    if (typeof spec === "string") return `url:${spec}`;
    if (typeof spec === "object") {
      if (spec.assetId != null) return `ion:${spec.assetId}`;
      if (spec.href) return `url:${spec.href}`;
    }
    return JSON.stringify(spec);
  };

  const normalizeCutoutsForView = (view) => {
    const raw = view?.cutouts;
    if (!raw) return [];
    if (raw === "none" || raw === "non") return [];
    return Array.isArray(raw) ? raw : [raw];
  };

  const extractPolygonPositions = (dataSource) => {
    const positionsArr = [];
    for (const e of dataSource.entities.values) {
      if (defined(e.polygon)) {
        const hierarchy = e.polygon.hierarchy?.getValue?.();
        const positions = hierarchy?.positions ?? [];
        if (positions.length) positionsArr.push(positions);
      }
    }
    return positionsArr;
  };

  const loadSingleCutout = async (spec) => {
    const key = specKey(spec);
    const cached = cutoutCacheRef.current.get(key);
    if (cached) return cached; // reuse parsed positions

    try {
      let dataSource;
      if (typeof spec === "number" || (typeof spec === "object" && spec?.assetId != null)) {
        const assetId = typeof spec === "number" ? spec : spec.assetId;
        const resource = await IonResource.fromAssetId(assetId);
        dataSource = await GeoJsonDataSource.load(resource, { clampToGround: true });
      } else {
        const href = typeof spec === "string" ? spec : spec?.href;
        dataSource = await GeoJsonDataSource.load(href, { clampToGround: true });
      }
      const positionsArr = extractPolygonPositions(dataSource);
      cutoutCacheRef.current.set(key, positionsArr);
      return positionsArr;
    } catch (err) {
      console.warn("Cutout load failed for", spec, err);
      cutoutCacheRef.current.set(key, []);
      return [];
    }
  };

  const applyCutoutsForView = useCallback(async (view) => {
    const specs = normalizeCutoutsForView(view);
    if (!specs.length) { setClipping(null); return; }
    const nested = await Promise.all(specs.map(loadSingleCutout));
    const allPositions = nested.flat();
    if (!allPositions.length) { setClipping(null); return; }
    const polygons = allPositions.map((positions) => new ClippingPolygon({ positions }));
    setClipping(new ClippingPolygonCollection({ polygons }));
  }, []);
  // -------------------------------------------------------------------------

  // Tileset klaar → viewer configureren
  const handleTilesetReady = useCallback(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    try {
      // No default Cesium globe or sky
      viewer.scene.globe.show = false;
     // viewer.scene.skyAtmosphere.show = false;
      viewer.scene.skyBox.show = false;

 


      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 50;
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 4000;
      viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

      if (views && Object.keys(views).length > 0) {
        const firstView = Object.values(views)[0];
        if (firstView && Array.isArray(firstView.destination) && firstView.destination.length === 3) {
          viewer.camera.setView({
            destination: Cartesian3.fromDegrees(...firstView.destination),
            orientation: firstView.orientation || {},
          });
        }
        // Apply view-specific cutouts (0/1/many)
        applyCutoutsForView(firstView);
      }
    } catch (err) {
      setError("Failed to configure tileset: " + err.message);
      console.error("Tileset configuration error:", err);
    }
  }, [applyCutoutsForView, views]);

  // Fly-to helper - also updates cutouts to match selected view
  const handleFlyTo = useCallback((view) => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    viewer.camera.cancelFlight();
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(...view.destination),
      orientation: { ...view.orientation },
      duration: 2,
    });
    setSelectedMarker(null);
    applyCutoutsForView(view);
  }, [applyCutoutsForView]);

  // Pano sluiten (alleen state)
  const handlePanoClose = useCallback(() => {
    setSelectedPano(null);
    setSelectedPanoMeta(null);
    // Geen URL-mutaties.
    if (isMobile) setScanOpen(true); // optioneel: scanner terug openen op mobiel
  }, [isMobile]);

   

  // --- Render states ---
  if (error) {
    return (
      <div className="relative w-full" style={{ height: "100dvh", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 text-red-600">
          <div className="text-center p-4 max-w-md">
            <h2 className="text-xl font-bold mb-2">Error Loading Map</h2>
            <p>{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 rounded-full text-white"
              style={{ backgroundColor: "#009391" }}
            >
              Try Again
            </button>
          </div>
        </div>
        {renderQRUI()}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="relative w-full" style={{ height: "100dvh", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="absolute inset-0 flex items-center justify-center bg-[#009391]/5">
           <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-[#009391] border-b-transparent mx-auto" />
            <p className="mt-4" style={{ color: "#009391" }}>Laden 3D Map...</p>
          </div>
        </div>
        {renderQRUI()}
      </div>
    );
  }


  return (
    <div
      className="relative w-full"
      style={{ height: "100dvh", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <Viewer ref={viewerRef} full {...VIEWER_OPTIONS}  >
        {tilesetUrl && (
          <Cesium3DTileset
            url={tilesetUrl}
           maximumScreenSpaceError={isMobile ? 16 : 10}
            maximumMemoryUsage={512}
        //    shadows={ShadowMode.ENABLED}
            clippingPolygons={clipping}
            onReady={handleTilesetReady}
          />
        )}



        {models.map(({ id, url, maximumScreenSpaceError  }) => (
          <Cesium3DTileset
            key={id}
            url={url}
            maximumScreenSpaceError={maximumScreenSpaceError}
            maximumMemoryUsage={512}
           // shadows={ShadowMode.ENABLED}
 onReady={(tileset) => {
      /* tileset.imageBasedLighting = new ImageBasedLighting();
      tileset.imageBasedLighting.imageBasedLightingFactor = new Cartesian2(1.0, 0.0); // [diffuse, specular] */


      
    }}
             
          />
        ))}

        {markers.map((marker) => (
          <Entity
            key={marker.id}
            name={marker.name}
            position={Cartesian3.fromDegrees(marker.longitude, marker.latitude, marker.height)}
            billboard={{ image: "/green_marker.svg", verticalOrigin: VerticalOrigin.BOTTOM, scale: 0.3 }}
            onClick={() => setSelectedMarker(marker)}
          />
        ))}

        {panoramaPoints.map((pano) => (
          <Entity
            key={pano.id}
            name={pano.name}
            position={Cartesian3.fromDegrees(pano.longitude, pano.latitude, pano.height)}
            billboard={{ image: "/blue_marker_light.svg", verticalOrigin: VerticalOrigin.BOTTOM, scale: 0.3 }}
            onClick={() => {
              setSelectedMarker(null);
              openPanoById(pano.id);
            }}
          />
        ))}
      </Viewer>

      {selectedPano && (
        <PanoramaViewer
          image={selectedPano}
          onClose={handlePanoClose}
          initialYawDeg={Number(selectedPanoMeta?.northOffsetDeg ?? 0)}
          gyroscopeAbsolute={false}
        />
      )}

      {/* Nav controls (verborgen bij pano/scanner) */}
      {!selectedPano && !scanOpen && (
        <div
          className="absolute inset-x-0 z-50"
          style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto max-w-full flex gap-2 justify-center flex-wrap overflow-x-auto px-2">
            {Object.entries(views).map(([name, view]) => (
              <FlyToButton
                key={name}
                label={name.charAt(0).toUpperCase() + name.slice(1)}
                onClick={() => handleFlyTo(view)}
                className="flex-shrink-0"
              />
            ))}
            <CameraLogger viewerRef={viewerRef} label="Log View" className="flex-shrink-0" />
          </div>
        </div>
      )}

      <MarkerPopup marker={selectedMarker} onClose={() => setSelectedMarker(null)} />

      {renderQRUI()}
    </div>
  );
}
