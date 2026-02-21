/**
 * timer.js — Focus Battle Timer
 * ================================
 * Manages the 25-minute countdown and communicates results
 * to the Flask backend via the Fetch API.
 *
 * KEY CONCEPTS:
 *
 * setInterval(fn, ms) — runs fn every ms milliseconds.
 *   We store the return value (an id) so we can cancel it
 *   with clearInterval(id) when needed.
 *
 * Fetch API — the modern way to make HTTP requests from JS.
 *   fetch(url, options) returns a Promise (async operation).
 *   We use async/await to write it in a readable way.
 *
 * beforeunload event — fires just before the page closes/refreshes.
 *   We use this to detect early exits and report a loss.
 *   We use { keepalive: true } in the fetch call so the browser
 *   sends the request even as the page is unloading.
 *
 * STATE MACHINE:
 *   'idle'    → timer not started
 *   'running' → countdown active
 *   'done'    → session completed (win or loss)
 */

// ── Constants ──────────────────────────────────────────────────────
const TOTAL_SECONDS = 25 * 60;   // 25 minutes in seconds
const DANGER_THRESHOLD = 60;     // last 60 seconds = red / pulse mode

// ── State ───────────────────────────────────────────────────────────
let timerState    = 'idle';       // 'idle' | 'running' | 'done'
let secondsLeft   = TOTAL_SECONDS;
let intervalId    = null;         // setInterval handle
let sessionLocked = false;        // prevents double-reporting to backend

// ── DOM References ──────────────────────────────────────────────────
const display       = document.getElementById('timer-display');
const statusEl      = document.getElementById('timer-status');
const progressBar   = document.getElementById('timer-progress');
const hintEl        = document.getElementById('timer-hint');
const btnStart      = document.getElementById('btn-start');
const btnAbandon    = document.getElementById('btn-abandon');
const resultOverlay = document.getElementById('result-overlay');
const resultCard    = document.getElementById('result-card');


// ── Utility: Format seconds → "MM:SS" ──────────────────────────────
function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Utility: Update the progress bar width ─────────────────────────
function updateProgress() {
  const pct = (secondsLeft / TOTAL_SECONDS) * 100;
  progressBar.style.width = pct + '%';

  // Change progress bar color as time runs out
  if (secondsLeft <= DANGER_THRESHOLD) {
    progressBar.style.background = 'var(--accent-alt)';
  } else {
    progressBar.style.background = 'var(--accent)';
  }
}


// ── API Calls ───────────────────────────────────────────────────────

/**
 * Report a WIN to the backend.
 * Returns the updated stats object from the server.
 */
async function reportWin() {
  try {
    const res = await fetch('/api/session/win', { method: 'POST' });
    return await res.json();
  } catch (err) {
    console.error('Failed to report win:', err);
    return null;
  }
}

/**
 * Report a LOSS to the backend.
 * keepalive: true ensures the request completes even if called
 * from a beforeunload handler (page is closing).
 */
async function reportLoss(keepalive = false) {
  try {
    const res = await fetch('/api/session/loss', {
      method: 'POST',
      keepalive: keepalive   // critical for beforeunload
    });
    return await res.json();
  } catch (err) {
    console.error('Failed to report loss:', err);
    return null;
  }
}


// ── Result UI ───────────────────────────────────────────────────────

function showResult(type, stats) {
  /**
   * type: 'win' | 'loss'
   * stats: { wins, losses, streak } from server
   */
  const iconEl    = document.getElementById('result-icon');
  const titleEl   = document.getElementById('result-title');
  const msgEl     = document.getElementById('result-message');
  const rWins     = document.getElementById('r-wins');
  const rLosses   = document.getElementById('r-losses');
  const rStreak   = document.getElementById('r-streak');

  if (type === 'win') {
    iconEl.textContent  = '🏆';
    titleEl.textContent = 'Victory!';
    msgEl.textContent   = 'You stayed locked in. Respect.';
    resultCard.style.borderColor = 'var(--accent)';
  } else {
    iconEl.textContent  = '💀';
    titleEl.textContent = 'Defeated.';
    msgEl.textContent   = 'You left early. Streak reset. Try again.';
    resultCard.style.borderColor = 'var(--accent-alt)';
  }

  // Update stat displays (use server data if available, else refresh page values)
  if (stats) {
    rWins.textContent   = stats.wins;
    rLosses.textContent = stats.losses;
    rStreak.textContent = stats.streak;

    // Also update the dashboard stat chips
    document.getElementById('stat-wins').textContent   = stats.wins;
    document.getElementById('stat-losses').textContent = stats.losses;
    document.getElementById('stat-streak').textContent = stats.streak + '🔥';
  }

  resultOverlay.classList.remove('hidden');
}

