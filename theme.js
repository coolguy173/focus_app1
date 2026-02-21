/**
 * theme.js — Theme System
 * ========================
 * Handles switching between visual themes.
 *
 * HOW IT WORKS:
 * 1. We add a CSS class to <body> (e.g. 'theme-f1')
 * 2. Each theme class in CSS sets a different background-image
 *    and --accent CSS variable
 * 3. We save the chosen theme to localStorage so it persists
 *    across page reloads and navigations
 *
 * HOW LOCALSTORAGE WORKS:
 *   localStorage.setItem('key', 'value') — save a string
 *   localStorage.getItem('key')          — read it back
 *   It survives page refreshes; cleared only by the user or code.
 */

const THEME_KEY = 'focus-battle-theme';
const DEFAULT_THEME = 'theme-lofi';

// All valid theme class names (must match CSS and HTML data-theme attributes)
const VALID_THEMES = [
  'theme-lofi',
  'theme-porsche',
  'theme-f1',
  'theme-nyc',
  'theme-liquid'
];

/**
 * Apply a theme by:
 * 1. Removing all existing theme classes from <body>
 * 2. Adding the new theme class
 * 3. Saving the choice to localStorage
 * 4. Updating the active state of theme pill buttons
 */
function applyTheme(themeName) {
  if (!VALID_THEMES.includes(themeName)) {
    themeName = DEFAULT_THEME;
  }

  const body = document.getElementById('app-body');
  if (!body) return;

  // Remove all theme classes first
  VALID_THEMES.forEach(t => body.classList.remove(t));

  // Add the selected theme
  body.classList.add(themeName);

  // Save to localStorage for persistence
  localStorage.setItem(THEME_KEY, themeName);

  // Update button active states
  document.querySelectorAll('.theme-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === themeName);
  });
}

/**
 * Load saved theme from localStorage, or use default.
 * Called immediately when the script loads (bottom of every page).
 */
function loadSavedTheme() {
  const saved = localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
  applyTheme(saved);
}

/**
 * Attach click listeners to all theme pill buttons.
 * We use event delegation: listen on the container, check the target.
 */
function initThemePills() {
  document.querySelectorAll('.theme-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
    });
  });
}

// ── Run on page load ──
loadSavedTheme();
document.addEventListener('DOMContentLoaded', initThemePills);
