function loadStylesheet(filename) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = filename; // e.g., 'styles.css' or 'theme.css'
  document.head.appendChild(link);
}

function applyTheme(theme) {
  document.body.classList.remove("dark", "light");
  if (theme === "dark") {
    document.body.classList.add("dark");
  } else if (theme === "light") {
    document.body.classList.add("light");
  } else {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.body.classList.add("dark");
    } else {
      document.body.classList.add("light");
    }
  }

  const iconContainer = document.querySelector(".theme-icon");
  const label = document.querySelector(".theme-label");
  iconContainer.innerHTML = icons[theme];
  label.textContent = theme[0].toUpperCase() + theme.slice(1);

  const customizeContainer = document.querySelector(".customize-icon");
  if (theme == "system") {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      customizeContainer.innerHTML = customizeIcon["dark"];
    } else {
      customizeContainer.innerHTML = customizeIcon["light"];
    }
  } else {
    customizeContainer.innerHTML = customizeIcon[theme];
  }
}

// Remember the text color picked for a background so the next tab paints it
// immediately instead of re-analysing the image
function textColorCacheKey(imageUrl) {
  return `${imageUrl.length}:${imageUrl.slice(0, 80)}${imageUrl.slice(-40)}`;
}

function cachedTextColor(imageUrl) {
  try {
    const cached = JSON.parse(localStorage.getItem("bgTextColor"));
    return cached && cached.key === textColorCacheKey(imageUrl) ? cached.color : null;
  } catch {
    return null;
  }
}

// Paint a background (and its known text color) right away
function applyBackground(imageUrl) {
  const style = document.body.style;
  style.backgroundImage = `url("${imageUrl}")`;
  style.backgroundSize = "cover";
  style.backgroundPosition = "center";
  const color = cachedTextColor(imageUrl);
  if (color) style.color = color;
}

function analyzeAndSetTextColor(imageUrl) {
  const known = cachedTextColor(imageUrl);
  if (known) {
    document.body.style.color = known;
    return;
  }

  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.src = imageUrl;

  img.onload = () => {
    // A small thumbnail gives the same average brightness at a fraction of the cost
    const size = 32;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = size;
    canvas.height = size;
    // Sample the middle half of the image, where the clock and columns sit
    ctx.drawImage(img, img.width / 4, img.height / 4, img.width / 2, img.height / 2, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size).data;

    let r = 0,
      g = 0,
      b = 0;
    for (let i = 0; i < imageData.length; i += 4) {
      r += imageData[i];
      g += imageData[i + 1];
      b += imageData[i + 2];
    }
    const pixelCount = imageData.length / 4;
    const luminance =
      0.299 * (r / pixelCount) +
      0.587 * (g / pixelCount) +
      0.114 * (b / pixelCount);
    const color = luminance > 128 ? "#222" : "#f0f0f0";
    document.body.style.color = color;
    try {
      localStorage.setItem("bgTextColor", JSON.stringify({ key: textColorCacheKey(imageUrl), color }));
    } catch {
      /* storage full; the color still applies to this tab */
    }
  };
}
