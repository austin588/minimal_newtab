import { formatTime } from "../agenda/agenda.js";

// How early a meeting counts as "starting" and the join button lights up
const SOON_MS = 2 * 60 * 1000;

function pickEvent(events, now) {
    const endOfDay = new Date(now);
    endOfDay.setHours(24, 0, 0, 0);
    const timed = events.filter((e) => !e.allDay && e.end > now && e.start < endOfDay.getTime());
    // Prefer a call that's underway (with a link) over the next one coming up
    const ongoing = timed.filter((e) => e.start <= now);
    return ongoing.find((e) => e.joinUrl) || timed.find((e) => e.start > now) || ongoing[0] || null;
}

function describeStart(event, now, clockFormat) {
    if (event.start <= now) {
        const left = Math.round((event.end - now) / 60000);
        return left < 60 ? `ends in ${left} min` : `until ${formatTime(new Date(event.end), clockFormat)}`;
    }
    const mins = Math.round((event.start - now) / 60000);
    if (mins <= 1) return "starting";
    if (mins < 60) return `in ${mins} min`;
    return `at ${formatTime(new Date(event.start), clockFormat)}`;
}

function renderNextCall(container, settings) {
    let events = [];

    const update = () => {
        const now = Date.now();
        const event = pickEvent(events, now);
        container.innerHTML = "";
        container.classList.toggle("hidden", !event);
        if (!event) return;

        const live = event.start - now <= SOON_MS;
        container.classList.toggle("live", live);

        const label = document.createElement("span");
        label.className = "next-call-label";
        label.textContent = event.start <= now ? "Now" : "Next";

        const title = document.createElement("span");
        title.className = "next-call-title";
        title.textContent = event.title;

        const when = document.createElement("span");
        when.className = "next-call-when";
        when.textContent = describeStart(event, now, settings.clockFormat);

        container.append(label, title, when);

        if (event.joinUrl) {
            const join = document.createElement("a");
            join.className = "next-call-join";
            join.href = event.joinUrl;
            join.textContent = live ? "Join now" : "join";
            if (settings.openInNewTab) {
                join.target = "_blank";
                join.rel = "noopener noreferrer";
            }
            container.append(join);
        }
    };

    window.addEventListener("calendar-data", (e) => {
        events = e.detail.events || [];
        update();
    });
    setInterval(update, 15 * 1000);
    update();
}

export { renderNextCall };
