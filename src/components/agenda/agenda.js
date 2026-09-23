import { fetchCalendar, startOfDay, addDays, CACHE_VERSION, DAYS_AHEAD } from "./feed.js";

// Local mirror of the latest events so a new tab can paint them synchronously
const CACHE_KEY = "calendarData";
const REFRESH_MS = 5 * 60 * 1000;
const hasExtensionStorage =
    typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

// Earlier builds stored an embed address here; the iCal feed replaces it
localStorage.removeItem("agenda-calendar-src");

function isValid(data, url) {
    return !!data && data.url === url && data.version === CACHE_VERSION;
}

function readCache(url) {
    try {
        const data = JSON.parse(localStorage.getItem(CACHE_KEY));
        return isValid(data, url) ? data : null;
    } catch {
        return null;
    }
}

function formatTime(date, clockFormat) {
    const mins = String(date.getMinutes()).padStart(2, "0");
    if (clockFormat === "12h") {
        const hours = date.getHours() % 12 || 12;
        return `${hours}:${mins}${date.getHours() >= 12 ? "pm" : "am"}`;
    }
    return `${String(date.getHours()).padStart(2, "0")}:${mins}`;
}

function dayLabel(day, today) {
    const diff = Math.round((day - today) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return day.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function dayUrl(day) {
    return `https://calendar.google.com/calendar/r/day/${day.getFullYear()}/${day.getMonth() + 1}/${day.getDate()}`;
}

function makeLink(href, settings) {
    const link = document.createElement("a");
    link.href = href;
    if (settings.openInNewTab) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
    }
    return link;
}

function renderEventList(list, events, settings) {
    list.innerHTML = "";
    const now = Date.now();
    const today = startOfDay(new Date());
    let shown = 0;

    for (let i = 0; i < DAYS_AHEAD; i++) {
        const dayStart = addDays(today, i);
        const dayEnd = addDays(today, i + 1);
        const dayEvents = events.filter((e) =>
            e.allDay
                ? e.start < dayEnd.getTime() && e.end > dayStart.getTime()
                : e.start >= dayStart.getTime() && e.start < dayEnd.getTime(),
        );
        if (dayEvents.length === 0) continue;

        const heading = makeLink(dayUrl(dayStart), settings);
        heading.className = "agenda-day";
        heading.textContent = dayLabel(dayStart, today);
        list.append(heading);

        const ul = document.createElement("ul");
        ul.className = "agenda-events";
        dayEvents
            .sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start))
            .forEach((event) => {
                const li = document.createElement("li");
                const link = makeLink(event.joinUrl || dayUrl(dayStart), settings);
                link.className = "agenda-event";
                if (event.joinUrl) link.title = "Join call";
                if (!event.allDay && event.end <= now) link.classList.add("past");
                if (!event.allDay && event.start <= now && event.end > now) link.classList.add("now");

                const time = document.createElement("span");
                time.className = "agenda-time";
                time.textContent = event.allDay
                    ? "all day"
                    : formatTime(new Date(event.start), settings.clockFormat);

                const title = document.createElement("span");
                title.className = "agenda-title";
                title.textContent = event.title;

                link.append(time, title);
                if (event.joinUrl) {
                    const join = document.createElement("span");
                    join.className = "agenda-join";
                    join.textContent = "join";
                    link.append(join);
                }
                li.append(link);
                ul.append(li);
                shown++;
            });
        list.append(ul);
    }

    if (shown === 0) {
        const empty = document.createElement("p");
        empty.className = "agenda-message";
        empty.textContent = "Nothing on the calendar this week.";
        list.append(empty);
    }
}

function saveIcsUrl(url) {
    const stored = JSON.parse(localStorage.getItem("settings")) || {};
    localStorage.setItem("settings", JSON.stringify({ ...defaultSettings, ...stored, calendarIcsUrl: url }));
    localStorage.removeItem(CACHE_KEY);
}

function renderSetup(container, settings) {
    const form = document.createElement("form");
    form.className = "agenda-setup";

    const hint = document.createElement("p");
    hint.className = "agenda-message";
    hint.textContent =
        'Paste your calendar\'s "Secret address in iCal format" (Google Calendar → Settings → your calendar).';

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "https://calendar.google.com/calendar/ical/...";
    input.className = "agenda-input";

    form.append(hint, input);
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const url = input.value.trim();
        if (!url) return;
        saveIcsUrl(url);
        renderAgenda(container, { ...settings, calendarIcsUrl: url });
    });
    container.append(form);
}

function renderAgenda(container, settings) {
    container.innerHTML = "";

    const header = document.createElement("h3");
    header.className = "agenda-header";
    const title = document.createElement("span");
    title.textContent = "Calendar";
    const open = makeLink("https://calendar.google.com", settings);
    open.className = "agenda-open";
    open.textContent = "open";
    header.append(title, open);
    container.append(header);

    const url = settings.calendarIcsUrl;
    if (!url) {
        renderSetup(container, settings);
        return;
    }

    const list = document.createElement("div");
    list.className = "agenda-list";
    container.append(list);

    let current = readCache(url);
    // Other parts of the page (the next-call bar) listen for fresh events
    const publish = (data) =>
        window.dispatchEvent(new CustomEvent("calendar-data", { detail: data }));
    const show = (data) => {
        current = data;
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        renderEventList(list, data.events, settings);
        publish(data);
    };
    const showError = () => {
        if (current) return;
        list.innerHTML =
            '<p class="agenda-message">Couldn\'t load your calendar. Check the iCal address in Customize.</p>';
    };
    const isStale = (data) =>
        !data || Date.now() - data.fetchedAt > REFRESH_MS ||
        data.fetchedAt < startOfDay(new Date()).getTime();

    if (current) {
        renderEventList(list, current.events, settings);
        publish(current);
    } else {
        list.innerHTML = '<p class="agenda-message">Loading calendar...</p>';
    }

    if (hasExtensionStorage) {
        // The background worker fetches and parses the feed; this page only reads the result
        chrome.storage.local.get(["calendarIcsUrl", "calendarData"]).then((stored) => {
            if (stored.calendarIcsUrl !== url) {
                chrome.storage.local.set({ calendarIcsUrl: url });
            }
            if (isValid(stored.calendarData, url)) show(stored.calendarData);
            if (stored.calendarIcsUrl !== url || isStale(current)) {
                chrome.runtime.sendMessage({ action: "refreshCalendar" });
            }
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== "local") return;
            const data = changes.calendarData && changes.calendarData.newValue;
            if (isValid(data, url)) show(data);
            const error = changes.calendarError && changes.calendarError.newValue;
            if (error && error.url === url) showError();
        });
    } else if (isStale(current)) {
        fetchCalendar(url).then(show).catch((err) => {
            console.error("Calendar fetch failed:", err);
            showError();
        });
    }

    // Keep past/now markers current while the tab stays open
    setInterval(() => {
        if (current) renderEventList(list, current.events, settings);
    }, 60 * 1000);
}

export { renderAgenda, formatTime };
