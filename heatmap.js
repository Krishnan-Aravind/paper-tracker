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

export function renderHeatmap(gridEl, year, dateCountMap) {
  gridEl.innerHTML = "";

  const todayIso = toIsoDate(new Date());
  const start = startOfGridYear(year);

  for (let week = 0; week < 53; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const dateObj = cellDate(start, week, day);
      const iso = toIsoDate(dateObj);
      const count = dateCountMap[iso] ?? 0;

      const cell = document.createElement("div");
      cell.className = `cell level${levelForCount(count)}`;
      if (iso === todayIso) {
        cell.classList.add("today");
      }

      const displayDate = dateObj.toISOString().slice(0, 10);
      cell.title = `${displayDate}: ${count} paper${count === 1 ? "" : "s"}`;
      gridEl.appendChild(cell);
    }
  }
}

export function computeStats(dateCountMap) {
  const today = toIsoDate(new Date());
  let total = 0;

  for (const count of Object.values(dateCountMap)) {
    total += count;
  }

  return {
    today: dateCountMap[today] ?? 0,
    total
  };
}
