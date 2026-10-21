// Cycles through the stoic quotes in a shuffled order that carries over between
// tabs, so you see every quote once before any comes back around.
const ORDER_KEY = "quoteOrder";
const POS_KEY = "quotePos";
const ROTATE_MS = 20 * 1000;
const FADE_MS = 400;

function shuffledOrder(count) {
    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
}

function readOrder(count) {
    try {
        const order = JSON.parse(localStorage.getItem(ORDER_KEY));
        if (Array.isArray(order) && order.length === count) return order;
    } catch {
        /* start a fresh order */
    }
    const order = shuffledOrder(count);
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
    localStorage.setItem(POS_KEY, "0");
    return order;
}

// Next quote in the shared order; reshuffles once the whole list has been shown
function nextQuote(quotes) {
    let order = readOrder(quotes.length);
    let pos = Number(localStorage.getItem(POS_KEY)) || 0;
    if (pos >= order.length) {
        order = shuffledOrder(quotes.length);
        localStorage.setItem(ORDER_KEY, JSON.stringify(order));
        pos = 0;
    }
    localStorage.setItem(POS_KEY, String(pos + 1));
    return quotes[order[pos]];
}

function renderQuote(container) {
    const quotes = typeof stoicQuotes !== "undefined" ? stoicQuotes : [];
    if (quotes.length === 0) {
        container.style.display = "none";
        return;
    }

    container.title = "Click for another";
    container.innerHTML = `
        <blockquote class="quote-text"><span class="quote-line"></span></blockquote>
        <figcaption class="quote-by"><span class="quote-author"></span><span class="quote-source"></span></figcaption>
    `;
    const text = container.querySelector(".quote-line");
    const author = container.querySelector(".quote-author");
    const source = container.querySelector(".quote-source");

    const fill = (quote) => {
        text.textContent = quote.text;
        author.textContent = quote.author;
        source.textContent = quote.source || "";
    };

    let fading = false;
    const advance = () => {
        if (fading) return;
        fading = true;
        container.classList.add("fading");
        setTimeout(() => {
            fill(nextQuote(quotes));
            container.classList.remove("fading");
            fading = false;
        }, FADE_MS);
    };

    fill(nextQuote(quotes));

    // Hold still while you're reading it (hover) or the tab is in the background
    let timer = setInterval(advance, ROTATE_MS);
    const pause = () => clearInterval(timer);
    const resume = () => {
        clearInterval(timer);
        timer = setInterval(advance, ROTATE_MS);
    };
    container.addEventListener("mouseenter", pause);
    container.addEventListener("mouseleave", resume);
    document.addEventListener("visibilitychange", () => (document.hidden ? pause() : resume()));
    container.addEventListener("click", () => {
        // Let people select a line to copy without skipping past it
        if (String(window.getSelection())) return;
        advance();
    });
}

export { renderQuote };
