(function () {
  "use strict";

  const INPUT_ID = "quick-command-input";
  const SELECTED_CLASS = "selected";
  const NUMBER_HINT_CLASS = "number-hint";
  const SEARCH_MODE_CLASS = "search-mode";
  const SEARCH_RESULT_CLASS = "search-result";

  let inputElement = null;
  let currentIndex = -1;
  let currentItem = null;
  let allItems = [];
  let isActive = false;
  let isSearchMode = false;
  let originalShortcutsContent = null;
  let searchResults = [];
  let searchPending = false;
  let debounceTimer = null;
  let modifierKey = null;
  let isBangMode = false;
  let currentBangSuggestions = [];

  const BANGS = [
    { trigger: "g", name: "Google", domain: "google.com", searchUrl: "https://www.google.com/search?q={query}", homeUrl: "https://www.google.com" },
    { trigger: "yt", name: "YouTube", domain: "youtube.com", searchUrl: "https://www.youtube.com/results?search_query={query}", homeUrl: "https://www.youtube.com" },
    { trigger: "w", name: "Wikipedia", domain: "en.wikipedia.org", searchUrl: "https://en.wikipedia.org/w/index.php?search={query}", homeUrl: "https://en.wikipedia.org" },
    { trigger: "gh", name: "GitHub", domain: "github.com", searchUrl: "https://github.com/search?q={query}", homeUrl: "https://github.com" },
    { trigger: "r", name: "Reddit", domain: "reddit.com", searchUrl: "https://www.reddit.com/search/?q={query}", homeUrl: "https://www.reddit.com" },
    { trigger: "tw", name: "X / Twitter", domain: "x.com", searchUrl: "https://x.com/search?q={query}", homeUrl: "https://x.com" },
    { trigger: "a", name: "Amazon", domain: "amazon.com", searchUrl: "https://www.amazon.com/s?k={query}", homeUrl: "https://www.amazon.com" },
    { trigger: "so", name: "Stack Overflow", domain: "stackoverflow.com", searchUrl: "https://stackoverflow.com/search?q={query}", homeUrl: "https://stackoverflow.com" },
    { trigger: "mdn", name: "MDN Web Docs", domain: "developer.mozilla.org", searchUrl: "https://developer.mozilla.org/en-US/search?q={query}", homeUrl: "https://developer.mozilla.org" },
    { trigger: "npm", name: "npm", domain: "npmjs.com", searchUrl: "https://www.npmjs.com/search?q={query}", homeUrl: "https://www.npmjs.com" },
    { trigger: "pypi", name: "PyPI", domain: "pypi.org", searchUrl: "https://pypi.org/search/?q={query}", homeUrl: "https://pypi.org" },
    { trigger: "maps", name: "Google Maps", domain: "google.com/maps", searchUrl: "https://www.google.com/maps?q={query}", homeUrl: "https://www.google.com/maps" },
    { trigger: "imdb", name: "IMDb", domain: "imdb.com", searchUrl: "https://www.imdb.com/find?q={query}", homeUrl: "https://www.imdb.com" },
    { trigger: "duck", name: "DuckDuckGo", domain: "duckduckgo.com", searchUrl: "https://duckduckgo.com/?q={query}", homeUrl: "https://duckduckgo.com" },
    { trigger: "b", name: "Bing", domain: "bing.com", searchUrl: "https://www.bing.com/search?q={query}", homeUrl: "https://www.bing.com" },
  ];

  const DEFAULT_SEARCH_ENGINES = {
    google: { name: "Google", searchUrl: "https://www.google.com/search?q={query}" },
    duckduckgo: { name: "DuckDuckGo", searchUrl: "https://duckduckgo.com/?q={query}" },
    bing: { name: "Bing", searchUrl: "https://www.bing.com/search?q={query}" },
    brave: { name: "Brave Search", searchUrl: "https://search.brave.com/search?q={query}" },
    startpage: { name: "Startpage", searchUrl: "https://www.startpage.com/do/dsearch?query={query}" },
  };

  (function initModifierKey() {
    if (typeof chrome !== 'undefined' && chrome.commands && chrome.commands.getAll) {
      chrome.commands.getAll((commands) => {
        const cmd = commands.find(c => c.name === "toggle-overlay");
        if (cmd && cmd.shortcut) {
          if (cmd.shortcut.includes("Alt") || cmd.shortcut.includes("⌥")) {
            modifierKey = "Alt";
          } else if (cmd.shortcut.includes("Ctrl") || cmd.shortcut.includes("⌃")) {
            modifierKey = "Control";
          } else if (cmd.shortcut.includes("Meta") || cmd.shortcut.includes("⌘") || cmd.shortcut.includes("Command")) {
            modifierKey = "Meta";
          }
        }
        if (!modifierKey) modifierKey = "Alt";
      });
    } else {
      modifierKey = "Alt";
    }
  })();

  function fuzzyMatch(text, query) {
    text = text.toLowerCase();
    query = query.toLowerCase();

    if (query === "") return true;

    let queryIndex = 0;
    for (let i = 0; i < text.length && queryIndex < query.length; i++) {
      if (text[i] === query[queryIndex]) {
        queryIndex++;
      }
    }
    return queryIndex === query.length;
  }

  function parseBangInput(value) {
    if (!value.startsWith("!")) return null;

    const spaceIndex = value.indexOf(" ");
    let trigger, query, hasSpace, bang;

    if (spaceIndex === -1) {
      trigger = value.slice(1);
      query = "";
      hasSpace = false;
    } else {
      trigger = value.slice(1, spaceIndex);
      query = value.slice(spaceIndex + 1);
      hasSpace = true;
    }

    if (trigger) {
      bang = BANGS.find((b) => b.trigger === trigger) || null;
    } else {
      bang = null;
    }

    return { bang, trigger, query: query.trim(), hasSpace };
  }

  function executeBangSearch(bang, query) {
    if (!bang) return;
    const url = query
      ? bang.searchUrl.replace("{query}", encodeURIComponent(query))
      : bang.homeUrl;
    openLink(url);
  }

  function getDefaultSearchUrl(query) {
    if (!query) return null;
    const settings = JSON.parse(localStorage.getItem("settings") || "{}");
    const engineId = settings.defaultSearchEngine || "google";
    const engine = DEFAULT_SEARCH_ENGINES[engineId] || DEFAULT_SEARCH_ENGINES.google;
    return engine.searchUrl.replace("{query}", encodeURIComponent(query));
  }

  function executeDefaultSearch(query) {
    const url = getDefaultSearchUrl(query);
    if (url) openLink(url);
  }

  function insertBangAndFocus(trigger) {
    if (!inputElement || !trigger) return;
    inputElement.value = "!" + trigger + " ";
    inputElement.selectionStart = inputElement.selectionEnd = inputElement.value.length;
    inputElement.dispatchEvent(new Event("input"));
    requestAnimationFrame(() => focusInput());
  }

  function flattenBookmarks(nodes, path = []) {
    const results = [];

    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        const newPath = [...path, node.title || "Untitled"];
        results.push(...flattenBookmarks(node.children, newPath));
      } else if (node.url) {
        const fullPath = path.length > 0 ? path.join(" > ") : null;
        results.push({
          title: node.title || node.url,
          url: node.url,
          path: fullPath,
        });
      }
    });

    return results;
  }

  function getAllItems() {
    const shortcuts = document.getElementById("shortcuts");
    if (!shortcuts) return [];
    return Array.from(shortcuts.querySelectorAll("a.shortcut")).filter(
      (item) => {
        let parent = item.parentElement;
        while (parent && parent !== shortcuts) {
          if (parent.classList.contains("collapsed")) {
            return false;
          }
          parent = parent.parentElement;
        }
        return true;
      },
    );
  }

  function getNavigationItems() {
    const shortcuts = document.getElementById("shortcuts");
    if (!shortcuts) return [];

    if (isSearchMode && isBangMode && currentBangSuggestions.length > 0) {
      return currentBangSuggestions;
    }

    if (isSearchMode) {
      return Array.from(shortcuts.querySelectorAll(`.${SEARCH_RESULT_CLASS}`));
    }

    const items = [];
    const seen = new Set();

    function walk(node) {
      if (!node) return;
      if (node.classList?.contains("collapsed")) return;

      if (
        node.tagName === "BUTTON" &&
        node.classList.contains("bookmark-folder")
      ) {
        if (!seen.has(node)) {
          items.push(node);
          seen.add(node);
        }
      } else if (node.tagName === "A" && node.classList.contains("shortcut")) {
        if (!seen.has(node)) {
          items.push(node);
          seen.add(node);
        }
      }

      const children = node.children || [];
      for (let i = 0; i < children.length; i++) {
        walk(children[i]);
      }
    }

    walk(shortcuts);
    return items;
  }

  function updateSelection() {
    const navItems = getNavigationItems();
    navItems.forEach((item, index) => {
      if (index === currentIndex) {
        if (isBangMode) {
          item.classList.add(SELECTED_CLASS);
        } else {
          const shortcut = item.classList.contains(SEARCH_RESULT_CLASS)
            ? item.querySelector(".shortcut")
            : item;
          if (shortcut) shortcut.classList.add(SELECTED_CLASS);
        }
        item.scrollIntoView({ block: "nearest", behavior: "smooth" });
        currentItem = navItems[currentIndex];
      } else {
        if (isBangMode) {
          item.classList.remove(SELECTED_CLASS);
        } else {
          const shortcut = item.classList.contains(SEARCH_RESULT_CLASS)
            ? item.querySelector(".shortcut")
            : item;
          if (shortcut) shortcut.classList.remove(SELECTED_CLASS);
        }
      }
    });
  }

  function clearSelection() {
    currentIndex = -1;
    currentItem = null;
    document
      .querySelectorAll("." + SELECTED_CLASS)
      .forEach((el) => el.classList.remove(SELECTED_CLASS));
  }

  function renderNumberHints() {
    clearNumberHints();
    allItems = getAllItems();
    allItems.slice(0, 10).forEach((item, index) => {
      const hint = document.createElement("span");
      hint.className = NUMBER_HINT_CLASS;
      hint.textContent = index === 9 ? "0" : (index + 1).toString();
      item.appendChild(hint);
    });
  }

  function clearNumberHints() {
    document
      .querySelectorAll(`.${NUMBER_HINT_CLASS}`)
      .forEach((el) => el.remove());
  }

  function renderSearchResults(query, bangInfo) {
    if (!query || query.length === 0) return;

    const shortcuts = document.getElementById("shortcuts");
    if (!shortcuts) return;

    const resultsContainer = document.getElementById(
      "search-results-container",
    );
    if (!resultsContainer) return;

    const settings = JSON.parse(localStorage.getItem("settings") || "{}");
    const bookmarkFolder = settings.bookmarkFolder?.trim();

    const hasBang = bangInfo && bangInfo.bang && bangInfo.hasSpace;

    if (hasBang) {
      resultsContainer.innerHTML = "";

      const bangEl = document.createElement("li");
      bangEl.className = `bookmark-link-item ${SEARCH_RESULT_CLASS} bang-search-result`;

      const a = document.createElement("a");
      a.className = "shortcut";
      a.href = bangInfo.bang.searchUrl.replace(
        "{query}",
        encodeURIComponent(bangInfo.query),
      );

      const contentSpan = document.createElement("span");
      contentSpan.className = "content";
      const titleSpan = document.createElement("span");
      titleSpan.className = "title";
      titleSpan.textContent = bangInfo.query
        ? `Search ${bangInfo.bang.name} for "${bangInfo.query}"`
        : `Go to ${bangInfo.bang.domain}`;
      contentSpan.appendChild(titleSpan);
      a.appendChild(contentSpan);
      bangEl.appendChild(a);
      resultsContainer.appendChild(bangEl);

      requestAnimationFrame(() => focusInput());
      return;
    }

    searchPending = true;

    chrome.bookmarks.getTree((tree) => {
      if (!searchPending) return;

      let bookmarkNodes = tree[0].children;

      if (bookmarkFolder) {
        const folder = tree[0].children.find(
          (f) => f.title.toLowerCase() === bookmarkFolder.toLowerCase(),
        );
        if (folder) {
          bookmarkNodes = folder.children;
        }
      }

      const flattened = flattenBookmarks(bookmarkNodes);

      searchResults = flattened.filter(
        (item) =>
          fuzzyMatch(item.title, query) || fuzzyMatch(item.path || "", query),
      );

      resultsContainer.innerHTML = "";

      if (searchResults.length === 0) {
        const defaultUrl = getDefaultSearchUrl(query);
        if (defaultUrl) {
          const settings = JSON.parse(localStorage.getItem("settings") || "{}");
          const engineId = settings.defaultSearchEngine || "google";
          const engine = DEFAULT_SEARCH_ENGINES[engineId] || DEFAULT_SEARCH_ENGINES.google;

          const el = document.createElement("li");
          el.className = `bookmark-link-item ${SEARCH_RESULT_CLASS} default-search-result`;

          const a = document.createElement("a");
          a.className = "shortcut";
          a.href = defaultUrl;

          const contentSpan = document.createElement("span");
          contentSpan.className = "content";
          const titleSpan = document.createElement("span");
          titleSpan.className = "title";
          titleSpan.textContent = `Search ${engine.name} for "${query}"`;
          contentSpan.appendChild(titleSpan);
          a.appendChild(contentSpan);
          el.appendChild(a);
          resultsContainer.appendChild(el);
        } else {
          const noResults = document.createElement("div");
          noResults.className = "no-results";
          noResults.textContent = "No results found";
          resultsContainer.appendChild(noResults);
        }
        requestAnimationFrame(() => focusInput());
        return;
      }

      const list = document.createElement("ul");
      list.className = "bookmark-list search-results-list";

      searchResults.slice(0, 10).forEach((result, index) => {
        const li = document.createElement("li");
        li.className = `bookmark-link-item ${SEARCH_RESULT_CLASS}`;

        const a = document.createElement("a");
        a.href = result.url;
        a.className = "shortcut";

        const contentSpan = document.createElement("span");
        contentSpan.className = "content";

        if (result.path) {
          const pathSpan = document.createElement("span");
          pathSpan.className = "path";
          pathSpan.textContent = result.path + " ";
          contentSpan.appendChild(pathSpan);

          const arrowSpan = document.createElement("span");
          arrowSpan.className = "arrow";
          arrowSpan.textContent = " > ";
          contentSpan.appendChild(arrowSpan);
        }

        const titleSpan = document.createElement("span");
        titleSpan.className = "title";
        titleSpan.textContent = result.title;
        contentSpan.appendChild(titleSpan);
        a.appendChild(contentSpan);

        const hint = document.createElement("span");
        hint.className = NUMBER_HINT_CLASS;
        hint.textContent = index === 9 ? "0" : (index + 1).toString();
        a.appendChild(hint);

        li.appendChild(a);
        list.appendChild(li);
      });

      resultsContainer.appendChild(list);
      requestAnimationFrame(() => focusInput());
    });
  }

  function renderBangSuggestions(trigger) {
    const resultsContainer = document.getElementById("search-results-container");
    if (!resultsContainer) return;

    resultsContainer.innerHTML = "";

    const matchingBangs = trigger
      ? BANGS.filter(
          (b) =>
            b.trigger.includes(trigger) ||
            b.name.toLowerCase().includes(trigger),
        )
      : BANGS;

    if (matchingBangs.length === 0) {
      const noResults = document.createElement("div");
      noResults.className = "no-results";
      noResults.textContent = `No bang matches "!${trigger}"`;
      resultsContainer.appendChild(noResults);
      currentBangSuggestions = [];
      requestAnimationFrame(() => focusInput());
      return;
    }

    currentBangSuggestions = matchingBangs.map((bang) => {
      const el = document.createElement("div");
      el.className = "bang-suggestion";
      el.dataset.bangTrigger = bang.trigger;

      const triggerSpan = document.createElement("span");
      triggerSpan.className = "bang-trigger";
      triggerSpan.textContent = `!${bang.trigger}`;

      const nameSpan = document.createElement("span");
      nameSpan.className = "bang-name";
      nameSpan.textContent = bang.name;

      const domainSpan = document.createElement("span");
      domainSpan.className = "bang-domain";
      domainSpan.textContent = bang.domain;

      el.appendChild(triggerSpan);
      el.appendChild(nameSpan);
      el.appendChild(domainSpan);
      resultsContainer.appendChild(el);
      return el;
    });

    requestAnimationFrame(() => focusInput());
  }

  function enterSearchMode() {
    if (isSearchMode) return;
    isSearchMode = true;

    const shortcuts = document.getElementById("shortcuts");
    if (shortcuts && !originalShortcutsContent) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = shortcuts.innerHTML;
      const inputInDom = tempDiv.querySelector("#" + INPUT_ID);
      if (inputInDom) {
        inputInDom.remove();
      }
      originalShortcutsContent = tempDiv.innerHTML;
      shortcuts.classList.add(SEARCH_MODE_CLASS);
      shortcuts.innerHTML = "";

      if (inputElement) {
        shortcuts.appendChild(inputElement);
      }

      const resultsContainer = document.createElement("div");
      resultsContainer.className = "search-results-container";
      resultsContainer.id = "search-results-container";
      shortcuts.appendChild(resultsContainer);
    }
  }

  function exitSearchMode() {
    if (!isSearchMode) return;
    isSearchMode = false;
    isBangMode = false;
    currentBangSuggestions = [];
    searchResults = [];
    clearTimeout(debounceTimer);

    const shortcuts = document.getElementById("shortcuts");
    if (!shortcuts) {
      originalShortcutsContent = null;
      return;
    }

    shortcuts.classList.remove(SEARCH_MODE_CLASS);

    if (window.renderBookmarks) {
      window.renderBookmarks();
    }

    // renderBookmarks is async — wait for it to finish
    setTimeout(() => {
      const bookmarkList = shortcuts.querySelector(".bookmark-list");
      if (bookmarkList) {
        bookmarkList.style.opacity = "0";
        requestAnimationFrame(() => {
          bookmarkList.style.transition = "opacity 0.15s ease";
          bookmarkList.style.opacity = "1";
          bookmarkList.addEventListener(
            "transitionend",
            () => {
              bookmarkList.style.transition = "";
              bookmarkList.style.opacity = "";
            },
            { once: true },
          );
        });
      }

      setupFolderListeners();
      allItems = getAllItems();
      renderNumberHints();
      focusInput();
    }, 50);

    originalShortcutsContent = null;
  }

  function renderBookmarks() {
    const shortcuts = document.getElementById("shortcuts");
    if (!shortcuts) return;

    shortcuts.innerHTML = "";

    const settings = JSON.parse(localStorage.getItem("settings") || "{}");
    const bookmarkFolder = settings.bookmarkFolder?.trim();

    chrome.bookmarks.getTree((tree) => {
      let bookmarkNodes = tree[0].children;

      if (bookmarkFolder) {
        const folder = tree[0].children.find(
          (f) => f.title.toLowerCase() === bookmarkFolder.toLowerCase(),
        );
        if (folder) {
          bookmarkNodes = folder.children;
        }
      }

      const listRoot = document.createElement("ul");
      listRoot.className = "bookmark-list";

      function processBookmarks(nodes, container, path = []) {
        nodes.forEach((node) => {
          if (node.children && node.children.length > 0) {
            const listItem = document.createElement("li");
            listItem.className = "bookmark-folder-item";

            const folderButton = document.createElement("button");
            folderButton.type = "button";
            folderButton.className = "bookmark-folder";
            const chevron = document.createElement("span");
            chevron.className = "chevron";
            chevron.textContent = "▶";

            const title = document.createElement("span");
            title.textContent = ` ${node.title || "Untitled folder"}`;

            folderButton.appendChild(chevron);
            folderButton.appendChild(title);

            const childrenList = document.createElement("ul");
            childrenList.className = "bookmark-children";

            const newPath = [...path, node.title || "Untitled"];
            const isOpen = localStorage.getItem(newPath.join("/")) === "true";

            if (isOpen) {
              chevron.textContent = "▼";
            } else {
              childrenList.classList.add("collapsed");
            }

            folderButton.addEventListener("click", () => {
              const isCollapsed = childrenList.classList.contains("collapsed");
              if (isCollapsed) {
                childrenList.classList.remove("collapsed");
                chevron.textContent = "▼";
                localStorage.setItem(newPath.join("/"), "true");
              } else {
                childrenList.classList.add("collapsed");
                chevron.textContent = "▶";
                localStorage.setItem(newPath.join("/"), "false");
              }
              if (isActive) {
                allItems = getAllItems();
                renderNumberHints();
              }
            });

            listItem.appendChild(folderButton);
            listItem.appendChild(childrenList);
            container.appendChild(listItem);

            processBookmarks(node.children, childrenList, newPath);
          } else if (node.url) {
            const listItem = document.createElement("li");
            listItem.className = "bookmark-link-item";

            const a = document.createElement("a");
            a.href = node.url;
            a.className = "shortcut";
            const text = document.createElement("span");
            text.textContent = node.title || node.url;
            a.appendChild(text);

            listItem.appendChild(a);
            container.appendChild(listItem);
          }
        });
      }

      processBookmarks(bookmarkNodes, listRoot);
      shortcuts.appendChild(listRoot);

      if (inputElement && !shortcuts.contains(inputElement)) {
        shortcuts.insertBefore(inputElement, shortcuts.firstChild);
      }

      if (isActive) {
        setupFolderListeners();
        allItems = getAllItems();
        renderNumberHints();
        requestAnimationFrame(() => focusInput());
      }
    });
  }

  function setupFolderListeners() {
    const shortcuts = document.getElementById("shortcuts");
    if (!shortcuts) return;

    shortcuts.querySelectorAll("button.bookmark-folder").forEach((folder) => {
      folder.addEventListener("click", () => {
        setTimeout(() => {
          if (isActive && !isSearchMode) {
            renderNumberHints();
          }
          if (currentItem) {
            currentItem.classList.add(SELECTED_CLASS);
            currentItem.scrollIntoView({
              block: "nearest",
              behavior: "smooth",
            });
          }
        }, 10);
      });
    });
  }

  function openLink(url) {
    const settings = JSON.parse(localStorage.getItem("settings") || "{}");
    debugger;
    if (settings.openInNewTab) {
      chrome.tabs.create({ url: url });
    } else {
      window.location.href = url;
    }
  }

  function navigateByNumber(num) {
    const index = num === "0" ? 9 : parseInt(num, 10) - 1;

    if (isSearchMode && isBangMode && currentBangSuggestions.length > 0) {
      if (index >= 0 && index < currentBangSuggestions.length) {
        const trigger = currentBangSuggestions[index].dataset.bangTrigger;
        if (trigger) insertBangAndFocus(trigger);
      }
      return;
    }

    if (isSearchMode) {
      const navItems = getNavigationItems();
      if (index >= 0 && index < navItems.length) {
        const link = navItems[index].querySelector("a.shortcut");
        if (link) openLink(link.href);
      }
      return;
    }

    if (index >= 0 && index < allItems.length && allItems[index]) {
      const link = allItems[index].querySelector("a") || allItems[index];
      if (link.href) {
        openLink(link.href);
      } else {
        allItems[index].click();
      }
    }
  }

  function focusInput() {
    if (inputElement) {
      inputElement.focus();
    }
  }

  function ensureFocus() {
    if (document.activeElement !== inputElement) {
      setTimeout(() => focusInput(), 10);
    }
  }

  function createInput() {
    if (inputElement) return;

    inputElement = document.createElement("input");
    inputElement.type = "text";
    inputElement.id = INPUT_ID;
    inputElement.placeholder = "Search your bookmarks...";
    inputElement.autofocus = true;

    const shortcuts = document.getElementById("shortcuts");
    if (shortcuts) {
      shortcuts.insertBefore(inputElement, shortcuts.firstChild);
    }

    inputElement.addEventListener("input", (e) => {
      const value = e.target.value;
      const bangInfo = parseBangInput(value);

      if (bangInfo && bangInfo.bang && bangInfo.hasSpace) {
        inputElement.placeholder = `Search ${bangInfo.bang.name}...`;
      } else if (value.startsWith("!")) {
        inputElement.placeholder = "Type a search query or select a bang below";
      } else {
        inputElement.placeholder = "Search your bookmarks...";
      }

      if (value.length > 0) {
        enterSearchMode();
        clearTimeout(debounceTimer);
        currentIndex = -1;
        currentItem = null;

        if (bangInfo && !bangInfo.hasSpace) {
          isBangMode = true;
          renderBangSuggestions(bangInfo.trigger);
        } else {
          isBangMode = false;
          debounceTimer = setTimeout(() => {
            renderSearchResults(value, bangInfo);
          }, 100);
        }
      } else {
        clearTimeout(debounceTimer);
        isBangMode = false;
        currentBangSuggestions = [];
        exitSearchMode();
        currentIndex = -1;
        currentItem = null;
      }
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => ensureFocus());
    });
  }

  function handleKeydown(e) {
    if (modifierKey && e.code.startsWith("Digit")) {
      const modPressed =
        (modifierKey === "Alt" && e.altKey) ||
        (modifierKey === "Control" && e.ctrlKey) ||
        (modifierKey === "Meta" && e.metaKey);
      if (modPressed) {
        e.preventDefault();
        navigateByNumber(e.code.replace("Digit", ""));
        return;
      }
    }

    if (e.key === "Escape") {
      hideOverlay();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const inputValue = inputElement ? inputElement.value : "";
      const bangInfo = parseBangInput(inputValue);

      if (currentIndex >= 0) {
        const navItems = getNavigationItems();
        const item = navItems[currentIndex];
        if (item) {
          if (isBangMode) {
            const trigger = item.dataset.bangTrigger;
            if (trigger) {
              insertBangAndFocus(trigger);
            }
            return;
          }
          if (isSearchMode) {
            const link = item.querySelector("a");
            if (link) {
              openLink(link.href);
            }
          } else {
            const link =
              item.querySelector("a") || (item.tagName === "A" ? item : null);
            if (link && link.href) {
              openLink(link.href);
            } else {
              item.click();
            }
          }
          return;
        }
      }

      if (bangInfo && bangInfo.bang && bangInfo.hasSpace) {
        executeBangSearch(bangInfo.bang, bangInfo.query);
        return;
      }

      if (bangInfo && bangInfo.bang && !bangInfo.hasSpace) {
        openLink(bangInfo.bang.homeUrl);
        return;
      }

      if (
        isSearchMode &&
        inputValue.length > 0 &&
        searchResults.length > 0
      ) {
        const firstResult = searchResults[0];
        if (firstResult && firstResult.url) {
          openLink(firstResult.url);
        }
        return;
      }

      if (isSearchMode && inputValue.length > 0) {
        executeDefaultSearch(inputValue);
      }
    }
  }

  function moveSelection(direction) {
    const navItems = getNavigationItems();

    if (navItems.length === 0) return;

    if (isSearchMode && currentItem) {
      const currentLi =
        currentItem.closest(`.${SEARCH_RESULT_CLASS}`) || currentItem;
      if (navItems.includes(currentLi)) {
        currentIndex = navItems.indexOf(currentLi);
      }
    } else if (!isSearchMode && currentItem) {
      if (navItems.includes(currentItem)) {
        currentIndex = navItems.indexOf(currentItem);
      }
    }

    if (currentIndex === -1) {
      currentIndex = direction === 1 ? 0 : navItems.length - 1;
    } else {
      currentIndex = currentIndex + direction;
      if (currentIndex < 0) {
        currentIndex = navItems.length - 1;
      } else if (currentIndex >= navItems.length) {
        currentIndex = 0;
      }
    }
    currentItem = navItems[currentIndex];
    updateSelection();
  }

  function showOverlay() {
    const settings = JSON.parse(localStorage.getItem("settings") || "{}");
    if (!settings.enableKeyboardNav) {
      return;
    }
    isActive = true;
    createInput();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => ensureFocus());
    });
    document.addEventListener("keydown", handleKeydown);

    const shortcuts = document.getElementById("shortcuts");
    if (shortcuts) {
      shortcuts.classList.add("command-mode");
    }

    allItems = getAllItems();
    if (!isSearchMode) {
      renderNumberHints();
      setupFolderListeners();
    }
  }

  function hideOverlay() {
    isActive = false;
    isSearchMode = false;
    isBangMode = false;
    currentBangSuggestions = [];
    clearSelection();
    clearNumberHints();
    searchPending = false;
    originalShortcutsContent = null;
    searchResults = [];
    clearTimeout(debounceTimer);
    debounceTimer = null;

    const shortcuts = document.getElementById("shortcuts");
    if (shortcuts) {
      shortcuts.classList.remove("command-mode");
      shortcuts.classList.remove(SEARCH_MODE_CLASS);
      shortcuts.querySelectorAll("." + SELECTED_CLASS).forEach((el) => {
        el.classList.remove(SELECTED_CLASS);
      });

      if (window.renderBookmarks) {
        shortcuts.innerHTML = "";
        window.renderBookmarks();
      }
    }

    if (inputElement) {
      inputElement.remove();
      inputElement = null;
    }
    document.removeEventListener("keydown", handleKeydown);

    chrome.runtime.sendMessage({ action: "overlayHidden" });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "showOverlay") {
      showOverlay();
    } else if (message.action === "hideOverlay") {
      hideOverlay();
    }
  });
})();
