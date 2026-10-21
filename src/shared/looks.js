// Dot's "looks": same layout, different skin. Chosen in Customize > Appearance and
// kept in localStorage, applied here in <head> so the first frame is already right.
const LOOKS = [
    { id: "dot", name: "Dot", note: "Bold black rules, orange", bg: "#ffffff", ink: "#0b0b0b", acc: "#ff5a1f", rule: "#e7e4de", font: "Schibsted Grotesk", r: 999 },
    { id: "paper", name: "Paper", note: "Warm cream, serif headlines", bg: "#f6f1e7", ink: "#2b2118", acc: "#2f6f4f", rule: "#e4d9c6", font: "Fraunces", r: 999 },
    { id: "terminal", name: "Terminal", note: "All monospace, green", bg: "#0b0d0b", ink: "#d8f5d0", acc: "#39ff88", rule: "#1d261c", font: "JetBrains Mono", r: 3 },
    { id: "swiss", name: "Swiss", note: "Square corners, red, heavy rules", bg: "#ffffff", ink: "#000000", acc: "#e10600", rule: "#e6e6e6", font: "Inter Tight", r: 0 },
    { id: "soft", name: "Soft", note: "Lavender, rounded, light lines", bg: "#f4f3fb", ink: "#2a2840", acc: "#7c5cff", rule: "#e3e1f0", font: "DM Sans", r: 999 },
    { id: "midnight", name: "Midnight", note: "Always dark, navy and cyan", bg: "#0d1321", ink: "#e6edf7", acc: "#3dd6f5", rule: "#1e2a40", font: "Space Grotesk", r: 999 },
    { id: "newsprint", name: "Newsprint", note: "Serif, near-square, ink blue", bg: "#fbfaf7", ink: "#111111", acc: "#1d4ed8", rule: "#dedcd4", font: "Newsreader", r: 2, italic: true },
    { id: "studio", name: "Studio", note: "Blush and magenta, chunky", bg: "#fff7f2", ink: "#1a1020", acc: "#e5197e", rule: "#f0e1e4", font: "Space Grotesk", r: 999 },
];

const LOOK_KEY = "look";

function currentLook() {
    try {
        const id = localStorage.getItem(LOOK_KEY);
        return LOOKS.some((l) => l.id === id) ? id : "dot";
    } catch {
        return "dot";
    }
}

function applyLook(id) {
    const look = LOOKS.find((l) => l.id === id) || LOOKS[0];
    if (look.id === "dot") delete document.documentElement.dataset.ui;
    else document.documentElement.dataset.ui = look.id;
    try {
        localStorage.setItem(LOOK_KEY, look.id);
    } catch {
        /* still applied for this page */
    }
    return look.id;
}

if (currentLook() !== "dot") document.documentElement.dataset.ui = currentLook();
