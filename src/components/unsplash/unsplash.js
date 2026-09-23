function displayPhotoCredit(photoData) {
    const creditContainer = document.getElementById('photo-credit');
    const creditLink = document.getElementById('photo-credit-link');

    if (photoData && photoData.user) {
        creditLink.href = photoData.user.links.html + "?utm_source=minimal_new_tab&utm_medium=referral";
        creditLink.textContent = photoData.user.name;
        creditContainer.style.display = 'block';
    } else {
        creditContainer.style.display = 'none';
    }
}

// The original upload is often 5-10MB; ask Unsplash for one sized to this screen
function screenSizedUrl(photo) {
    if (!photo.urls.raw) return photo.urls.full;
    const width = Math.min(3840, Math.round(window.screen.width * (window.devicePixelRatio || 1)));
    return `${photo.urls.raw}&w=${width}&q=80&fm=jpg&fit=max`;
}

async function renderUnsplashBackground(settings, forceRefresh = false) {
    const now = new Date();
    const cachedData = localStorage.getItem('unsplashData');
    const userApiKey = settings.unsplashApiKey;    
    
    let currentTheme = localStorage.getItem('theme') || 'system';
    let themeQuery = '';
    if (currentTheme === 'system') {
        currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (currentTheme === 'dark') {
        themeQuery = ',dark';
    }

    const frequencyMap = {
        '15min': 15 * 60 * 1000,
        '30min': 30 * 60 * 1000,
        'hourly': 60 * 60 * 1000,
        'daily': 24 * 60 * 60 * 1000,
        'weekly': 7 * 24 * 60 * 60 * 1000
    };
    const updateFrequency = frequencyMap[settings.unsplashUpdateFrequency] || frequencyMap['daily'];

    if (userApiKey && settings.showUnsplashRefresh) {
        document.getElementById('refresh-background').style.display = 'inline-flex';
    }

    // Show the last photo right away; if it's due for a change, fetch the next
    // one quietly and swap it in once it has fully downloaded
    if (cachedData) {
        const cached = JSON.parse(cachedData);
        const imageUrl = cached.imageUrl || cached.photo.urls.full;
        applyBackground(imageUrl);
        analyzeAndSetTextColor(imageUrl);
        displayPhotoCredit(cached.photo);
        if (!forceRefresh && (now - new Date(cached.timestamp)) < updateFrequency) {
            return;
        }
    }

    if (!userApiKey) return;

    try {
        const cacheBust = new Date().getTime();
        const apiUrl = `https://api.unsplash.com/photos/random?query=wallpapers${themeQuery}&orientation=landscape&client_id=${userApiKey}&cache_bust=${cacheBust}`;
        const response = await fetch(apiUrl);
        if (response.ok) {
            const newPhoto = await response.json();
            const imageUrl = screenSizedUrl(newPhoto);
            const img = new Image();
            img.onload = () => {
                applyBackground(imageUrl);
                analyzeAndSetTextColor(imageUrl);
                localStorage.setItem('unsplashData', JSON.stringify({
                    timestamp: now.toISOString(),
                    photo: newPhoto,
                    imageUrl
                }));
                displayPhotoCredit(newPhoto);
            };
            img.src = imageUrl;
        }
        else if (response.status === 429) {
            console.warn("Unsplash background refresh rate-limited. Please wait before trying again.");
        }
    } catch (error) {
        console.error("Failed to fetch Unsplash background:", error);
    }
}

export { renderUnsplashBackground };