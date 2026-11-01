const FEED_URL = "https://raw.githubusercontent.com/XiaomiFirmwareUpdater/miui-updates-tracker/master/rss/{CODE}.xml";
const INDEX_URL = "https://api.github.com/repos/XiaomiFirmwareUpdater/miui-updates-tracker/contents/rss?per_page=1000";
const SESSION_KEY = "av_roms_v1";

const state = {
  devices: [],
  roms: [],
  pick: {
    code: null,
    branch: null,
    method: null,
    region: null,
    version: null,
  },
  listCursor: -1,
  feedRequestId: 0,
};

const ui = {
  input: document.getElementById("deviceInput"),
  clearBtn: document.getElementById("clearBtn"),
  drop: document.getElementById("drop"),
  status: document.getElementById("status"),
  wizard: document.getElementById("wizard"),
  chipTemplate: document.getElementById("chipTemplate"),
};

const REGION_SUFFIXES = [
  ["China Telecom", "China"],
  ["China Unicom", "China"],
  ["China Mobile", "China"],
  ["China", "China"],
  ["Global", "Global"],
  ["EEA", "Europe"],
  ["Russia", "Russia"],
  ["Turkey", "Turkey"],
  ["India", "India"],
  ["Indonesia", "Indonesia"],
  ["Taiwan", "Taiwan"],
  ["Japan", "Japan"],
  ["Thailand", "Thailand"],
  ["Vietnam", "Vietnam"],
  ["Brazil", "Brazil"],
  ["Mexico", "Mexico"],
];

init();

function init() {
  bindEvents();
  restoreSession();
  loadDeviceIndex();
}

function bindEvents() {
  ui.input.addEventListener("input", onSearchInput);
  ui.input.addEventListener("focus", onSearchInput);
  ui.input.addEventListener("keydown", onDropKeyDown);
  ui.clearBtn.addEventListener("click", resetAll);

  document.addEventListener("click", (event) => {
    if (!ui.drop.contains(event.target) && event.target !== ui.input) {
      closeDropdown();
    }
  });
}

async function loadDeviceIndex() {
  try {
    const res = await fetch(INDEX_URL);
    if (!res.ok) {
      throw new Error("Could not load index.");
    }

    const files = await res.json();
    state.devices = files
      .map((f) => f.name)
      .filter((name) => name.endsWith(".xml"))
      .map((name) => name.replace(/\.xml$/i, ""))
      .sort((a, b) => a.localeCompare(b));

    setStatus(`Loaded ${state.devices.length} codenames from upstream source index.`);

    if (state.pick.code) {
      fetchDeviceFeed(state.pick.code);
    }
  } catch (error) {
    setStatus(`Index error: ${error.message}`, true);
  }
}

function onSearchInput() {
  const q = ui.input.value.trim().toLowerCase();
  const list = q
    ? state.devices.filter((d) => d.toLowerCase().includes(q))
    : state.devices.slice(0, 120);

  renderDropdown(list.slice(0, 120));
}

function renderDropdown(items) {
  state.listCursor = -1;
  ui.drop.innerHTML = "";

  if (!items.length) {
    closeDropdown();
    return;
  }

  for (const code of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "drop-item";
    btn.textContent = code;
    btn.addEventListener("click", () => chooseDevice(code));
    ui.drop.appendChild(btn);
  }

  ui.drop.classList.add("open");
}

function onDropKeyDown(event) {
  const items = [...ui.drop.querySelectorAll(".drop-item")];
  if (!items.length) {
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.listCursor = Math.min(items.length - 1, state.listCursor + 1);
    updateDropdownCursor(items);
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    state.listCursor = Math.max(0, state.listCursor - 1);
    updateDropdownCursor(items);
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const target = items[state.listCursor] || items[0];
    if (target) {
      target.click();
    }
  }

  if (event.key === "Escape") {
    closeDropdown();
  }
}

function updateDropdownCursor(items) {
  items.forEach((node) => node.classList.remove("active"));
  if (state.listCursor >= 0) {
    items[state.listCursor].classList.add("active");
    items[state.listCursor].scrollIntoView({ block: "nearest" });
  }
}

