import { USERS } from "./config.js";
import {
  decrementDate,
  decrementToday,
  fetchMonthlyHistory,
  fetchUserEntries,
  incrementDate,
  incrementToday,
  isSupabaseConfigured,
  replaceMonthlyHistory
} from "./supabaseClient.js";
import {
  computeStats,
  currentWeekIndex,
  renderHeatmap,
  renderMonthRow,
  rowsToDateCountMap
} from "./heatmap.js";

const els = {
  historyEmpty: document.getElementById("historyEmpty"),
  historyList: document.getElementById("historyList"),
  historyMonth: document.getElementById("historyMonth"),
  leaderboardList: document.getElementById("leaderboardList"),
  leaderboardMonth: document.getElementById("leaderboardMonth"),
  usersGrid: document.getElementById("usersGrid"),
  status: document.getElementById("status")
};

const state = {
  year: new Date().getFullYear(),
  users: USERS,
  userData: {},
  history: {
    monthKey: "",
    monthLabel: "",
    rows: []
  },
  historySourceUserData: {},
  isSaving: false,
  touchGesture: {
    timerId: null,
    consumedLongPress: false,
    isoDate: null,
    user: null
  },
  suppressNextClick: false
};
const CELL_SIZE = 12;
const CELL_GAP = 3;

function setStatus(message) {
  els.status.textContent = message;
}

function weeklyPoints(weekCount) {
  const n = Number(weekCount) || 0;
  if (n >= 5) return 2;
  if (n >= 3) return 1;
  if (n >= 1) return -1;
  return -2;
}

function toUtcDateOnly(dateObj) {
  return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
}

function monthKeyFromDate(dateObj) {
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  return `${dateObj.getUTCFullYear()}-${month}`;
}

function previousMonthInfo(baseDate = new Date()) {
  const base = toUtcDateOnly(baseDate);
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 0));
  return {
    monthKey: monthKeyFromDate(start),
    start,
    end,
    year: start.getUTCFullYear(),
    monthLabel: start.toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
  };
}

function pointsToneClass(points) {
  if (points > 0) return "points-positive";
  if (points < 0) return "points-negative";
  return "points-neutral";
}

