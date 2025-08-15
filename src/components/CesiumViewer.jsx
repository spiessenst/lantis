import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Viewer, Cesium3DTileset, Entity } from "resium";
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
} from "cesium";

import FlyToButton from "./FlyToButton";
import MarkerPopup from "./MarkerPopup";
import CameraLogger from "./CameraLogger";
import PanoramaViewer from "./PanoramaViewer";
import QRScanner from "./QRScanner";

// Use env token if present; set it here like you had
const ION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmZGUxMjY5Ni0wZTAyLTQ5MDAtYTUxZi1jZjRjMTIyMzRmM2QiLCJpZCI6MTQ4MjkwLCJpYXQiOjE3NTQ2NjM0Nzd9.yFKwuluk4NO594-ARWwRcxOWlvLCbycKW3YBWnDOfTs";
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
  terrainShadows: ShadowMode.ENABLED,
  shouldAnimate: false,
  requestRenderMode: true,
  maximumRenderTimeChange: 0.0,
};
const TILESET_ASSET_ID = 2275207;

// Simple device check for behavior (not styling)
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

  // --- Deep link: pano-only mode ---
  const deepLinkId = useMemo(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("pano") ?? sp.get("id") ?? null;
  }, []);

  const [panoOnly, setPanoOnly] = useState(Boolean(deepLinkId));
  const [panoOnlyLoading, setPanoOnlyLoading] = useState(Boolean(deepLinkId));

  const [selectedPano, setSelectedPano] = useState(null);       // image url
  const [selectedPanoMeta, setSelectedPanoMeta] = useState(null); // lat/lng, northOffsetDeg
  const [scanOpen, setScanOpen] = useState(false);               // mobile scanner

  // Cesium state (only when !panoOnly)
  const [tilesetUrl, setTilesetUrl] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [views, setViews] = useState([]);
  const [isLoading, setIsLoading] = useState(!panoOnly);
  const [error, setError] = useState(null);
  const [clipping, setClipping] = useState(null);
  const [panoramaPoints, setPanoramaPoints] = useState([]);

  // Ensure Cesium canvas resizes to true viewport height on device rotation/resize
  useEffect(() => {
    const onResize = () => {
      const v = viewerRef.current?.cesiumElement;
      try {
        v?.resize?.();
        v?.scene?.requestRender?.();
      } catch {}
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

    useEffect(() => {
    const v = viewerRef.current?.cesiumElement;
    if (!v) return;
          const canvas = v.canvas;
    if (selectedPano) {
       v.useDefaultRenderLoop = false; // hard pause
    if (canvas) canvas.style.visibility = "hidden";
    } else {
      v.useDefaultRenderLoop = true;  // resume
    if (canvas) canvas.style.visibility = "visible";
     v.scene.requestRender();        // render once to refresh
    }
  }, [selectedPano]);

  // --- QR Scan result handler ---
  const handleScanResult = useCallback((result) => {
    const raw = typeof result === "string" ? result : (result?.data ?? result?.text ?? "");
    const value = String(raw).trim();
    if (!value) return;

    try {
      const url = new URL(value, window.location.origin);
      if (url.protocol === "http:" || url.protocol === "https:" || value.startsWith("/")) {
        window.location.assign(url.toString());
        return;
      }
    } catch {
      // not a URL
    }

    const url2 = new URL(window.location.href);
    url2.searchParams.set("pano", value);
    window.location.assign(url2.toString());
  }, []);

  // Helper to render the mobile QR FAB + overlay consistently in every state
  const renderQRUI = useCallback(() => (
    <>
      {/* Mobile-only QR button; hidden when pano/scanner open */}
      {!scanOpen && !selectedPano && (
        <button
          onClick={() => setScanOpen(true)}
          className="fixed top-5 left-5 z-[10060] rounded-full p-4 bg-white/90 shadow-lg border border-black/10 md:hidden pointer-events-auto"
          aria-label="Scan QR"
          type="button"
        >
          📷 Scan QR
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

  // --- PANO-ONLY FLOW (deep link) ---
  useEffect(() => {
    if (!panoOnly) return;

    let aborted = false;
    (async () => {
      try {
        setPanoOnlyLoading(true);
        const r = await fetch("/panoramaPoints.json");
        if (!r.ok) throw new Error("Failed to load panorama points");
        const list = await r.json();
        const found = list.find((p) => String(p.id) === String(deepLinkId));
        if (!found) throw new Error("Panorama not found: " + deepLinkId);
        if (aborted) return;
        setSelectedPano(found.imageUrl);
        setSelectedPanoMeta(found); // includes northOffsetDeg
      } catch (e) {
        if (!aborted) setError(e.message);
      } finally {
        if (!aborted) setPanoOnlyLoading(false);
      }
    })();
    return () => { aborted = true; };
  }, [panoOnly, deepLinkId]);

  const closePanoOnly = useCallback(() => {
    // strip query, stay lightweight (no Cesium)
    const url = new URL(window.location.href);
    url.searchParams.delete("pano");
    url.searchParams.delete("id");
    window.history.replaceState({}, "", url.toString());
    setSelectedPano(null);
    setSelectedPanoMeta(null);
     setPanoOnly(false);          // leave pano-only branch
   setPanoOnlyLoading(false);   // kill loading overlay if any
    if (isMobile) setScanOpen(true); // return to scanner on mobile
  }, [isMobile]);

  if (panoOnly) {
    // Full-screen container so we can layer the FAB/Scanner over loaders too
    return (
      <div
        className="relative w-full"
        style={{ height: "100dvh", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {error && (
          <div className="w-full h-full flex items-center justify-center bg-red-50 text-red-600">
            <div className="text-center p-4 max-w-md">
              <h2 className="text-xl font-bold mb-2">Error</h2>
              <p>{error}</p>
            </div>
          </div>
        )}

        {!error && (panoOnlyLoading || !selectedPano) && (
          <div className="w-full h-full flex items-center justify-center bg-blue-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-4 text-blue-600">Panorama Laden...</p>
            </div>
          </div>
        )}

        {!error && selectedPano && (
          <PanoramaViewer
            image={selectedPano}
            onClose={closePanoOnly}
            initialYawDeg={Number(selectedPanoMeta?.northOffsetDeg ?? 0)}
            gyroscopeAbsolute={false}
          />
        )}

        {renderQRUI()}
      </div>
    );
  }

  // --- FULL CESIUM FLOW ---
  useEffect(() => {
    Ion.defaultAccessToken = ION_TOKEN;
  }, []);

  useEffect(() => {
    const aborter = new AbortController();
    let ignore = false;

    const isAbort = (reason) =>
      reason && (reason.name === "AbortError" || reason.code === 20);

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

        // Tileset (critical)
        if (results[0].status === "fulfilled") {
          if (!ignore) setTilesetUrl(results[0].value);
        } else if (!isAbort(results[0].reason)) {
          console.error(results[0].reason);
          if (!ignore) setError((e) => (e ? e + " | Tileset failed" : "Tileset failed"));
        }

        // Models (optional)
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

        // Markers (optional)
        if (results[2].status === "fulfilled") {
          if (!ignore) setMarkers(results[2].value);
        } else if (!isAbort(results[2].reason)) {
          console.warn(results[2].reason || "Markers failed (non-critical)");
        }

        // Views (optional)
        if (results[3].status === "fulfilled") {
          if (!ignore) setViews(results[3].value);
        } else if (!isAbort(results[3].reason)) {
          console.warn(results[3].reason || "Views failed (non-critical)");
        }

        // Panoramas (optional)
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

  const loadGeoJsonFromIon = useCallback(async (viewer) => {
    if (!viewer) return;
    try {
      const resource = await IonResource.fromAssetId(3617274);
      const dataSource = await GeoJsonDataSource.load(resource, { clampToGround: true });
      const footprint = dataSource.entities.values.find((e) => defined(e.polygon));
      if (!footprint) return;
      const hierarchy = footprint.polygon.hierarchy.getValue();
      const positions = hierarchy?.positions ?? [];
      if (!positions.length) return;
      const clippingPolygons = new ClippingPolygonCollection({
        polygons: [new ClippingPolygon({ positions })],
      });
      setClipping(clippingPolygons);
    } catch (err) {
      setError(err.message);
      console.error("Failed to load or process GeoJSON:", err);
    }
  }, []);

  const handleTilesetReady = useCallback(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    try {
      viewer.scene.globe.show = false;
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
      }
    } catch (err) {
      setError("Failed to configure tileset: " + err.message);
      console.error("Tileset configuration error:", err);
    }
    loadGeoJsonFromIon(viewer);
  }, [loadGeoJsonFromIon, views]);

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
  }, []);

  const handlePanoClose = useCallback(() => {
    setSelectedPano(null);
    setSelectedPanoMeta(null);
    if (isMobile) setScanOpen(true); // back to scanner on mobile
  }, [isMobile]);

  // ERROR: still show QR UI
  if (error) {
    return (
      <div
        className="relative w-full"
        style={{ height: "100dvh", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 text-red-600">
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
        {renderQRUI()}
      </div>
    );
  }

  // LOADING: still show QR UI
  if (isLoading) {
    return (
      <div
        className="relative w-full"
        style={{ height: "100dvh", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="absolute inset-0 flex items-center justify-center bg-blue-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-blue-600">Laden 3D Map...</p>
          </div>
        </div>
        {renderQRUI()}
      </div>
    );
  }

  // READY
  return (
    <div
      className="relative w-full"
      style={{ height: "100dvh", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <Viewer ref={viewerRef} full {...VIEWER_OPTIONS}>
        {tilesetUrl && (
          <Cesium3DTileset
            url={tilesetUrl}
            maximumScreenSpaceError={16}
            maximumMemoryUsage={512}
            shadows={ShadowMode.ENABLED}
            clippingPolygons={clipping}
            onReady={handleTilesetReady}
          />
        )}

        {models.map(({ id, url, maximumScreenSpaceError = 16 }) => (
          <Cesium3DTileset
            key={id}
            url={url}
            maximumScreenSpaceError={maximumScreenSpaceError}
            maximumMemoryUsage={512}
            shadows={ShadowMode.ENABLED}
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
            billboard={{ image: "/blue_marker.svg", verticalOrigin: VerticalOrigin.BOTTOM, scale: 0.3 }}
            onClick={() => {
              setSelectedPano(pano.imageUrl);
              setSelectedPanoMeta(pano); // has northOffsetDeg
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

    {/* nav controls (hidden when pano/scanner open) */}
{!selectedPano && !scanOpen && (
  <div
    className="absolute inset-x-0 z-50"
    style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
  >
    <div
      className="
        mx-auto max-w-full
        flex gap-2 justify-center
        flex-wrap
        overflow-x-auto
        px-2
      "
      // No background, no shadow, no rounded corners
    >
      {Object.entries(views).map(([name, view]) => (
        <FlyToButton
          key={name}
          label={name.charAt(0).toUpperCase() + name.slice(1)}
          onClick={() => handleFlyTo(view)}
          className="flex-shrink-0"
        />
      ))}
      <CameraLogger
        viewerRef={viewerRef}
        label="Log View"
        className="flex-shrink-0"
      />
    </div>
  </div>
)}

      <MarkerPopup marker={selectedMarker} onClose={() => setSelectedMarker(null)} />

      {renderQRUI()}
    </div>
  );
}