function closeDropdown() {
  ui.drop.classList.remove("open");
}

function chooseDevice(code) {
  state.pick.code = code;
  ui.input.value = code;
  closeDropdown();
  fetchDeviceFeed(code);
}

async function fetchDeviceFeed(code) {
  resetFlow();
  const requestId = state.feedRequestId;
  setStatus(`Loading feed for ${code}...`);

  try {
    const url = FEED_URL.replace("{CODE}", encodeURIComponent(code));
    const res = await fetch(url);

    // Ignore responses from an older selection or a request cancelled by Reset.
    if (requestId !== state.feedRequestId) return;

    if (res.status === 404) {
      throw new Error("Codename not found in source feed.");
    }

    if (!res.ok) {
      throw new Error(`Feed request failed (${res.status}).`);
    }

    const xml = await res.text();
    if (requestId !== state.feedRequestId) return;

    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const items = [...doc.querySelectorAll("item")];
    if (!items.length) {
      throw new Error("This codename has no ROM records.");
    }

    state.roms = items.map(parseRomItem).sort((a, b) => {
      const tA = new Date(a.dateRaw || 0).getTime();
      const tB = new Date(b.dateRaw || 0).getTime();
      return tB - tA;
    });

    setStatus(`Loaded ${state.roms.length} ROM entries for ${code}.`);
    renderFlow();
    persistSession();
  } catch (error) {
    if (requestId === state.feedRequestId) {
      setStatus(`Feed error: ${error.message}`, true);
    }
  }
}

function parseRomItem(item) {
  const title = item.querySelector("title")?.textContent?.trim() || "Unknown";
  const descriptionRaw = item.querySelector("description")?.textContent || "";
  const pubDate = item.querySelector("pubDate")?.textContent?.trim() || null;
  const mainLink = toHttps(item.querySelector("link")?.textContent?.trim() || null);

  const holder = document.createElement("div");
  holder.innerHTML = descriptionRaw;

  const versionField = readLabelText(holder, "Version");
  const [versionPart, androidPart] = (versionField || "").split("|").map((v) => v?.trim() || null);

  const incremental = readLabelLink(holder, "Incremental Update");
  const md5 = readLabelText(holder, "MD5");
  const size = readLabelText(holder, "Size");
  const { region, deviceName } = parseRegionFromTitle(title);

  return {
    title,
    version: versionPart,
    android: androidPart ? `Android ${androidPart}` : null,
    dateRaw: pubDate,
    datePretty: formatDate(pubDate),
    branch: detectBranch(descriptionRaw, versionPart),
    method: title.toLowerCase().includes("fastboot") ? "fastboot" : "recovery",
    osType: detectOsType(versionPart),
    region,
    deviceName,
    mainLink,
    incremental,
    md5,
    size,
  };
}

function readLabelText(root, label) {
  const boldNodes = [...root.querySelectorAll("b")];
  for (const node of boldNodes) {
    const head = node.textContent.replace(":", "").trim().toLowerCase();
    if (head !== label.toLowerCase()) {
      continue;
    }

    let txt = "";
    let next = node.nextSibling;
    while (next) {
      if (next.nodeName === "B") {
        break;
      }
      if (next.nodeType === Node.TEXT_NODE) {
        txt += next.textContent;
      }
      next = next.nextSibling;
    }
    return txt.replace(/^[\s:]+/, "").trim() || null;
  }
  return null;
}

function readLabelLink(root, label) {
  const boldNodes = [...root.querySelectorAll("b")];
  for (const node of boldNodes) {
    const head = node.textContent.replace(":", "").trim().toLowerCase();
    if (head !== label.toLowerCase()) {
      continue;
    }

    let next = node.nextSibling;
    while (next) {
      if (next.nodeName === "A") {
        return toHttps(next.getAttribute("href"));
      }
      if (next.nodeName === "B") {
        break;
      }
      next = next.nextSibling;
    }
  }
  return null;
}

