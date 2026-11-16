import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import Join from "./Join.jsx";
import Participant from "./Participant.jsx";
import Me from "./Me.jsx";
import Operator from "./Operator.jsx";
import Create from "./Create.jsx";

function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [page, arg] = h.split("/");
  return { page: page || "", arg: arg ? decodeURIComponent(arg) : "" };
}

function App() {
  const [r, setR] = useState(route());
  useEffect(() => {
    const on = () => { setR(route()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  if (r.page === "s") return <Participant token={r.arg} />;
  if (r.page === "me") return <Me token={r.arg} />;
  if (r.page === "op") return <Operator adminKey={r.arg} />;
  if (r.page === "new") return <Create master={r.arg} />;
  return <Join key={r.arg} code={r.page === "j" ? r.arg : ""} />;
}

createRoot(document.getElementById("root")).render(<App />);
