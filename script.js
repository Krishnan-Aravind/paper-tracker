import { DEFAULT_USER } from "./config.js";
import {
  fetchUserEntries,
  incrementToday,
  isSupabaseConfigured,
  toIsoDate
} from "./supabaseClient.js";
import { computeStats, renderHeatmap, rowsToDateCountMap } from "./heatmap.js";

const els = {
  userName: document.getElementById("userName"),
  todayCount: document.getElementById("todayCount"),
  totalCount: document.getElementById("totalCount"),
  incrementBtn: document.getElementById("incrementBtn"),
  heatmapGrid: document.getElementById("heatmapGrid"),
  status: document.getElementById("status")
};

const state = {
  year: new Date().getFullYear(),
  user: DEFAULT_USER,
  dateCountMap: {}
};

function setStatus(message) {
  els.status.textContent = message;
}

function render() {
  els.userName.textContent = state.user;
  renderHeatmap(els.heatmapGrid, state.year, state.dateCountMap);

  const stats = computeStats(state.dateCountMap);
  els.todayCount.textContent = String(stats.today);
  els.totalCount.textContent = String(stats.total);
}

async function loadData() {
  if (!isSupabaseConfigured()) {
    setStatus("Set Supabase URL and anon key in config.js to enable persistence.");
    render();
    return;
  }

  setStatus("Loading data...");
  const rows = await fetchUserEntries(state.user, state.year);
  state.dateCountMap = rowsToDateCountMap(rows);
  render();
  setStatus("Ready.");
}

async function onIncrementClick() {
  if (!isSupabaseConfigured()) {
    setStatus("Supabase not configured yet. Update config.js first.");
    return;
  }

  els.incrementBtn.disabled = true;
  setStatus("Saving...");
  try {
    const nextCount = await incrementToday(state.user);
    state.dateCountMap[toIsoDate(new Date())] = nextCount;
    render();
    setStatus("Saved.");
  } catch (error) {
    setStatus(`Save failed: ${error.message}`);
  } finally {
    els.incrementBtn.disabled = false;
  }
}

async function init() {
  els.incrementBtn.addEventListener("click", onIncrementClick);
  try {
    await loadData();
  } catch (error) {
    render();
    setStatus(`Load failed: ${error.message}`);
  }
}

init();