function parseRegionFromTitle(title) {
  const match = title.match(/update for (.+)$/i);
  if (!match) {
    return { region: "Global", deviceName: "Unknown" };
  }

  const full = match[1].trim();
  for (const [suffix, region] of REGION_SUFFIXES) {
    if (full.endsWith(suffix)) {
      return {
        region,
        deviceName: full.slice(0, -suffix.length).trim(),
      };
    }
  }

  return { region: "Global", deviceName: full };
}

function detectOsType(version) {
  if (!version) {
    return "MIUI";
  }
  if (version.startsWith("OS")) {
    return "HyperOS";
  }
  if (version.includes(".DEV")) {
    return "MIUI Beta";
  }
  if (/^\d/.test(version)) {
    return "MIUI Weekly";
  }
  return "MIUI";
}

function detectBranch(description, version) {
  const text = description.toLowerCase();
  if (text.includes("public beta")) {
    return "beta";
  }
  if (text.includes("new weekly")) {
    return "weekly";
  }
  if (text.includes("new stable")) {
    return "stable";
  }

  const os = detectOsType(version);
  if (os === "MIUI Weekly") {
    return "weekly";
  }
  if (os === "MIUI Beta") {
    return "beta";
  }
  return "stable";
}

function toHttps(url) {
  if (!url) {
    return null;
  }
  return url.replace(/^http:\/\//i, "https://");
}

function formatDate(raw) {
  if (!raw) {
    return null;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return null;
  }

  return d.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function renderFlow() {
  ui.wizard.innerHTML = "";

  renderStep({
    title: "1. Build Type",
    picked: state.pick.branch,
    options: collectOptions("branch"),
    onClick: (value) => {
      state.pick.branch = value;
      state.pick.method = null;
      state.pick.region = null;
      state.pick.version = null;
      renderFlow();
      persistSession();
    },
    formatMeta: (value) => `${countMatching({ branch: value })} ROMs`,
  });

  if (!state.pick.branch) {
    return;
  }

  renderStep({
    title: "2. Flash Method",
    picked: state.pick.method,
    options: collectOptions("method", { branch: state.pick.branch }),
    onClick: (value) => {
      state.pick.method = value;
      state.pick.region = null;
      state.pick.version = null;
      renderFlow();
      persistSession();
    },
    formatMeta: (value) => `${countMatching({ branch: state.pick.branch, method: value })} ROMs`,
  });

  if (!state.pick.method) {
    return;
  }

  renderStep({
    title: "3. Region",
    picked: state.pick.region,
    options: collectOptions("region", {
      branch: state.pick.branch,
      method: state.pick.method,
    }),
    onClick: (value) => {
      state.pick.region = value;
      state.pick.version = null;
      renderFlow();
      persistSession();
    },
    formatMeta: (value) => `${countMatching({ branch: state.pick.branch, method: state.pick.method, region: value })} ROMs`,
  });

  if (!state.pick.region) {
    return;
  }

  const versions = filterRoms({
    branch: state.pick.branch,
    method: state.pick.method,
    region: state.pick.region,
  });

  renderStep({
    title: "4. Version",
    picked: state.pick.version,
    options: versions.map((r) => r.version || "Unknown"),
    onClick: (value) => {
      state.pick.version = value;
      renderFlow();
      persistSession();
    },
    formatMeta: (value) => {
      const rom = versions.find((v) => (v.version || "Unknown") === value);
      return [rom?.osType, rom?.datePretty].filter(Boolean).join(" | ") || "";
    },
  });

  if (!state.pick.version) {
    return;
  }

  const activeRom = versions.find((v) => (v.version || "Unknown") === state.pick.version);
  if (activeRom) {
    renderResult(activeRom);
  }
}

function renderStep({ title, picked, options, onClick, formatMeta }) {
  const step = document.createElement("article");
  step.className = "step";

  const head = document.createElement("div");
  head.className = "step-head";
  head.innerHTML = `<span class="step-title">${escapeHtml(title)}</span><span class="step-picked">${escapeHtml(picked || "")}</span>`;

  const chips = document.createElement("div");
  chips.className = "chips";

  for (const option of options) {
    const chip = ui.chipTemplate.content.firstElementChild.cloneNode(true);
    chip.querySelector(".chip-title").textContent = option;
    chip.querySelector(".chip-meta").textContent = formatMeta(option);
    chip.addEventListener("click", () => onClick(option));
    chips.appendChild(chip);
  }

  step.appendChild(head);
  step.appendChild(chips);
  ui.wizard.appendChild(step);
}

function renderResult(rom) {
  const step = document.createElement("article");
  step.className = "step";

  const head = document.createElement("div");
  head.className = "step-head";
  head.innerHTML = `<span class="step-title">5. Result</span><span class="step-picked">${escapeHtml(rom.osType)}</span>`;

  const grid = document.createElement("div");
  grid.className = "result-grid";

  const cells = [
    ["Device", rom.deviceName],
    ["Region", rom.region],
    ["Branch", rom.branch],
    ["Method", rom.method],
    ["Version", rom.version || "Unknown"],
    ["Android", rom.android || "Unknown"],
    ["Released", rom.datePretty || "Unknown"],
    ["Size", rom.size || "Unknown"],
    ["MD5", rom.md5 || "Unknown"],
  ];

  for (const [label, value] of cells) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.innerHTML = `<span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span>`;
    grid.appendChild(cell);
  }

  const actions = document.createElement("div");
  actions.className = "actions";

  if (rom.mainLink) {
    const download = document.createElement("a");
    download.className = "btn primary";
    download.href = rom.mainLink;
    download.target = "_blank";
    download.rel = "noopener";
    download.textContent = "Download";
    actions.appendChild(download);

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn secondary";
    copy.textContent = "Copy Link";
    copy.addEventListener("click", async () => {
      await copyText(rom.mainLink);
      setStatus("Copied main download URL.");
    });
    actions.appendChild(copy);
  }

  if (rom.incremental) {
    const incremental = document.createElement("a");
    incremental.className = "btn secondary";
    incremental.href = rom.incremental;
    incremental.target = "_blank";
    incremental.rel = "noopener";
    incremental.textContent = "Incremental";
    actions.appendChild(incremental);
  }

  step.appendChild(head);
  step.appendChild(grid);
  step.appendChild(actions);
  ui.wizard.appendChild(step);
}

function collectOptions(field, filter = {}) {
  const set = new Set(filterRoms(filter).map((rom) => rom[field]).filter(Boolean));
  const values = [...set];

  if (field === "branch") {
    const order = { stable: 0, weekly: 1, beta: 2 };
    values.sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99));
    return values;
  }

  return values.sort((a, b) => a.localeCompare(b));
}

