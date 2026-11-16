import { render } from "preact";
import { App } from "./App.tsx";
import "./styles.css";

// Light is the default. A visitor's own choice of dark, made with the toggle, is kept in this browser.
let saved: string | null = null;
try {
  saved = localStorage.getItem("theme");
} catch {
  // Storage can be blocked (private windows, strict settings); fall back to light.
}
document.documentElement.dataset.theme = saved === "dark" ? "dark" : "light";

render(<App />, document.getElementById("app")!);
