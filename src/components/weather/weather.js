function setWeatherClickable(city) {
    const weatherEl = document.getElementById('weather');
    weatherEl.style.cursor = 'pointer';
    weatherEl.onclick = () => window.open(`https://www.google.com/search?q=Weather+${encodeURIComponent(city)}`, '_blank');
}

const weatherCodes = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Severe thunderstorm"
};

const WEATHER_FRESH_MS = 30 * 60 * 1000;

// True once last-known weather is on screen; a failed refresh then keeps it
// instead of replacing it with an error
let showingCached = false;

function showWeatherMessage(message) {
    if (!showingCached) document.getElementById('weather').textContent = message;
}

function readWeatherCache(tempUnit) {
    try {
        const cached = JSON.parse(localStorage.getItem('weatherData'));
        // Ignore a reading taken in the other unit
        if (!cached || (cached.tempUnit && cached.tempUnit !== tempUnit)) return null;
        return cached;
    } catch {
        return null;
    }
}

function fetchWeatherAndCity(lat, lon, tempUnit = 'celsius') {
    const now = new Date();
    const tempUnitParam = tempUnit === 'fahrenheit' ? '&temperature_unit=fahrenheit' : '';

    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true${tempUnitParam}`)
        .then(res => res.json())
        .then(data => {
            const temp = Math.round(data.current_weather.temperature);
            const code = data.current_weather.weathercode;
            const desc = weatherCodes[code] || `Code ${code}`;
            let weatherText = `${desc}, ${temp}°${tempUnit === 'celsius' ? 'C' : 'F'}`;

            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
                .then(res => res.json())
                .then(location => {
                    const city = location.address.city || location.address.town || location.address.village || location.address.county || "your area";
                    const weatherString = `${city}: ${weatherText}`;
                    document.getElementById('weather').textContent = weatherString;
                    setWeatherClickable(city);
                    
                    localStorage.setItem('weatherData', JSON.stringify({
                        text: weatherString,
                        timestamp: now.toISOString(),
                        tempUnit
                    }));
                })
                .catch(() => {
                    if (showingCached) return;
                    document.getElementById('weather').textContent = weatherText;
                    setWeatherClickable("your area");
                });
        })
        .catch(() => showWeatherMessage("Unable to fetch weather."));
}

function fetchWeatherByCity(city, tempUnit = 'celsius') {
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}`)
        .then(res => res.json())
        .then(data => {
            if (data.length > 0) {
                const { lat, lon } = data[0];
                fetchWeatherAndCity(lat, lon, tempUnit);
            } else {
                showWeatherMessage("City not found");
            }
        })
        .catch(() => showWeatherMessage("Unable to fetch weather"));
}

function renderWeather(settings) {
    const useCustomCity = settings.useCustomCity;
    const tempUnit = settings.tempUnit || 'celsius';

    // Show the last reading immediately; only go to the network when it's stale
    const cached = readWeatherCache(tempUnit);
    if (cached) {
        document.getElementById('weather').textContent = cached.text;
        setWeatherClickable(cached.text.split(': ')[0]);
        showingCached = true;
        if (Date.now() - new Date(cached.timestamp) < WEATHER_FRESH_MS) return;
    } else {
        document.getElementById('weather').textContent = "Fetching weather...";
    }

    // Accept a recent location fix instead of waiting on a fresh one
    const geoOptions = { maximumAge: WEATHER_FRESH_MS, timeout: 15000 };
    if (useCustomCity && settings.customCity) {
        const customCity = settings.customCity;
        fetchWeatherByCity(customCity, tempUnit);
    } else {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => fetchWeatherAndCity(pos.coords.latitude, pos.coords.longitude, tempUnit),
                () => {
                    setTimeout(() => {
                        navigator.geolocation.getCurrentPosition(
                            pos => fetchWeatherAndCity(pos.coords.latitude, pos.coords.longitude, tempUnit),
                            () => showWeatherMessage("Location access denied."),
                            geoOptions
                        );
                    }, 100);
                },
                geoOptions
            );
        } else {
            showWeatherMessage("Geolocation not supported.");
        }
    }
}


export { renderWeather };