function countMatching(filter) {
  return filterRoms(filter).length;
}

function filterRoms(filter) {
  return state.roms.filter((rom) => {
    for (const [k, v] of Object.entries(filter)) {
      if (!v) {
        continue;
      }
      if (rom[k] !== v) {
        return false;
      }
    }
    return true;
  });
}

function resetFlow() {
  state.feedRequestId += 1;
  state.roms = [];
  state.pick.branch = null;
  state.pick.method = null;
  state.pick.region = null;
  state.pick.version = null;
  ui.wizard.innerHTML = "";
}

function resetAll() {
  state.pick.code = null;
  ui.input.value = "";
  closeDropdown();
  resetFlow();
  sessionStorage.removeItem(SESSION_KEY);
  setStatus("Session reset. Search a codename to start.");
}

function setStatus(message, isError = false) {
  ui.status.textContent = message;
  ui.status.classList.toggle("error", isError);
}

function persistSession() {
  const payload = {
    code: state.pick.code,
    branch: state.pick.branch,
    method: state.pick.method,
    region: state.pick.region,
    version: state.pick.version,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function restoreSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) {
    return;
  }

  try {
    const snapshot = JSON.parse(raw);
    state.pick = { ...state.pick, ...snapshot };
    if (state.pick.code) {
      ui.input.value = state.pick.code;
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}
