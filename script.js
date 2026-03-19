import { USERS } from "./config.js";
import {
  decrementToday,
  fetchUserEntries,
  incrementToday,
  isSupabaseConfigured
} from "./supabaseClient.js";
import {
  computeStats,
  currentWeekIndex,
  renderHeatmap,
  renderMonthRow,
  rowsToDateCountMap
} from "./heatmap.js";

const els = {
  usersGrid: document.getElementById("usersGrid"),
  status: document.getElementById("status")
};

const state = {
  year: new Date().getFullYear(),
  users: USERS,
  userData: {}
};
const CELL_SIZE = 12;
const CELL_GAP = 3;

function setStatus(message) {
  els.status.textContent = message;
}

function buildUserCard(name, dateCountMap) {
  const stats = computeStats(dateCountMap);
  const card = document.createElement("article");
  card.className = "card user-card";
  card.dataset.user = name;
  card.classList.add(`user-${name.toLowerCase()}`);

  card.innerHTML = `
    <div class="user-card-header">
      <div>
        <p class="label">User</p>
        <p class="value">${name}</p>
      </div>
      <div class="user-card-actions">
        <button type="button" data-action="increment" data-user="${name}">+1 today</button>
        <button type="button" class="btn-secondary" data-action="decrement" data-user="${name}">-1 today</button>
      </div>
    </div>
    <div class="user-card-stats">
      <div>
        <p class="label">Today</p>
        <p class="value">${stats.today}</p>
      </div>
      <div>
        <p class="label">Papers this week</p>
        <p class="value">${stats.thisWeek}</p>
      </div>
    </div>
    <div class="heatmap-shell">
      <div class="weekday-col" aria-hidden="true">
        <span>M</span>
        <span>W</span>
        <span>F</span>
      </div>
      <div class="heatmap-scroll">
        <div class="month-row" aria-hidden="true"></div>
        <div class="grid" aria-label="Reading activity heatmap for ${name}"></div>
      </div>
    </div>
  `;

  const monthRow = card.querySelector(".month-row");
  const grid = card.querySelector(".grid");
  monthRow.innerHTML = "";
  grid.innerHTML = "";

  return card;
}

function visibleWeekRange(containerWidth) {
  const weekWidth = CELL_SIZE + CELL_GAP;
  const fitted = Math.floor((containerWidth + CELL_GAP) / weekWidth);
  const weekCount = Math.max(6, Math.min(53, fitted || 0));
  const currentWeek = currentWeekIndex(state.year);
  const startWeek = Math.max(0, currentWeek - weekCount + 1);
  return { startWeek, weekCount };
}

function renderWindowForCard(card) {
  const name = card.dataset.user;
  const dateCountMap = state.userData[name] ?? {};
  const scrollEl = card.querySelector(".heatmap-scroll");
  const monthRow = card.querySelector(".month-row");
  const grid = card.querySelector(".grid");
  if (!scrollEl || !monthRow || !grid) {
    return;
  }

  const range = visibleWeekRange(scrollEl.clientWidth);
  renderMonthRow(monthRow, state.year, range);
  renderHeatmap(grid, state.year, dateCountMap, range);
}

function renderAllUsers() {
  els.usersGrid.innerHTML = "";
  for (const name of state.users) {
    const map = state.userData[name] ?? {};
    els.usersGrid.appendChild(buildUserCard(name, map));
  }

  // Render visible weeks only after cards are mounted and measurable.
  requestAnimationFrame(() => {
    const cards = els.usersGrid.querySelectorAll(".user-card");
    for (const card of cards) {
      renderWindowForCard(card);
    }
  });
}

async function loadAllData() {
  if (!isSupabaseConfigured()) {
    setStatus("Set Supabase URL and anon key in config.js to enable persistence.");
    renderAllUsers();
    return;
  }

  setStatus("Loading data...");
  const rowsByUser = await Promise.all(
    state.users.map((name) => fetchUserEntries(name, state.year))
  );
  state.userData = {};
  for (let i = 0; i < state.users.length; i += 1) {
    state.userData[state.users[i]] = rowsToDateCountMap(rowsByUser[i]);
  }
  renderAllUsers();
  setStatus("Ready.");
}

function setButtonsDisabled(disabled) {
  const buttons = els.usersGrid.querySelectorAll("button[data-user]");
  for (const button of buttons) {
    button.disabled = disabled;
  }
}

async function onUserAction(action, name) {
  if (!isSupabaseConfigured()) {
    setStatus("Supabase not configured yet. Update config.js first.");
    return;
  }

  const validUser = state.users.includes(name);
  if (!validUser) {
    setStatus("Unknown user.");
    return;
  }

  setButtonsDisabled(true);
  setStatus("Saving...");
  try {
    if (action === "increment") {
      await incrementToday(name);
    } else if (action === "decrement") {
      await decrementToday(name);
    }
    const rows = await fetchUserEntries(name, state.year);
    state.userData[name] = rowsToDateCountMap(rows);
    renderAllUsers();
    setStatus("Saved.");
  } catch (error) {
    setStatus(`Save failed: ${error.message}`);
  } finally {
    setButtonsDisabled(false);
  }
}

function attachEvents() {
  els.usersGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action][data-user]");
    if (!button) {
      return;
    }
    const action = button.dataset.action;
    const user = button.dataset.user;
    onUserAction(action, user);
  });

  window.addEventListener("resize", () => {
    const cards = els.usersGrid.querySelectorAll(".user-card");
    for (const card of cards) {
      renderWindowForCard(card);
    }
  });
}

async function init() {
  attachEvents();
  try {
    await loadAllData();
  } catch (error) {
    renderAllUsers();
    setStatus(`Load failed: ${error.message}`);
  }
}

init();