function toUtcIsoDate(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function startOfUtcWeek(dateObj) {
  const d = new Date(Date.UTC(
    dateObj.getUTCFullYear(),
    dateObj.getUTCMonth(),
    dateObj.getUTCDate()
  ));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

function monthlyLeaderboardRows(userData) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const scoringEnd = monthEnd < todayUtc ? monthEnd : todayUtc;

  const rows = state.users.map((name) => {
    const dateCountMap = userData[name] ?? {};
    const weeklyCounts = new Map();

    const cursor = new Date(monthStart);
    while (cursor <= scoringEnd) {
      const iso = toUtcIsoDate(cursor);
      const count = Number(dateCountMap[iso] ?? 0) || 0;
      const weekStartIso = toUtcIsoDate(startOfUtcWeek(cursor));
      weeklyCounts.set(weekStartIso, (weeklyCounts.get(weekStartIso) ?? 0) + count);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    let points = 0;
    for (const weekCount of weeklyCounts.values()) {
      points += weeklyPoints(weekCount);
    }

    return { name, points };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function monthlySummaryRowsForRange(userData, rangeStart, rangeEnd) {
  const rows = state.users.map((name) => {
    const dateCountMap = userData[name] ?? {};
    const weeklyCounts = new Map();
    let papersRead = 0;

    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      const iso = toUtcIsoDate(cursor);
      const count = Number(dateCountMap[iso] ?? 0) || 0;
      papersRead += count;
      const weekStartIso = toUtcIsoDate(startOfUtcWeek(cursor));
      weeklyCounts.set(weekStartIso, (weeklyCounts.get(weekStartIso) ?? 0) + count);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    let points = 0;
    for (const weekCount of weeklyCounts.values()) {
      points += weeklyPoints(weekCount);
    }
    return { name, papers_read: papersRead, points };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function renderLeaderboard() {
  if (!els.leaderboardList || !els.leaderboardMonth) {
    return;
  }
  const monthLabel = new Date().toLocaleString(undefined, {
    month: "long",
    year: "numeric"
  });
  els.leaderboardMonth.textContent = monthLabel;

  const rows = monthlyLeaderboardRows(state.userData);
  els.leaderboardList.innerHTML = "";
  for (let i = 0; i < rows.length; i += 1) {
    const li = document.createElement("li");
    li.className = "leaderboard-item";
    const name = document.createElement("span");
    name.className = "leaderboard-name";
    name.textContent = rows[i].name;
    const points = document.createElement("span");
    points.className = `points-badge ${pointsToneClass(rows[i].points)}`;
    points.textContent = `${rows[i].points} pts`;
    li.appendChild(name);
    li.appendChild(points);
    els.leaderboardList.appendChild(li);
  }
}

function renderHistory() {
  if (!els.historyList || !els.historyEmpty || !els.historyMonth) {
    return;
  }
  els.historyMonth.textContent = state.history.monthLabel
    ? `Last month: ${state.history.monthLabel}`
    : "";
  els.historyList.innerHTML = "";

  const rows = state.history.rows ?? [];
  if (!rows.length) {
    els.historyEmpty.hidden = false;
    return;
  }

  els.historyEmpty.hidden = true;
  const pointsValues = rows.map((row) => Number(row.points) || 0);
  const maxPoints = Math.max(...pointsValues);
  const minPoints = Math.min(...pointsValues);
  const allEqual = maxPoints === minPoints;

  for (const row of rows) {
    const li = document.createElement("li");
    const points = Number(row.points) || 0;
    const papersRead = Number(row.papers_read) || 0;
    let marker = "";
    if (!allEqual && points === maxPoints) {
      marker = "👑 ";
    } else if (!allEqual && points === minPoints) {
      marker = "🍰 ";
    }
    li.textContent = `${marker}${row.name} - ${papersRead} papers - ${points} pts`;
    els.historyList.appendChild(li);
  }
}

function buildUserCard(name, dateCountMap) {
  const stats = computeStats(dateCountMap);
  const thisWeekPoints = weeklyPoints(stats.thisWeek);
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
      <div>
        <p class="label">This week points</p>
        <p class="value"><span class="points-badge ${pointsToneClass(thisWeekPoints)}">${thisWeekPoints} pts</span></p>
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
  renderLeaderboard();
  renderHistory();
}

async function fetchUsersDataForYear(year) {
  const rowsByUser = await Promise.all(
    state.users.map((name) => fetchUserEntries(name, year))
  );
  const userData = {};
  for (let i = 0; i < state.users.length; i += 1) {
    userData[state.users[i]] = rowsToDateCountMap(rowsByUser[i]);
  }
  return userData;
}

function isSameMonthKey(isoDate, monthKey) {
  return typeof isoDate === "string" && isoDate.slice(0, 7) === monthKey;
}

async function refreshLastMonthHistory(forceRecompute = false) {
  if (!isSupabaseConfigured()) {
    state.history = { monthKey: "", monthLabel: "", rows: [] };
    return;
  }
  const monthInfo = previousMonthInfo();
  state.history.monthKey = monthInfo.monthKey;
  state.history.monthLabel = monthInfo.monthLabel;

  state.historySourceUserData = await fetchUsersDataForYear(monthInfo.year);
  const computedRows = monthlySummaryRowsForRange(
    state.historySourceUserData,
    monthInfo.start,
    monthInfo.end
  );
  const hasActivity = computedRows.some((row) => row.papers_read > 0);

  let rows = await fetchMonthlyHistory(monthInfo.monthKey);
  if (forceRecompute) {
    await replaceMonthlyHistory(monthInfo.monthKey, hasActivity ? computedRows : []);
    rows = await fetchMonthlyHistory(monthInfo.monthKey);
  } else if (!rows.length && hasActivity) {
    await replaceMonthlyHistory(monthInfo.monthKey, computedRows);
    rows = await fetchMonthlyHistory(monthInfo.monthKey);
  }

  state.history.rows = rows.map((row) => ({
    name: row.name,
    papers_read: Number(row.papers_read) || 0,
    points: Number(row.points) || 0
  }));
}

async function loadAllData() {
  if (!isSupabaseConfigured()) {
    setStatus("Set Supabase URL and anon key in config.js to enable persistence.");
    renderAllUsers();
    return;
  }

  setStatus("Loading data...");
  state.userData = await fetchUsersDataForYear(state.year);
  await refreshLastMonthHistory(false);
  renderAllUsers();
  setStatus("");
}

function setButtonsDisabled(disabled) {
  const buttons = els.usersGrid.querySelectorAll("button[data-user]");
  for (const button of buttons) {
    button.disabled = disabled;
  }
}

function isEditableIsoDate(isoDate) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const todayIso = toUtcIsoDate(today);
  const yesterdayIso = toUtcIsoDate(yesterday);
  return isoDate === todayIso || isoDate === yesterdayIso;
}

async function onDateAction(action, name, isoDate) {
  if (!isSupabaseConfigured()) {
    setStatus("Supabase not configured yet. Update config.js first.");
    return;
  }
  if (!isEditableIsoDate(isoDate)) {
    return;
  }
  if (state.isSaving) {
    return;
  }
  state.isSaving = true;
  setButtonsDisabled(true);
  setStatus("Saving...");
  try {
    if (action === "increment") {
      await incrementDate(name, isoDate);
    } else if (action === "decrement") {
      await decrementDate(name, isoDate);
    }
    const rows = await fetchUserEntries(name, state.year);
    state.userData[name] = rowsToDateCountMap(rows);
    const prevMonth = previousMonthInfo();
    if (isSameMonthKey(isoDate, prevMonth.monthKey)) {
      await refreshLastMonthHistory(true);
    }
    renderAllUsers();
    setStatus("");
  } catch (error) {
    setStatus(`Save failed: ${error.message}`);
  } finally {
    setButtonsDisabled(false);
    state.isSaving = false;
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
  if (state.isSaving) {
    return;
  }

  state.isSaving = true;
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
    const todayIso = toUtcIsoDate(new Date());
    const prevMonth = previousMonthInfo();
    if (isSameMonthKey(todayIso, prevMonth.monthKey)) {
      await refreshLastMonthHistory(true);
    }
    renderAllUsers();
    setStatus("");
  } catch (error) {
    setStatus(`Save failed: ${error.message}`);
  } finally {
    setButtonsDisabled(false);
    state.isSaving = false;
  }
}

function attachEvents() {
  els.usersGrid.addEventListener("click", (event) => {
    if (state.suppressNextClick) {
      state.suppressNextClick = false;
      return;
    }
    const button = event.target.closest("button[data-action][data-user]");
    if (button) {
      const action = button.dataset.action;
      const user = button.dataset.user;
      onUserAction(action, user);
      return;
    }

    const cell = event.target.closest(".cell[data-date]");
    if (!cell || !cell.classList.contains("editable")) {
      return;
    }
    const card = cell.closest(".user-card");
    if (!card) {
      return;
    }
    const user = card.dataset.user;
    const isoDate = cell.dataset.date;
    const action = event.shiftKey ? "decrement" : "increment";
    onDateAction(action, user, isoDate);
  });

  els.usersGrid.addEventListener("touchstart", (event) => {
    const cell = event.target.closest(".cell[data-date].editable");
    if (!cell) {
      return;
    }
    const card = cell.closest(".user-card");
    if (!card) {
      return;
    }
    state.touchGesture.consumedLongPress = false;
    state.touchGesture.isoDate = cell.dataset.date;
    state.touchGesture.user = card.dataset.user;
    clearTimeout(state.touchGesture.timerId);
    state.touchGesture.timerId = setTimeout(() => {
      state.touchGesture.consumedLongPress = true;
      state.suppressNextClick = true;
      onDateAction("decrement", state.touchGesture.user, state.touchGesture.isoDate);
    }, 450);
  }, { passive: true });

  els.usersGrid.addEventListener("touchend", () => {
    clearTimeout(state.touchGesture.timerId);
    if (!state.touchGesture.isoDate || !state.touchGesture.user) {
      return;
    }
    if (!state.touchGesture.consumedLongPress) {
      state.suppressNextClick = true;
      onDateAction("increment", state.touchGesture.user, state.touchGesture.isoDate);
    }
    state.touchGesture.isoDate = null;
    state.touchGesture.user = null;
    state.touchGesture.consumedLongPress = false;
  }, { passive: true });

  els.usersGrid.addEventListener("touchcancel", () => {
    clearTimeout(state.touchGesture.timerId);
    state.touchGesture.isoDate = null;
    state.touchGesture.user = null;
    state.touchGesture.consumedLongPress = false;
  }, { passive: true });

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
