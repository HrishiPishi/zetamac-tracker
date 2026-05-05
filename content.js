const STORAGE_KEY = "zetamac_sessions_v1";

let currentGame = {
  startedAt: null,
  firstSeenAt: Date.now(),
  lastSeenAt: Date.now(),
  lastScore: null,
  maxScore: 0,
  lastSecondsLeft: null,
  sawActiveAnswerBox: false,
  saved: false,
  gameKey: new URL(location.href).searchParams.get("key") || null,
};

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function bodyText() {
  return document.body ? document.body.innerText || "" : "";
}

function readScores(text) {
  return [...text.matchAll(/Score:\s*(\d+)/gi)].map(match => Number(match[1]));
}

function readCurrentScore() {
  const scores = readScores(bodyText());
  if (!scores.length) return null;
  return Math.max(...scores);
}

function readSecondsLeft() {
  const match = bodyText().match(/Seconds\s+left:\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function hasAnswerBox() {
  const inputs = [...document.querySelectorAll("input")];
  return inputs.some(input => {
    const type = (input.getAttribute("type") || "text").toLowerCase();
    const visible = Boolean(input.offsetWidth || input.offsetHeight || input.getClientRects().length);
    return visible && ["text", "number", "tel", ""].includes(type) && !input.disabled && !input.readOnly;
  });
}

function readSettings() {
  const text = bodyText();
  const duration = text.match(/Duration:\s*(\d+)\s*seconds/i);
  return {
    url: location.href,
    gameKey: currentGame.gameKey,
    durationSeconds: duration ? Number(duration[1]) : null,
  };
}

function getSessions() {
  return new Promise(resolve => {
    chrome.storage.local.get({ [STORAGE_KEY]: [] }, result => resolve(result[STORAGE_KEY] || []));
  });
}

function setSessions(sessions) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEY]: sessions }, resolve);
  });
}

function isDuplicate(sessions, session) {
  return sessions.some(existing => {
    const sameKey = session.gameKey && existing.gameKey === session.gameKey;
    const closeTime = Math.abs(new Date(existing.timestamp).getTime() - new Date(session.timestamp).getTime()) < 15_000;
    return (sameKey || closeTime) && existing.score === session.score;
  });
}

async function saveScore(reason = "auto") {
  const score = currentGame.maxScore ?? readCurrentScore();
  if (score === null || Number.isNaN(score)) return false;

  const now = new Date();
  const session = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now.toISOString(),
    date: localDate(now),
    score,
    reason,
    elapsedMs: currentGame.startedAt ? Date.now() - currentGame.startedAt : null,
    ...readSettings(),
  };

  const sessions = await getSessions();
  if (isDuplicate(sessions, session)) return false;

  sessions.push(session);
  sessions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  await setSessions(sessions);
  currentGame.saved = true;
  window.dispatchEvent(new CustomEvent("zetamac-tracker-saved", { detail: session }));
  return true;
}

async function inspectGame() {
  if (!location.hostname.includes("arithmetic.zetamac.com")) return;
  if (!location.pathname.includes("/game")) return;

  const score = readCurrentScore();
  const secondsLeft = readSecondsLeft();
  const answerBox = hasAnswerBox();
  const now = Date.now();

  if (score !== null) {
    currentGame.lastScore = score;
    currentGame.maxScore = Math.max(currentGame.maxScore || 0, score);
    currentGame.lastSeenAt = now;
  }

  if (secondsLeft !== null) currentGame.lastSecondsLeft = secondsLeft;

  if (answerBox && secondsLeft !== null && secondsLeft > 0) {
    currentGame.sawActiveAnswerBox = true;
    if (!currentGame.startedAt) currentGame.startedAt = now;
  }

  const ranLongEnough = currentGame.startedAt && now - currentGame.startedAt > 5_000;
  const endedByTimer = currentGame.sawActiveAnswerBox && secondsLeft === 0;
  const endedByNoInput = currentGame.sawActiveAnswerBox && !answerBox && ranLongEnough;
  const endedByFinalLinks = currentGame.sawActiveAnswerBox && /Try again/i.test(bodyText()) && /change settings/i.test(bodyText()) && !answerBox && ranLongEnough;

  if (!currentGame.saved && (endedByTimer || endedByNoInput || endedByFinalLinks)) {
    await saveScore("auto");
  }
}

const observer = new MutationObserver(() => inspectGame());
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
setInterval(inspectGame, 1000);
inspectGame();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "ZETAMAC_TRACKER_FORCE_SAVE") return false;

  saveScore("manual-from-popup").then(saved => {
    sendResponse({
      ok: true,
      saved,
      score: currentGame.maxScore ?? readCurrentScore(),
      onGamePage: location.hostname.includes("arithmetic.zetamac.com") && location.pathname.includes("/game"),
    });
  }).catch(error => {
    sendResponse({ ok: false, error: String(error) });
  });

  return true;
});