// "Battle Again" button — reset everything
document.getElementById('btn-again')?.addEventListener('click', () => {
  resultOverlay.classList.add('hidden');
  resetTimer();
});


// ── Timer Core ──────────────────────────────────────────────────────

function tick() {
  /**
   * Called every second by setInterval.
   * Decrements the counter, updates the UI, checks for completion.
   */
  secondsLeft--;
  display.textContent = formatTime(secondsLeft);
  updateProgress();

  // Danger mode: last 60 seconds
  if (secondsLeft <= DANGER_THRESHOLD) {
    display.classList.add('danger');
    display.classList.remove('running');
    statusEl.textContent = '⚠ HOLD THE LINE';
  }

  // Timer complete — victory!
  if (secondsLeft <= 0) {
    clearInterval(intervalId);
    sessionLocked = true;  // prevent beforeunload from firing a loss
    timerState = 'done';
    display.textContent = '00:00';
    statusEl.textContent = 'SESSION COMPLETE';

    // Remove beforeunload listener (session is over, no need to penalize)
    window.removeEventListener('beforeunload', handleBeforeUnload);

    // Report win to backend, then show result UI
    reportWin().then(stats => showResult('win', stats));
  }
}

function startTimer() {
  if (timerState === 'running') return;

  timerState    = 'running';
  sessionLocked = false;

  // Update UI
  display.classList.add('running');
  display.classList.remove('danger');
  statusEl.textContent = 'BATTLE IN PROGRESS';
  hintEl.textContent   = 'Stay focused. Don\'t you dare leave.';
  btnStart.classList.add('hidden');
  btnAbandon.classList.remove('hidden');
  btnStart.disabled = true;

  // Start the countdown — tick() runs every 1000ms (1 second)
  intervalId = setInterval(tick, 1000);

  // Attach the early-exit penalty listener
  window.addEventListener('beforeunload', handleBeforeUnload);
}

function resetTimer() {
  clearInterval(intervalId);
  secondsLeft = TOTAL_SECONDS;
  timerState  = 'idle';
  sessionLocked = false;

  display.textContent = formatTime(TOTAL_SECONDS);
  display.classList.remove('running', 'danger');
  progressBar.style.width = '100%';
  progressBar.style.background = 'var(--accent)';
  statusEl.textContent = 'READY TO BATTLE';
  hintEl.innerHTML = 'Lock in for 25 minutes. Leave early and you <strong>lose</strong>.';
  btnStart.classList.remove('hidden');
  btnStart.disabled = false;
  btnAbandon.classList.add('hidden');

  window.removeEventListener('beforeunload', handleBeforeUnload);
}

async function abandonSession() {
  /**
   * User explicitly clicks "Abandon".
   * We stop the timer, record a loss, show the result.
   */
  if (timerState !== 'running') return;

  clearInterval(intervalId);
  sessionLocked = true;
  timerState    = 'done';
  window.removeEventListener('beforeunload', handleBeforeUnload);

  statusEl.textContent = 'ABANDONED';

  const stats = await reportLoss(false);
  showResult('loss', stats);
}


// ── Early Exit Detection ────────────────────────────────────────────

function handleBeforeUnload(e) {
  /**
   * Fires when user tries to refresh, close tab, or navigate away.
   *
   * We send a loss report with keepalive: true.
   * This is a "fire and forget" — we don't await the result
   * because the page is closing and there's no UI to update.
   *
   * The browser shows a "Leave site?" dialog because we call
   * e.preventDefault() (this is standard browser behavior).
   */
  if (sessionLocked || timerState !== 'running') return;

  // Send loss in background — keepalive ensures it completes
  fetch('/api/session/loss', { method: 'POST', keepalive: true });

  // This triggers the browser's native "Leave site?" confirmation
  e.preventDefault();
  e.returnValue = '';   // required for Chrome
}


// ── Event Listeners ─────────────────────────────────────────────────

btnStart?.addEventListener('click',   startTimer);
btnAbandon?.addEventListener('click', abandonSession);


// ── Initialize ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  display.textContent = formatTime(TOTAL_SECONDS);
  updateProgress();
});
