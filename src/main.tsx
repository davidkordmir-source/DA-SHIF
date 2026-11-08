import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/vazirmatn";
import "@fontsource-variable/estedad";
import "@fontsource-variable/noto-sans-arabic";
import App from "./App";
import "./styles.css";
import "./themes.css";
import "./appearance.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
