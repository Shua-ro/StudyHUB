// pomodoro timer

(function() {
  'use strict';

  // state & configuration
  const STORAGE_KEY = 'studyhub-pomodoro-v1';
  const DEFAULT_DURATIONS = {
    focus: 25 * 60,    // 25 min
    short: 5 * 60,     // 5 min
    long: 15 * 60      // 15 min
  };

  let state = {
    mode: 'focus',           // 'focus' | 'short' | 'long'
    timeRemaining: DEFAULT_DURATIONS.focus,
    isRunning: false,
    cycle: 1,                // 1-4, after 4 focus sessions -> long break
    sessionsToday: 0,
    minutesToday: 0,
    lastDate: null,          // YYYY-MM-DD for daily reset
    durations: { ...DEFAULT_DURATIONS },
    intention: '',
    timerId: null,
    startTime: null,         // when it started, for accurate timing
    pausedTimeRemaining: null // time remaining when paused
  };

  // dom elements
  const elements = {
    clock: null,
    timeDisplay: null,
    phaseLabel: null,
    timerStatus: null,
    startBtn: null,
    resetBtn: null,
    skipBtn: null,
    modeButtons: null,
    settingsToggle: null,
    settingsForm: null,
    focusDurationInput: null,
    shortDurationInput: null,
    longDurationInput: null,
    defaultsBtn: null,
    intentionInput: null,
    sessionsDisplay: null,
    minutesDisplay: null,
    cycleDisplay: null,
    messageDisplay: null
  };

  function cacheElements() {
    elements.clock = document.getElementById('pomo-clock');
    elements.timeDisplay = document.getElementById('pomo-time');
    elements.phaseLabel = document.getElementById('pomo-phase-label');
    elements.timerStatus = document.getElementById('pomo-timer-status');
    elements.startBtn = document.getElementById('pomo-start');
    elements.resetBtn = document.getElementById('pomo-reset');
    elements.skipBtn = document.getElementById('pomo-skip');
    elements.modeButtons = document.querySelectorAll('[data-pomo-mode]');
    elements.settingsToggle = document.getElementById('pomo-settings-toggle');
    elements.settingsForm = document.getElementById('pomo-settings-form');
    elements.focusDurationInput = document.getElementById('pomo-focus-duration');
    elements.shortDurationInput = document.getElementById('pomo-short-duration');
    elements.longDurationInput = document.getElementById('pomo-long-duration');
    elements.defaultsBtn = document.getElementById('pomo-defaults');
    elements.intentionInput = document.getElementById('pomo-intention');
    elements.sessionsDisplay = document.getElementById('pomo-sessions');
    elements.minutesDisplay = document.getElementById('pomo-minutes');
    elements.cycleDisplay = document.getElementById('pomo-cycle');
    elements.messageDisplay = document.getElementById('pomo-message');
  }

  // persistence
  function loadState() {
    // server prefs first (STUDYHUB_POMODORO from index.php)
    if (window.STUDYHUB_POMODORO && typeof window.STUDYHUB_POMODORO === 'object') {
      const serverPrefs = window.STUDYHUB_POMODORO;
      state.durations = {
        focus: serverPrefs.focusDuration || DEFAULT_DURATIONS.focus,
        short: serverPrefs.shortDuration || DEFAULT_DURATIONS.short,
        long: serverPrefs.longDuration || DEFAULT_DURATIONS.long,
      };
      // reset to the new durations if it's not running
      if (!state.isRunning) {
        state.timeRemaining = getCurrentDuration();
      }
    }

    // then localStorage, which wins for session stuff
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // merge w/ defaults so new fields still exist
        state = { ...state, ...parsed };
        // make sure durations exists
        state.durations = { ...state.durations, ...(parsed.durations || {}) };
        // don't restore a running timer
        state.isRunning = false;
        state.timerId = null;
        state.startTime = null;
        state.pausedTimeRemaining = null;
      }
    } catch (e) {
      console.warn('[Pomodoro] Failed to load state:', e);
    }
    // new day = reset
    checkDailyReset();
  }

  function saveState() {
    try {
      const toSave = {
        mode: state.mode,
        timeRemaining: state.timeRemaining,
        cycle: state.cycle,
        sessionsToday: state.sessionsToday,
        minutesToday: state.minutesToday,
        lastDate: state.lastDate,
        durations: state.durations,
        intention: state.intention
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn('[Pomodoro] Failed to save state:', e);
    }
  }

  function checkDailyReset() {
    const today = new Date().toISOString().split('T')[0];
    if (state.lastDate !== today) {
      state.lastDate = today;
      state.sessionsToday = 0;
      state.minutesToday = 0;
      state.cycle = 1;
      saveState();
    }
  }

  // timer logic
  function getCurrentDuration() {
    return state.durations[state.mode] || DEFAULT_DURATIONS[state.mode];
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function getModeLabel() {
    const labels = {
      focus: 'FOCUS SESSION',
      short: 'SHORT BREAK',
      long: 'LONG BREAK'
    };
    return labels[state.mode] || 'FOCUS SESSION';
  }

  function getStatusText() {
    if (state.isRunning) {
      return state.mode === 'focus' ? 'Focus time…' : 'Break time…';
    }
    if (state.timeRemaining < getCurrentDuration()) {
      return 'Paused';
    }
    return 'Ready when you are';
  }

  function updateDisplay() {
    if (!elements.timeDisplay || !elements.phaseLabel || !elements.timerStatus) return;

    elements.timeDisplay.textContent = formatTime(state.timeRemaining);
    elements.phaseLabel.textContent = getModeLabel();
    elements.timerStatus.textContent = getStatusText();

    // progress ring
    if (elements.clock) {
      const total = getCurrentDuration();
      const progress = total > 0 ? ((total - state.timeRemaining) / total) * 100 : 0;
      elements.clock.style.setProperty('--pomo-progress', `${progress}%`);
    }

    if (elements.startBtn) {
      elements.startBtn.textContent = state.isRunning ? 'Pause' : 'Start focusing';
      elements.startBtn.classList.toggle('pomo-running', state.isRunning);
    }

    elements.modeButtons?.forEach(btn => {
      const isActive = btn.dataset.pomoMode === state.mode;
      btn.setAttribute('aria-pressed', isActive);
      btn.classList.toggle('active', isActive);
    });

    if (elements.sessionsDisplay) elements.sessionsDisplay.textContent = state.sessionsToday;
    if (elements.minutesDisplay) elements.minutesDisplay.textContent = state.minutesToday;
    if (elements.cycleDisplay) elements.cycleDisplay.textContent = `${state.cycle} / 4`;

    // dashboard "study today"
    const dashStudy = document.getElementById('dash-study-summary');
    if (dashStudy) {
      const minutes = state.minutesToday;
      const sessions = state.sessionsToday;
      dashStudy.textContent =
        `${minutes} minute${minutes === 1 ? '' : 's'} · ` +
        `${sessions} focus session${sessions === 1 ? '' : 's'}`;
    }

    if (elements.intentionInput) {
      elements.intentionInput.value = state.intention;
    }

    if (elements.focusDurationInput) elements.focusDurationInput.value = Math.round(state.durations.focus / 60);
    if (elements.shortDurationInput) elements.shortDurationInput.value = Math.round(state.durations.short / 60);
    if (elements.longDurationInput) elements.longDurationInput.value = Math.round(state.durations.long / 60);
  }

  function startTimer() {
    if (state.isRunning) return;

    state.isRunning = true;
    state.startTime = Date.now();
    // use the paused time if there is one
    if (state.pausedTimeRemaining !== null) {
      state.timeRemaining = state.pausedTimeRemaining;
      state.pausedTimeRemaining = null;
    }

    state.timerId = setInterval(tick, 1000);
    updateDisplay();
    playSound('start');
  }

  function pauseTimer() {
    if (!state.isRunning) return;

    state.isRunning = false;
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    state.pausedTimeRemaining = Math.max(0, state.timeRemaining - elapsed);
    state.startTime = null;
    updateDisplay();
    playSound('pause');
  }

  function toggleTimer() {
    if (state.isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  }

  function tick() {
    if (!state.isRunning) return;

    // work it out from the start time, decrementing drifts
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const initialDuration = getCurrentDuration();
    state.timeRemaining = Math.max(0, initialDuration - elapsed);

    updateDisplay();

    if (state.timeRemaining <= 0) {
      completeSession();
    }
  }

  function completeSession() {
    pauseTimer();
    playSound('complete');

    if (state.mode === 'focus') {
      // finished focus
      state.sessionsToday++;
      state.minutesToday += Math.round(state.durations.focus / 60);

      // long break every 4 focus sessions
      if (state.cycle >= 4) {
        state.mode = 'long';
        state.cycle = 1;
        showMessage('Great work! Time for a long break.');
      } else {
        state.mode = 'short';
        state.cycle++;
        showMessage('Focus session complete! Take a short break.');
      }
    } else {
      // finished a break, back to focus
      state.mode = 'focus';
      if (state.mode === 'focus' && state.cycle === 1) {
        showMessage('Break over. Ready to focus again?');
      }
    }

    state.timeRemaining = getCurrentDuration();
    state.pausedTimeRemaining = null;
    saveState();
    updateDisplay();
  }

  function resetTimer() {
    pauseTimer();
    state.timeRemaining = getCurrentDuration();
    state.pausedTimeRemaining = null;
    state.mode = 'focus';
    state.cycle = 1;
    saveState();
    updateDisplay();
    showMessage('Timer reset. Ready to focus?');
  }

  function skipTimer() {
    pauseTimer();

    if (state.mode === 'focus') {
      // skipping focus -> break
      if (state.cycle >= 4) {
        state.mode = 'long';
        state.cycle = 1;
        showMessage('Focus session skipped. Long break time.');
      } else {
        state.mode = 'short';
        state.cycle++;
        showMessage('Focus session skipped. Short break time.');
      }
    } else {
      // skipping break -> focus
      state.mode = 'focus';
      showMessage('Break skipped. Back to focus!');
    }

    state.timeRemaining = getCurrentDuration();
    state.pausedTimeRemaining = null;
    saveState();
    updateDisplay();
  }

  function setMode(mode) {
    if (state.isRunning) return; // no switching mid-timer
    if (mode === state.mode) return;

    state.mode = mode;
    state.timeRemaining = getCurrentDuration();
    state.pausedTimeRemaining = null;
    saveState();
    updateDisplay();
  }

  // settings
  function toggleSettings() {
    const isExpanded = elements.settingsToggle.getAttribute('aria-expanded') === 'true';
    elements.settingsToggle.setAttribute('aria-expanded', !isExpanded);
    elements.settingsForm.hidden = isExpanded;
  }

  function saveDurations(event) {
    event.preventDefault();

    const focus = Math.max(1, Math.min(180, parseInt(elements.focusDurationInput.value, 10) || 25)) * 60;
    const short = Math.max(1, Math.min(180, parseInt(elements.shortDurationInput.value, 10) || 5)) * 60;
    const long = Math.max(1, Math.min(180, parseInt(elements.longDurationInput.value, 10) || 15)) * 60;

    state.durations = { focus, short, long };

    // not running? update it now
    if (!state.isRunning) {
      state.timeRemaining = getCurrentDuration();
    }

    saveState();
    saveToServer();
    updateDisplay();
    toggleSettings();
    showMessage('Timer durations saved.');
  }

  async function saveToServer() {
    try {
      const response = await fetch('api/pomodoro.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'update',
          preferences: {
            focusDuration: state.durations.focus,
            shortDuration: state.durations.short,
            longDuration: state.durations.long,
          }
        })
      });
      const data = await response.json();
      if (!data.ok) {
        console.warn('[Pomodoro] Server save failed:', data.message);
      }
    } catch (e) {
      console.warn('[Pomodoro] Failed to save to server:', e);
    }
  }

  function restoreDefaults() {
    state.durations = { ...DEFAULT_DURATIONS };
    if (!state.isRunning) {
      state.timeRemaining = getCurrentDuration();
    }
    saveState();
    saveToServer();
    updateDisplay();
    showMessage('Default durations restored.');
  }

  // intention
  function saveIntention() {
    state.intention = elements.intentionInput.value.trim().slice(0, 100);
    saveState();
  }

  // audio feedback
  const audioContext = typeof AudioContext !== 'undefined' ? new AudioContext() : null;
  const oscillatorCache = {};

  function playSound(type) {
    if (!audioContext) return;

    try {
      const ctx = audioContext;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;

      switch (type) {
        case 'start': {
          // rising tone
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(660, now + 0.3);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.5);
          break;
        }
        case 'pause': {
          // falling tone
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523, now);
          osc.frequency.exponentialRampToValueAtTime(392, now + 0.2);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.4);
          break;
        }
        case 'complete': {
          // little 3 note chime
          const notes = [523, 659, 784]; // C5, E5, G5
          notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = now + i * 0.15;
            gain.gain.setValueAtTime(0.1, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.6);
          });
          break;
        }
      }
    } catch (e) {
      // no audio, oh well
    }
  }

  // messages
  function showMessage(text) {
    if (elements.messageDisplay) {
      elements.messageDisplay.textContent = text;
    }
  }

  // keyboard shortcuts
  function handleKeydown(event) {
    // only when the pomodoro panel is showing and you're not typing
    const activeElement = document.activeElement;
    const isTyping = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.isContentEditable
    );

    // space = start/pause
    if (event.code === 'Space' && !isTyping) {
      const focusSection = document.getElementById('focus');
      if (focusSection && !focusSection.hidden) {
        event.preventDefault();
        toggleTimer();
      }
    }

    // r = reset
    if (event.code === 'KeyR' && !isTyping && !event.ctrlKey && !event.metaKey) {
      const focusSection = document.getElementById('focus');
      if (focusSection && !focusSection.hidden) {
        event.preventDefault();
        resetTimer();
      }
    }

    // s = skip
    if (event.code === 'KeyS' && !isTyping && !event.ctrlKey && !event.metaKey) {
      const focusSection = document.getElementById('focus');
      if (focusSection && !focusSection.hidden) {
        event.preventDefault();
        skipTimer();
      }
    }

    // 1/2/3 = switch mode (only when stopped)
    if (!state.isRunning && !isTyping && !event.ctrlKey && !event.metaKey) {
      const focusSection = document.getElementById('focus');
      if (focusSection && !focusSection.hidden) {
        if (event.code === 'Digit1') {
          event.preventDefault();
          setMode('focus');
        } else if (event.code === 'Digit2') {
          event.preventDefault();
          setMode('short');
        } else if (event.code === 'Digit3') {
          event.preventDefault();
          setMode('long');
        }
      }
    }
  }

  // event binding
  function bindEvents() {
    elements.startBtn?.addEventListener('click', toggleTimer);
    elements.resetBtn?.addEventListener('click', resetTimer);
    elements.skipBtn?.addEventListener('click', skipTimer);

    elements.modeButtons?.forEach(btn => {
      btn.addEventListener('click', () => {
        setMode(btn.dataset.pomoMode);
      });
    });

    elements.settingsToggle?.addEventListener('click', toggleSettings);
    elements.settingsForm?.addEventListener('submit', saveDurations);
    elements.defaultsBtn?.addEventListener('click', restoreDefaults);

    elements.intentionInput?.addEventListener('blur', saveIntention);
    elements.intentionInput?.addEventListener('change', saveIntention);

    document.addEventListener('keydown', handleKeydown);

    // pause when the tab's hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.isRunning) {
        pauseTimer();
        showMessage('Timer paused (tab hidden). Click to resume.');
      }
    });
  }

  // initialization
  function init() {
    cacheElements();

    if (!elements.clock) {
      console.log('[Pomodoro] Panel not found in DOM, skipping initialization');
      return;
    }

    loadState();
    bindEvents();
    updateDisplay();

    console.log('[Pomodoro] Initialized successfully');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // for poking at it in the console
  window.StudyHubPomodoro = {
    getState: () => ({ ...state }),
    start: startTimer,
    pause: pauseTimer,
    reset: resetTimer,
    skip: skipTimer,
    setMode,
    setDurations: (durations) => {
      state.durations = { ...state.durations, ...durations };
      saveState();
      updateDisplay();
    }
  };
})();