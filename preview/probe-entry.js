/* Probe-only entry: bundles React in so the page renders offline for
   screenshots. The published preview uses UMD globals instead (entry.js). */
import React from "react";
import { createRoot } from "react-dom/client";
import App from "../legacy/travel-logistics-tracker.jsx";
createRoot(document.getElementById("root")).render(React.createElement(App));
