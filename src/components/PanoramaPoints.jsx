// src/components/PanoramaPoints.jsx
import { Entity } from "resium";
import { Cartesian3, VerticalOrigin } from "cesium";
import { useNavigate } from "react-router-dom";

export default function PanoramaPoints({ points }) {
  const navigate = useNavigate();

  return points.map((point) => (
    <Entity
      key={point.id}
      name={point.name}
      position={Cartesian3.fromDegrees(point.longitude, point.latitude, point.height || 0)}
      billboard={{
        image: "/panorama-icon.svg", // your custom icon
        verticalOrigin: VerticalOrigin.BOTTOM,
        scale: 1,
      }}
    
    />
  ));
}
