// Fetches an iCal feed and expands it into the next week's events. Shared by the
// background worker (which keeps it fresh) and the new tab page (as a fallback).
import ICAL from "../../lib/ical.min.js";

export const CACHE_VERSION = 3;
export const DAYS_AHEAD = 7;

export function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

const MEETING_URL_PATTERNS = [
    /https:\/\/meet\.google\.com\/[a-z0-9-]+/i,
    /https:\/\/[\w.-]*zoom\.us\/(?:j|my|w)\/[^\s<>"'\\,)]+/i,
    /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"'\\)]+/i,
    /https:\/\/teams\.live\.com\/meet\/[^\s<>"'\\)]+/i,
    /https:\/\/[\w.-]*webex\.com\/[^\s<>"'\\,)]+/i,
    /https:\/\/[\w.-]*gotomeeting\.com\/join\/[^\s<>"'\\,)]+/i,
    /https:\/\/app\.chime\.aws\/meetings\/[^\s<>"'\\,)]+/i,
    /https:\/\/whereby\.com\/[^\s<>"'\\,)]+/i,
    /https:\/\/around\.co\/[^\s<>"'\\,)]+/i,
];

// Find the video call link: Google's conference field first, then location/description
function findMeetingUrl(item) {
    const conference = item.component.getFirstPropertyValue("x-google-conference");
    const fields = [conference, item.location, item.description];
    for (const field of fields) {
        if (!field) continue;
        const text = String(field);
        for (const pattern of MEETING_URL_PATTERNS) {
            const match = text.match(pattern);
            if (match) return match[0];
        }
    }
    return null;
}

function icsDate(date) {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

// Full parsing is slow, and most of a feed is years of past one-off events. Drop
// any event whose dates can't touch the window (with a day of slack for timezones)
// before handing the rest to ical.js. Recurring events are always kept.
function trimFeed(icsText, from, to) {
    const lo = icsDate(addDays(from, -1));
    const hi = icsDate(addDays(to, 1));
    const dateOf = (block, name) => {
        const match = block.match(new RegExp(`^${name}[^:\\r\\n]*:(\\d{8})`, "m"));
        return match ? match[1] : null;
    };
    return icsText.replace(/BEGIN:VEVENT[\s\S]*?END:VEVENT\r?\n?/g, (block) => {
        if (/^(RRULE|RDATE)/m.test(block)) return block;
        const start = dateOf(block, "DTSTART");
        if (!start) return block;
        const end = dateOf(block, "DTEND") || start;
        const inWindow = (d) => d >= lo && d <= hi;
        const overlaps = start <= hi && end >= lo;
        // A moved occurrence matters if either its old or new slot is in the window
        const original = dateOf(block, "RECURRENCE-ID");
        return overlaps || (original && inWindow(original)) ? block : "";
    });
}

// Start a daily/weekly series near the window instead of stepping through every
// occurrence since it was created. Shifting by whole weeks keeps the pattern intact.
function iteratorNear(event, from) {
    const rule = event.component.getFirstPropertyValue("rrule");
    if (!rule || rule.count || !["DAILY", "WEEKLY"].includes(rule.freq)) {
        return event.iterator();
    }
    const stepDays = 7 * (rule.interval || 1);
    const gapDays = (from - event.startDate.toJSDate()) / 86400000 - 7;
    if (gapDays <= stepDays) return event.iterator();
    const start = event.startDate.clone();
    start.adjust(Math.floor(gapDays / stepDays) * stepDays, 0, 0, 0);
    return event.iterator(start);
}

// Work out whose calendar this is: Google puts the calendar id (your email for a
// primary calendar) in the feed address and in the calendar's name
function calendarOwner(url, root) {
    const fromUrl = url.match(/\/calendar\/ical\/([^/]+)\//);
    const candidates = [
        fromUrl && decodeURIComponent(fromUrl[1]),
        root.getFirstPropertyValue("x-wr-calname"),
    ];
    const email = candidates.find((c) => c && String(c).includes("@"));
    return email ? String(email).toLowerCase() : null;
}

function declinedBy(item, owner) {
    if (!owner) return false;
    return item.component.getAllProperties("attendee").some((attendee) => {
        const address = String(attendee.getFirstValue() || "").toLowerCase().replace(/^mailto:/, "");
        const status = String(attendee.getParameter("partstat") || "").toUpperCase();
        return address === owner && status === "DECLINED";
    });
}

function expandEvents(icsText, from, to, url = "") {
    const root = new ICAL.Component(ICAL.parse(trimFeed(icsText, from, to)));
    const owner = calendarOwner(url, root);
    root.getAllSubcomponents("vtimezone").forEach((tz) => {
        ICAL.TimezoneService.register(new ICAL.Timezone(tz));
    });

    // Group moved/edited occurrences with the recurring event they belong to
    const events = new Map();
    const exceptions = [];
    root.getAllSubcomponents("vevent").forEach((vevent) => {
        const event = new ICAL.Event(vevent);
        if (event.isRecurrenceException()) {
            exceptions.push(event);
        } else {
            events.set(event.uid, event);
        }
    });
    exceptions.forEach((exception) => {
        const master = events.get(exception.uid);
        if (master) {
            master.relateException(exception);
        } else {
            events.set(exception.uid + exception.recurrenceId, exception);
        }
    });

    const occurrences = [];
    const add = (item, startTime, endTime) => {
        const status = item.component.getFirstPropertyValue("status");
        if (status && String(status).toUpperCase() === "CANCELLED") return;
        if (declinedBy(item, owner)) return;
        const start = startTime.toJSDate();
        const end = endTime ? endTime.toJSDate() : start;
        if (end <= from || start >= to) return;
        occurrences.push({
            title: item.summary || "(No title)",
            start: start.getTime(),
            end: end.getTime(),
            allDay: startTime.isDate,
            joinUrl: findMeetingUrl(item),
        });
    };

    events.forEach((event) => {
        if (!event.isRecurring()) {
            add(event, event.startDate, event.endDate);
            return;
        }
        const iterator = iteratorNear(event, from);
        let next;
        let guard = 0;
        while ((next = iterator.next()) && guard++ < 20000) {
            if (next.toJSDate() >= to) break;
            const details = event.getOccurrenceDetails(next);
            add(details.item, details.startDate, details.endDate);
        }
    });

    return occurrences.sort((a, b) => a.start - b.start);
}

async function fetchCalendar(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const from = startOfDay(new Date());
    const events = expandEvents(await response.text(), from, addDays(from, DAYS_AHEAD), url);
    return { version: CACHE_VERSION, url, fetchedAt: Date.now(), events };
}

export { fetchCalendar };
