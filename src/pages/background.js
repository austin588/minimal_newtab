import { fetchCalendar } from "../components/agenda/feed.js";

let overlayVisible = false;

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-overlay") {
    toggleOverlay();
  } else if (command === "open-options") {
    chrome.tabs.create({ url: "pages/options/options.html" });
  }
});

async function toggleOverlay() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (overlayVisible) {
    chrome.tabs.sendMessage(tab.id, { action: "hideOverlay" });
    overlayVisible = false;
  } else {
    chrome.tabs.sendMessage(tab.id, { action: "showOverlay" });
    overlayVisible = true;
  }
}

chrome.tabs.onRemoved.addListener(() => {
  overlayVisible = false;
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "overlayHidden") {
    overlayVisible = false;
  }
});

// Calendar: fetch and parse the iCal feed here so new tabs only read the result
const CALENDAR_ALARM = "calendar-refresh";
let calendarRefresh = null;

function refreshCalendar() {
  if (calendarRefresh) return calendarRefresh;
  calendarRefresh = (async () => {
    const { calendarIcsUrl: url } = await chrome.storage.local.get("calendarIcsUrl");
    if (!url) return;
    try {
      const calendarData = await fetchCalendar(url);
      await chrome.storage.local.set({ calendarData });
    } catch (err) {
      console.error("Calendar fetch failed:", err);
      await chrome.storage.local.set({ calendarError: { url, at: Date.now() } });
    }
  })().finally(() => {
    calendarRefresh = null;
  });
  return calendarRefresh;
}

chrome.alarms.get(CALENDAR_ALARM).then((alarm) => {
  if (!alarm) chrome.alarms.create(CALENDAR_ALARM, { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CALENDAR_ALARM) refreshCalendar();
});

chrome.runtime.onStartup.addListener(refreshCalendar);

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "refreshCalendar") refreshCalendar();
});
