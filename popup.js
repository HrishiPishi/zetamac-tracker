const STORAGE_KEY = "zetamac_sessions_v1";
const $ = selector => document.querySelector(selector);

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSessions() {
  return new Promise(resolve => chrome.storage.local.get({ [STORAGE_KEY]: [] }, result => resolve(result[STORAGE_KEY] || [])));
}

async function render() {
  const sessions = await getSessions();
  const todaysSessions = sessions.filter(session => session.date === localDate());
  const todayBest = todaysSessions.length ? Math.max(...todaysSessions.map(session => Number(session.score) || 0)) : 0;
  const allBest = sessions.length ? Math.max(...sessions.map(session => Number(session.score) || 0)) : 0;
  $("#todayBest").textContent = todayBest || "—";
  $("#playsToday").textContent = todaysSessions.length || "—";
  $("#allBest").textContent = allBest || "—";
  $("#totalPlays").textContent = sessions.length || "—";
}

$("#dashboardBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());

$("#saveBtn").addEventListener("click", async () => {
  $("#status").textContent = "saving current score...";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("arithmetic.zetamac.com")) {
    $("#status").textContent = "open a Zetamac game tab first";
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: "ZETAMAC_TRACKER_FORCE_SAVE" }, async response => {
    if (chrome.runtime.lastError) {
      $("#status").textContent = "reload the Zetamac tab, then try again";
      return;
    }
    if (!response?.ok) {
      $("#status").textContent = response?.error || "could not save score";
      return;
    }
    $("#status").textContent = response.saved ? `saved score ${response.score}` : `already saved score ${response.score}`;
    await render();
  });
});

render();
