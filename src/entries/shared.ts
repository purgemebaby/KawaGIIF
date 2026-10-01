export function suppressBrowserContextMenu() {
  window.addEventListener("contextmenu", (e) => {
    if (import.meta.env.DEV && e.shiftKey) return;
    e.preventDefault();
  });
}

export function makeWindowTransparent() {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}
