// saveGame.js — localStorage persistence for progress, settings and Continue.
// One job: read and write the one save object. A corrupt or old save never
// crashes the game: it quietly becomes a fresh save (the empty state).

const SAVE_KEY = "thermal-glide-save-v1";

export function defaultSave() {
  return {
    version: 1,
    unlocked: 1, // missions unlocked, 1-based count into MISSIONS order
    stars: {}, // missionId -> 0..3
    bestScore: {}, // missionId -> number
    bestTime: {}, // missionId -> seconds
    totalFlightSeconds: 0,
    settings: { sensitivity: 1, volume: 0.7, invertY: false, quality: "high" },
    continueSortie: null, // { missionId, missionName, glider, ringIndex, score, seconds, parts, dropped, dayPhase }
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return defaultSave();
    const fresh = defaultSave();
    return {
      ...fresh,
      ...parsed,
      settings: { ...fresh.settings, ...(parsed.settings || {}) },
      stars: parsed.stars || {},
      bestScore: parsed.bestScore || {},
      bestTime: parsed.bestTime || {},
    };
  } catch {
    return defaultSave();
  }
}

export function storeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage full or blocked: the game continues without persistence.
  }
}

export function recordResult(save, mission, result) {
  const id = mission.id;
  save.bestScore[id] = Math.max(save.bestScore[id] || 0, result.score);
  if (result.finished) {
    save.stars[id] = Math.max(save.stars[id] || 0, result.stars);
    if (!save.bestTime[id] || result.seconds < save.bestTime[id]) {
      save.bestTime[id] = Math.round(result.seconds);
    }
  }
  save.totalFlightSeconds = Math.round(save.totalFlightSeconds + result.seconds);
  save.continueSortie = null;
  storeSave(save);
  return save;
}
