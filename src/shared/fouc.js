const settings =
  JSON.parse(localStorage.getItem("settings")) || defaultSettings;

document.body.style.backgroundColor = window.matchMedia(
  "(prefers-color-scheme: dark)",
).matches
  ? "#121212"
  : "#f0f0f0";

// Paint the last background in the first frame instead of waiting for main.js
// (only on pages that load utils.js, i.e. the new tab)
if (typeof applyBackground === "function") try {
  if (settings.useUnsplash && settings.unsplashApiKey) {
    const cached = JSON.parse(localStorage.getItem("unsplashData"));
    if (cached) applyBackground(cached.imageUrl || cached.photo.urls.full);
  } else if (settings.backgroundImage) {
    applyBackground(settings.backgroundImage);
  }
} catch {
  /* no cached background yet */
}
