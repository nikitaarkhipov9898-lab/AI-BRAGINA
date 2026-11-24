import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./legacy.css";
import "./index.css";

const mount = document.getElementById("react-mount");
if (mount) createRoot(mount).render(<React.StrictMode><App /></React.StrictMode>);
