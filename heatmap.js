export function toIsoDate(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

export function rowsToDateCountMap(rows) {
  const map = {};
  for (const row of rows) {
    map[row.date] = row.count;
  }
  return map;
}

function startOfGridYear(year) {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const day = jan1.getUTCDay(); // Sunday = 0
  jan1.setUTCDate(jan1.getUTCDate() - day);
  return jan1;
}

function weekIndexForDate(year, targetDate) {
  const start = startOfGridYear(year);
  const utcTarget = new Date(
    Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth(),
      targetDate.getUTCDate()
    )
  );
  const diffDays = Math.floor((utcTarget - start) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7);
}

export function currentWeekIndex(year) {
  return Math.max(0, Math.min(52, weekIndexForDate(year, new Date())));
}

function levelForCount(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

function cellDate(startDate, week, day) {
  const date = new Date(startDate);
  date.setUTCDate(startDate.getUTCDate() + week * 7 + day);
  return date;
}

export function renderHeatmap(gridEl, year, dateCountMap, range = {}) {
  gridEl.innerHTML = "";
  const startWeek = range.startWeek ?? 0;
  const weekCount = range.weekCount ?? 53;
  gridEl.style.gridTemplateColumns = `repeat(${weekCount}, 12px)`;

  const todayIso = toIsoDate(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = toIsoDate(yesterday);
  const start = startOfGridYear(year);

  for (let week = startWeek; week < startWeek + weekCount; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const dateObj = cellDate(start, week, day);
      const iso = toIsoDate(dateObj);
      const count = dateCountMap[iso] ?? 0;

      const cell = document.createElement("div");
      cell.className = `cell level${levelForCount(count)}`;
      cell.dataset.date = iso;
      if (iso === todayIso) {
        cell.classList.add("today");
      }
      if (iso === todayIso || iso === yesterdayIso) {
        cell.classList.add("editable");
      } else {
        cell.classList.add("locked");
      }

      const displayDate = dateObj.toISOString().slice(0, 10);
      cell.title = `${displayDate}: ${count} paper${count === 1 ? "" : "s"}`;
      gridEl.appendChild(cell);
    }
  }
}

export function computeStats(dateCountMap) {
  const now = new Date();
  const today = toIsoDate(now);
  let total = 0;

  for (const count of Object.values(dateCountMap)) {
    total += count;
  }

  const monday = new Date(now);
  const day = monday.getDay();
  const offsetToMonday = (day + 6) % 7;
  monday.setDate(monday.getDate() - offsetToMonday);
  monday.setHours(0, 0, 0, 0);

  let thisWeek = 0;
  for (let i = 0; i < 7; i += 1) {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    thisWeek += dateCountMap[toIsoDate(current)] ?? 0;
  }

  return {
    today: dateCountMap[today] ?? 0,
    total,
    thisWeek
  };
}

export function renderMonthRow(monthRowEl, year, range = {}) {
  monthRowEl.innerHTML = "";
  const startWeek = range.startWeek ?? 0;
  const weekCount = range.weekCount ?? 53;
  monthRowEl.style.gridTemplateColumns = `repeat(${weekCount}, 12px)`;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const firstWeekByMonth = new Map();

  for (let month = 0; month < 12; month += 1) {
    const monthStart = new Date(Date.UTC(year, month, 1));
    const week = Math.max(0, Math.min(52, weekIndexForDate(year, monthStart)));
    if (!firstWeekByMonth.has(week)) {
      firstWeekByMonth.set(week, monthNames[month]);
    }
  }

  for (let week = startWeek; week < startWeek + weekCount; week += 1) {
    const cell = document.createElement("div");
    cell.className = "month-cell";
    cell.textContent = firstWeekByMonth.get(week) ?? "";
    monthRowEl.appendChild(cell);
  }
}
