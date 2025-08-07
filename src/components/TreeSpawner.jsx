import { useEffect, useState } from "react";
import { Entity, GeoJsonDataSource } from "resium";
import {
  Cartesian3,
  HeadingPitchRoll,
  Math as CesiumMath,
  Transforms,
  IonResource,
  Color,
  Ion
} from "cesium";
import * as turf from "@turf/turf";

const TREE_COUNT = 100;
const GLB_MODEL_URL = "/tree.glb";
const ION_ASSET_ID = 2988907;

// Cesium Ion Token
const ION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhZjAzZTkxOS02ZjlkLTQ2MjctOWZiNi1kY2Y1NGZkNGRhNDQiLCJpZCI6MTEwMDQwLCJpYXQiOjE2NjQ4ODQxMjV9.6XX7lAjYrYVtE4EzIHaoDV3tDU4NNsHJTbuC5OzUnl4";
Ion.defaultAccessToken = ION_TOKEN;

export default function GeoJsonTreeSpawner() {
  const [treeEntities, setTreeEntities] = useState([]);
  const [geoJsonData, setGeoJsonData] = useState(null);

  useEffect(() => {
    const loadGeoJsonAndSpawnTrees = async () => {
      try {
        const resource = await IonResource.fromAssetId(ION_ASSET_ID);
        const geojson = await resource.fetchJson();

        let polygons;

        if (geojson.type === "FeatureCollection") {
          polygons = geojson.features.filter(
            f => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
          );
        } else if (geojson.type === "Feature") {
          polygons = [geojson];
        } else if (geojson.type === "Polygon" || geojson.type === "MultiPolygon") {
          polygons = [
            {
              type: "Feature",
              geometry: geojson,
              properties: {},
            },
          ];
        } else {
          console.error("Unsupported GeoJSON format:", geojson.type);
          return;
        }

        let mergedPolygon;
        if (polygons.length === 1) {
          mergedPolygon = polygons[0];
        } else if (polygons.length > 1) {
          mergedPolygon = turf.combine(turf.featureCollection(polygons)).features[0];
        } else {
          console.error("No valid polygons found in GeoJSON");
          return;
        }

        const bbox = turf.bbox(mergedPolygon);
        const trees = [];
        let attempts = 0;

        while (trees.length < TREE_COUNT && attempts < TREE_COUNT * 10) {
          const point = turf.randomPoint(1, { bbox }).features[0];
          if (turf.booleanPointInPolygon(point, mergedPolygon)) {
            const [lon, lat] = point.geometry.coordinates;
            const height = 0;

            const position = Cartesian3.fromDegrees(lon, lat, height);
            const heading = CesiumMath.toRadians(Math.random() * 360);
            const hpr = new HeadingPitchRoll(heading, 0, 0);
            const modelMatrix = Transforms.headingPitchRollToFixedFrame(position, hpr);
            const scale = 0.9 + Math.random() * 0.4;

            trees.push({
              id: `tree-${trees.length}`,
              modelMatrix,
              scale,
            });
          }
          attempts++;
        }

        setTreeEntities(trees);
        setGeoJsonData(geojson); // for visualizing
      } catch (err) {
        console.error("Failed to load or process GeoJSON:", err);
      }
    };

    loadGeoJsonAndSpawnTrees();
  }, []);

  return (
    <>
      {/* Tree Entities */}
      {treeEntities.map((tree) => (
        <Entity
          key={tree.id}
          model={{
            uri: GLB_MODEL_URL,
            scale: tree.scale,
            minimumPixelSize: 64,
          }}
          modelMatrix={tree.modelMatrix}
        />
      ))}

      {/* Visualize GeoJSON boundary as overlay */}
      {geoJsonData && (
        <GeoJsonDataSource
          data={geoJsonData}
          stroke={Color.YELLOW}
          fill={Color.YELLOW.withAlpha(0.2)}
          strokeWidth={2}
          clampToGround= {true}
        />
      )}
    </>
  );
}
