import React from "react";
import ReactDOM from "react-dom/client";
import "./theme.css";

function Placeholder() {
  return <div style={{ padding: 24 }}>KSS web — scaffold OK</div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Placeholder />
  </React.StrictMode>
);
