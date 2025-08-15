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

  // Deep link detection (only for the very first load)
  const deepLinkId = useMemo(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("pano") ?? sp.get("id") ?? null;
  }, []);
  const startedWithDeepLink = useRef(Boolean(deepLinkId)); // true only on first render if URL had pano/id

  // Panorama state
  const [selectedPano, setSelectedPano] = useState(null);
  const [selectedPanoMeta, setSelectedPanoMeta] = useState(null);
  const [panoLoading, setPanoLoading] = useState(Boolean(deepLinkId));

  // Scanner
  const [scanOpen, setScanOpen] = useState(false);

  // Cesium data (always kept in memory; we never unmount Viewer)
  const [tilesetUrl, setTilesetUrl] = useState(null);
  const [models, setModels] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [views, setViews] = useState([]);
  const [panoramaPoints, setPanoramaPoints] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [clipping, setClipping] = useState(null);

  const [isLoading, setIsLoading] = useState(!startedWithDeepLink.current); // if deep-linked, we can defer map loading
  const [error, setError] = useState(null);

  // Resize fix
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

  // Pause/resume render loop when pano overlay is shown
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

  // Load Cesium resources (we keep this component mounted all the time)
  useEffect(() => {
    Ion.defaultAccessToken = ION_TOKEN;
  }, []);

  useEffect(() => {
    // If we started with a deep link, we can defer map fetches until the pano is closed
    if (startedWithDeepLink.current && selectedPano) return;

    const aborter = new AbortController();
    let ignore = false;

    const isAbort = (reason) => reason && (reason.name === "AbortError" || reason.code === 20);

    const loadResources = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const results = await Promise.allSettled([
          IonResource.fromAssetId(TILESET_ASSET_ID),
          fetch("/models.json", { signal: aborter.signal }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("Failed to load models"))
          ),
          fetch("/markers.json", { signal: aborter.signal }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("Failed to load markers"))
          ),
          fetch("/views.json", { signal: aborter.signal }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("Failed to load views"))
          ),
          fetch("/panoramaPoints.json", { signal: aborter.signal }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("Failed to load panorama points"))
          ),
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
        }

        if (results[2].status === "fulfilled") {
          if (!ignore) setMarkers(results[2].value);
        }
        if (results[3].status === "fulfilled") {
          if (!ignore) setViews(results[3].value);
        }
        if (results[4].status === "fulfilled") {
          if (!ignore) setPanoramaPoints(results[4].value);
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
  }, [selectedPano]);

  // Load footprint clipping
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

  // --- QR Scan: open pano WITHOUT navigating ---
  const openPanoById = useCallback(
    async (idOrUrl) => {
      // Accept id or raw value. Try to parse an id first.
      let id = null;
      try {
        const maybeUrl = new URL(String(idOrUrl), window.location.origin);
        const sp = maybeUrl.searchParams;
        id = sp.get("pano") ?? sp.get("id");
        if (!id && !maybeUrl.search) {
          // If it's a bare value or path without query, treat pathname/last segment as id
          id = maybeUrl.pathname.split("/").filter(Boolean).pop();
        }
      } catch {
        id = String(idOrUrl);
      }
      if (!id) return;

      // If pano list not yet loaded, fetch it quickly (no page reload)
      let list = panoramaPoints;
      if (!list || list.length === 0) {
        try {
          setPanoLoading(true);
          const r = await fetch("/panoramaPoints.json");
          if (r.ok) list = await r.json();
        } catch {}
      }
      const found = Array.isArray(list) ? list.find((p) => String(p.id) === String(id)) : null;
      if (!found) {
        setError("Panorama not found: " + id);
        setPanoLoading(false);
        return;
      }

      // Update URL without reloading
      const url2 = new URL(window.location.href);
      url2.searchParams.set("pano", String(found.id));
      window.history.pushState({}, "", url2.toString());

      setSelectedPano(found.imageUrl);
      setSelectedPanoMeta(found);
      setPanoLoading(false);
      setScanOpen(false);
      // Important: we DO NOT unmount the Viewer, so tiles stay in memory.
    },
    [panoramaPoints]
  );

  const handleScanResult = useCallback(
    (result) => {
      const raw = typeof result === "string" ? result : (result?.data ?? result?.text ?? "");
      const value = String(raw).trim();
      if (!value) return;
      openPanoById(value); // no navigation
    },
    [openPanoById]
  );

  // Deep-link on initial load (URL had ?pano= or ?id=)
  useEffect(() => {
    if (!deepLinkId) return;
    (async () => {
      try {
        setPanoLoading(true);
        await openPanoById(deepLinkId);
      } finally {
        setPanoLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId]);

  const handlePanoClose = useCallback(() => {
    // Remove pano params from URL
    const url = new URL(window.location.href);
    url.searchParams.delete("pano");
    url.searchParams.delete("id");
    window.history.pushState({}, "", url.toString());

    setSelectedPano(null);
    setSelectedPanoMeta(null);
    setPanoLoading(false);

    // After a true deep-link close, we may need to load the map just now
    if (startedWithDeepLink.current) {
      startedWithDeepLink.current = false; // so future scans won't defer map
      // Trigger map load if it wasn't done yet
      setIsLoading((x) => x || !tilesetUrl);
    }
  }, [tilesetUrl]);

  // QR UI overlay
  const renderQRUI = useCallback(() => (
    <>
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

  // --- RENDER ---

  if (error) {
    return (
      <div className="relative w-full" style={{ height: "100dvh", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 text-red-600">
          <div className="text-center p-4 max-w-md">
            <h2 className="text-xl font-bold mb-2">Error Loading</h2>
            <p>{error}</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-100 rounded hover:bg-red-200">
              Try Again
            </button>
          </div>
        </div>
        {renderQRUI()}
      </div>
    );
  }

  // Show a light loader only when the pano itself is being fetched
  const showPanoLoader = panoLoading && !selectedPano;

  return (
    <div className="relative w-full" style={{ height: "100dvh", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <Viewer ref={viewerRef} full {...VIEWER_OPTIONS}>
        {/* IMPORTANT:
            - We always keep the Viewer mounted (so memory stays warm).
            - If the app STARTED via deep link, skip creating the tileset while pano is open
              to avoid paying for map data until the user closes the pano. */}
        {tilesetUrl && !(startedWithDeepLink.current && selectedPano) && (
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

        {panoramaPoints.map((p) => (
          <Entity
            key={p.id}
            name={p.name}
            position={Cartesian3.fromDegrees(p.longitude, p.latitude, p.height)}
            billboard={{ image: "/blue_marker.svg", verticalOrigin: VerticalOrigin.BOTTOM, scale: 0.3 }}
            onClick={() => {
              setScanOpen(false);
              setSelectedPano(p.imageUrl);
              setSelectedPanoMeta(p);
              // Update URL without reload
              const url = new URL(window.location.href);
              url.searchParams.set("pano", String(p.id));
              window.history.pushState({}, "", url.toString());
            }}
          />
        ))}
      </Viewer>

      {/* Pano overlay */}
      {(showPanoLoader || selectedPano) && (
        <div className="absolute inset-0 z-[10050]">
          {showPanoLoader && (
            <div className="w-full h-full flex items-center justify-center bg-blue-50">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"></div>
                <p className="mt-4">Panorama Laden...</p>
              </div>
            </div>
          )}

          {selectedPano && (
            <PanoramaViewer
              image={selectedPano}
              onClose={handlePanoClose}
              initialYawDeg={Number(selectedPanoMeta?.northOffsetDeg ?? 0)}
              gyroscopeAbsolute={false}
            />
          )}
        </div>
      )}

      {/* Nav controls (hidden when pano/scanner open) */}
      {!selectedPano && !scanOpen && !isLoading && (
        <div className="absolute inset-x-0 z-50" style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
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

      {/* Initial map loader (won't show during an in-session QR pano) */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-50 z-[10]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"></div>
            <p className="mt-4">Laden 3D Map...</p>
          </div>
        </div>
      )}

      <MarkerPopup marker={selectedMarker} onClose={() => setSelectedMarker(null)} />
      {renderQRUI()}
    </div>
  );
}
