const STORAGE_KEY = "zetamac_sessions_v1";
const $ = selector => document.querySelector(selector);
const today = () => localDate(new Date());

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function getSessions() {
  return new Promise(resolve => chrome.storage.local.get({ [STORAGE_KEY]: [] }, result => resolve(result[STORAGE_KEY] || [])));
}

function setSessions(sessions) {
  return new Promise(resolve => chrome.storage.local.set({ [STORAGE_KEY]: sessions }, resolve));
}

function normalizeSession(session) {
  const timestamp = session.timestamp || new Date().toISOString();
  return {
    id: session.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    date: session.date || localDate(new Date(timestamp)),
    score: Number(session.score) || 0,
    reason: session.reason || "imported",
    url: session.url || null,
    gameKey: session.gameKey || null,
    elapsedMs: session.elapsedMs || null,
    durationSeconds: session.durationSeconds || null,
  };
}

function dailyStats(sessions) {
  const map = new Map();
  for (const session of sessions) {
    if (!map.has(session.date)) {
      map.set(session.date, { date: session.date, best: 0, plays: 0, total: 0, first: session.timestamp, last: session.timestamp });
    }
    const day = map.get(session.date);
    day.best = Math.max(day.best, session.score);
    day.plays += 1;
    day.total += session.score;
    if (new Date(session.timestamp) < new Date(day.first)) day.first = session.timestamp;
    if (new Date(session.timestamp) > new Date(day.last)) day.last = session.timestamp;
  }
  return [...map.values()].map(day => ({ ...day, avg: day.total / day.plays })).sort((a, b) => a.date.localeCompare(b.date));
}

function filterRange(days) {
  return sessions => {
    if (days === "all") return sessions;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - Number(days) + 1);
    return sessions.filter(session => new Date(session.date + "T00:00:00") >= cutoff);
  };
}

