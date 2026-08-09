(() => {
  const legacy = localStorage.getItem("star-engineer-ui-theme");
  const saved = localStorage.getItem("start-engineer-ui-theme") ?? legacy;
  const allowed = ["fluent", "midnight", "utility", "glass", "system"];
  const selected = allowed.includes(saved || "") ? saved : "utility";
  document.documentElement.dataset.theme = selected === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "midnight" : "utility")
    : selected;
})();