function currentStreak(days) {
  const byDate = new Set(days.map(day => day.date));
  let count = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (byDate.has(localDate(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function drawLineChart(canvas, days, valueKey) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.clientWidth * window.devicePixelRatio;
  const height = canvas.height = Math.max(220, canvas.clientHeight || 220) * window.devicePixelRatio;
  ctx.clearRect(0, 0, width, height);
  const pad = 42 * window.devicePixelRatio;
  const values = days.map(day => day[valueKey]);
  if (!values.length) return drawEmpty(ctx, width, height);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const x = index => pad + (index / Math.max(days.length - 1, 1)) * (width - pad * 1.4);
  const y = value => height - pad - ((value - min) / span) * (height - pad * 1.6);

  drawAxes(ctx, width, height, pad, max);
  ctx.lineWidth = 3 * window.devicePixelRatio;
  ctx.beginPath();
  days.forEach((day, index) => {
    const px = x(index);
    const py = y(day[valueKey]);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  for (const [index, day] of days.entries()) {
    ctx.beginPath();
    ctx.arc(x(index), y(day[valueKey]), 4 * window.devicePixelRatio, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBarChart(canvas, days, valueKey) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.clientWidth * window.devicePixelRatio;
  const height = canvas.height = Math.max(220, canvas.clientHeight || 220) * window.devicePixelRatio;
  ctx.clearRect(0, 0, width, height);
  const pad = 42 * window.devicePixelRatio;
  const values = days.map(day => day[valueKey]);
  if (!values.length) return drawEmpty(ctx, width, height);
  const max = Math.max(...values, 1);
  drawAxes(ctx, width, height, pad, max);
  const plotWidth = width - pad * 1.4;
  const barGap = 6 * window.devicePixelRatio;
  const barWidth = Math.max(5 * window.devicePixelRatio, (plotWidth / days.length) - barGap);
  days.forEach((day, index) => {
    const value = day[valueKey];
    const barHeight = (value / max) * (height - pad * 1.6);
    const x = pad + index * (plotWidth / days.length) + barGap / 2;
    const y = height - pad - barHeight;
    ctx.fillRect(x, y, barWidth, barHeight);
  });
}

function drawAxes(ctx, width, height, pad, max) {
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = window.devicePixelRatio;
  ctx.beginPath();
  ctx.moveTo(pad, 18 * window.devicePixelRatio);
  ctx.lineTo(pad, height - pad);
  ctx.lineTo(width - 16 * window.devicePixelRatio, height - pad);
  ctx.stroke();
  ctx.globalAlpha = 0.75;
  ctx.font = `${12 * window.devicePixelRatio}px system-ui`;
  ctx.fillText(String(Math.round(max)), 8 * window.devicePixelRatio, 24 * window.devicePixelRatio);
  ctx.fillText("0", 12 * window.devicePixelRatio, height - pad + 4 * window.devicePixelRatio);
  ctx.restore();
}

function drawEmpty(ctx, width, height) {
  ctx.save();
  ctx.font = `${16 * window.devicePixelRatio}px system-ui`;
  ctx.globalAlpha = 0.55;
  ctx.fillText("no scores yet", 24 * window.devicePixelRatio, 52 * window.devicePixelRatio);
  ctx.restore();
}

async function render() {
  const allSessions = (await getSessions()).map(normalizeSession).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const selectedSessions = filterRange($("#rangeSelect").value)(allSessions);
  const allDays = dailyStats(allSessions);
  const selectedDays = dailyStats(selectedSessions);
  const todaysSessions = allSessions.filter(session => session.date === today());

  const allBest = allSessions.length ? Math.max(...allSessions.map(session => session.score)) : 0;
  const todayBest = todaysSessions.length ? Math.max(...todaysSessions.map(session => session.score)) : 0;
  const avgSelected = selectedSessions.length ? selectedSessions.reduce((sum, session) => sum + session.score, 0) / selectedSessions.length : 0;

  $("#allBest").textContent = allBest || "—";
  $("#todayBest").textContent = todayBest || "—";
  $("#playsToday").textContent = todaysSessions.length || "—";
  $("#streak").textContent = currentStreak(allDays) ? `${currentStreak(allDays)} day${currentStreak(allDays) === 1 ? "" : "s"}` : "—";
  $("#avgSelected").textContent = avgSelected ? avgSelected.toFixed(1) : "—";
  $("#totalPlays").textContent = allSessions.length || "—";

  drawLineChart($("#bestChart"), selectedDays, "best");
  drawBarChart($("#playsChart"), selectedDays, "plays");

  const dailyRows = [...selectedDays].reverse().map(day => `
    <tr>
      <td>${day.date}</td>
      <td>${day.best}</td>
      <td>${day.plays}</td>
      <td>${day.avg.toFixed(1)}</td>
      <td>${formatTime(day.first)}</td>
      <td>${formatTime(day.last)}</td>
    </tr>
  `).join("");
  $("#dailyTable").innerHTML = dailyRows || `<tr><td colspan="6" class="empty">No Zetamac sessions saved yet.</td></tr>`;

  const sessionRows = [...allSessions].reverse().slice(0, 80).map(session => `
    <tr>
      <td>${formatDateTime(session.timestamp)}</td>
      <td>${session.score}</td>
      <td>${session.reason || "auto"}</td>
      <td><button class="deleteBtn" data-delete="${session.id}">delete</button></td>
    </tr>
  `).join("");
  $("#sessionTable").innerHTML = sessionRows || `<tr><td colspan="4" class="empty">No sessions yet.</td></tr>`;
}

$("#rangeSelect").addEventListener("change", render);

$("#manualDate").value = today();
$("#manualForm").addEventListener("submit", async event => {
  event.preventDefault();
  const score = Number($("#manualScore").value);
  const date = $("#manualDate").value;
  if (!date || Number.isNaN(score)) return;
  const timestamp = new Date(`${date}T12:00:00`).toISOString();
  const sessions = await getSessions();
  sessions.push(normalizeSession({ timestamp, date, score, reason: "manual" }));
  await setSessions(sessions);
  $("#manualScore").value = "";
  await render();
});

$("#sessionTable").addEventListener("click", async event => {
  const id = event.target?.dataset?.delete;
  if (!id) return;
  const sessions = await getSessions();
  await setSessions(sessions.filter(session => session.id !== id));
  await render();
});

$("#exportBtn").addEventListener("click", async () => {
  const sessions = await getSessions();
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), sessions }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zetamac-scores-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$("#importInput").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const payload = JSON.parse(text);
  const incoming = Array.isArray(payload) ? payload : payload.sessions;
  if (!Array.isArray(incoming)) throw new Error("Import file must contain a sessions array.");
  const existing = await getSessions();
  const merged = [...existing, ...incoming.map(normalizeSession)];
  const unique = new Map();
  for (const session of merged) unique.set(session.id, session);
  await setSessions([...unique.values()].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
  event.target.value = "";
  await render();
});

$("#clearBtn").addEventListener("click", async () => {
  if (!confirm("Clear all saved Zetamac sessions from this browser?")) return;
  await setSessions([]);
  await render();
});

window.addEventListener("resize", render);
render();
