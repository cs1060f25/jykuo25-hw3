// Study Scheduler - Vanilla JS SPA stored in localStorage
// Core features: Dashboard (goals summary, upcoming, social feed), Schedule visualizer, Goals CRUD

(function () {
  const LS_KEY = 'studySchedulerState_v1';
  const now = new Date();

  // ---- Utilities ----
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const toISODate = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (d) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const startOfWeek = (d) => {
    const t = new Date(d);
    const day = t.getDay(); // 0 Sun
    const diff = (day === 0 ? -6 : 1) - day; // Monday as start
    t.setDate(t.getDate() + diff);
    t.setHours(0, 0, 0, 0);
    return t;
  };
  const addDays = (d, n) => { const t = new Date(d); t.setDate(t.getDate() + n); return t; };
  const setTimeHM = (d, h, m) => { const t = new Date(d); t.setHours(h, m, 0, 0); return t; };
  const overlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;
  const minutesBetween = (a, b) => Math.round((b - a) / 60000);

  // Preferred time windows
  const TIME_WINDOWS = {
    morning: [6, 12], // 06:00 - 12:00
    afternoon: [12, 18],
    evening: [18, 22],
  };

  // ---- State ----
  const defaultState = () => ({
    currentUser: { id: 'me', name: 'You' },
    friends: [
      { id: 'f1', name: 'Alex' },
      { id: 'f2', name: 'Sam' },
      { id: 'f3', name: 'Riley' },
    ],
    goals: [
      // { id, title, hoursPerWeek, slotMinutes, windows: [{ day: 0..6, time: 'morning'|'afternoon'|'evening' }] }
    ],
    busy: [
      // { id, title, startISO, endISO }
    ],
    sessions: [
      // generated study sessions: { id, goalId, startISO, endISO, status: 'planned'|'checked_in'|'completed' }
    ],
    posts: [
      // { id, authorId, authorName, content, createdISO, likes: number, comments: [{id, authorName, text, createdISO}] }
      { id: uid(), authorId: 'f1', authorName: 'Alex', content: 'Wrapped up 2h of algorithms today! 🎉', createdISO: new Date(Date.now() - 86400000).toISOString(), likes: 3, comments: [{ id: uid(), authorName: 'Sam', text: 'Nice work!', createdISO: new Date(Date.now() - 80000000).toISOString() }] },
      { id: uid(), authorId: 'f2', authorName: 'Sam', content: 'Daily streak: 4🔥', createdISO: new Date(Date.now() - 3600000 * 6).toISOString(), likes: 1, comments: [] },
    ],
    // streak will be computed from sessions history
  });

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    const s = defaultState();
    saveState(s);
    return s;
  }

  // ---- Goals Page (goals.html) ----
  const goalsActiveUl = document.getElementById('goals-active');
  const goalsCompletedUl = document.getElementById('goals-completed');
  const goalsSortSel = document.getElementById('goals-sort');
  const openGoalModalBtn = document.getElementById('open-goal-modal');
  const goalModalBackdrop = document.getElementById('goal-modal');
  const closeGoalModalBtn = document.getElementById('close-goal-modal');

  function openGoalModal() {
    if (!goalModalBackdrop) return;
    clearGoalForm();
    goalModalBackdrop.style.display = 'grid';
    // Re-bind Add button defensively in case initial bind didn't occur
    const addBtn = document.getElementById('add-window');
    if (addBtn) addBtn.onclick = addWindowFromSelectors;
  }
  function closeGoalModal() {
    if (!goalModalBackdrop) return;
    goalModalBackdrop.style.display = 'none';
  }

  if (openGoalModalBtn) openGoalModalBtn.addEventListener('click', openGoalModal);
  if (closeGoalModalBtn) closeGoalModalBtn.addEventListener('click', closeGoalModal);

  if (goalsSortSel) goalsSortSel.addEventListener('change', renderGoalsPage);

  function renderGoalsPage() {
    if (!goalsActiveUl || !goalsCompletedUl) return;
    const sortMode = goalsSortSel ? goalsSortSel.value : 'created';
    const tpl = document.getElementById('goal-row-template') || document.getElementById('goal-item-template');
    const { start, end } = getWeekBounds(currentWeekStart);

    const goals = [...state.goals];
    const sorter = {
      created: (a,b) => new Date(a.createdISO||0) - new Date(b.createdISO||0),
      due: (a,b) => new Date(a.dueISO||'9999-12-31') - new Date(b.dueISO||'9999-12-31'),
      class: (a,b) => (a.className||'').localeCompare(b.className||'')
    }[sortMode] || ((a,b)=>0);
    goals.sort(sorter);

    goalsActiveUl.innerHTML = '';
    goalsCompletedUl.innerHTML = '';

    goals.forEach((g) => {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.querySelector('.goal-title').textContent = g.title;
      const completedMin = sumCompletedMinutesForGoalInRange(g.id, start, end);
      const targetMin = g.hoursPerWeek * 60;
      const pct = g.completed ? 100 : (targetMin ? clamp(Math.round((completedMin/targetMin)*100),0,100) : 0);
      li.querySelector('.progress-bar').style.width = pct + '%';
      li.classList.toggle('completed', !!g.completed);
      const sub = g.completed ? 'Completed' : `${(completedMin/60).toFixed(1)}h / ${g.hoursPerWeek}h this week`;
      const subEl = li.querySelector('.goal-sub'); if (subEl) subEl.textContent = sub;
      const classEl = li.querySelector('.goal-class'); if (classEl) { classEl.textContent = g.className; classEl.style.display = g.className ? '' : 'none'; }
      const dueEl = li.querySelector('.goal-due'); if (dueEl) { dueEl.textContent = g.dueISO ? `Due ${new Date(g.dueISO).toLocaleDateString()}` : ''; dueEl.style.display = g.dueISO ? '' : 'none'; }

      // Wire buttons
      const completeBtn = li.querySelector('.complete');
      if (completeBtn) {
        completeBtn.textContent = g.completed ? 'Reopen' : 'Complete';
        completeBtn.addEventListener('click', () => {
          g.completed = !g.completed;
          if (g.completed) state.sessions = state.sessions.filter((s)=>!(s.goalId===g.id && s.status==='planned'));
          else regenerateSessionsForWeeksAround(currentWeekStart);
          saveState();
          renderGoalsPage();
          renderSchedule();
          renderDashboard();
        });
      }
      const editBtn = li.querySelector('.edit'); if (editBtn) editBtn.addEventListener('click', () => {
        // Populate modal form and open it
        if (!goalModalBackdrop) { window.location.href = 'index.html#goals'; return; }
        if (goalIdEl) goalIdEl.value = g.id;
        if (goalTitleEl) goalTitleEl.value = g.title;
        if (goalHoursEl) goalHoursEl.value = g.hoursPerWeek;
        if (goalSlotEl) goalSlotEl.value = g.slotMinutes;
        renderWindowsBadges(ensureGoalWindows(g).windows);
        if (goalClassEl) goalClassEl.value = g.className || '';
        if (goalDueEl) goalDueEl.value = g.dueISO ? new Date(g.dueISO).toISOString().slice(0,10) : '';
        goalModalBackdrop.style.display = 'grid';
      });
      const delBtn = li.querySelector('.remove'); if (delBtn) delBtn.addEventListener('click', () => {
        if (!confirm('Delete this goal?')) return;
        state.goals = state.goals.filter((x)=>x.id!==g.id);
        state.sessions = state.sessions.filter((s)=>s.goalId!==g.id);
        saveState();
        renderGoalsPage();
        renderSchedule();
        renderDashboard();
      });

      (g.completed ? goalsCompletedUl : goalsActiveUl).appendChild(li);
    });
  }
  function saveState(s = state) {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }

  // ---- Tabs ----
  const tabs = document.querySelectorAll('.tab-button[data-tab]');
  const views = document.querySelectorAll('.tab-view');
  if (tabs.length) {
    tabs.forEach((btn) => btn.addEventListener('click', (e) => {
      const id = btn.dataset.tab;
      if (!id) return;
      e.preventDefault();
      switchTab(id);
    }));
  }
  function switchTab(id) {
    if (!id) return;
    tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    views.forEach((v) => v.classList.toggle('active', v.id === id));
    if (id === 'schedule' && document.getElementById('week-grid')) renderSchedule();
    if (id === 'dashboard' && document.getElementById('goals-summary')) renderDashboard();
    if (id === 'goals' && document.getElementById('goals-list')) renderGoals();
  }

  // ---- Goals CRUD ----
  const goalForm = document.getElementById('goal-form');
  const goalIdEl = document.getElementById('goal-id');
  const goalTitleEl = document.getElementById('goal-title');
  const goalHoursEl = document.getElementById('goal-hours');
  const goalSlotEl = document.getElementById('goal-slot');
  const goalWindowsEl = document.getElementById('goal-windows');
  const goalClassEl = document.getElementById('goal-class');
  const goalDueEl = document.getElementById('goal-due');
  // Elements used inside modal/forms; will also be queried lazily when needed
  const winDayEl = document.getElementById('win-day');
  const winTimeEl = document.getElementById('win-time');
  const addWindowBtn = document.getElementById('add-window');
  const windowsBadges = document.getElementById('windows-badges');
  const resetGoalBtn = document.getElementById('reset-goal');
  const goalsList = document.getElementById('goals-list');

  if (goalForm) goalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = goalIdEl.value || uid();
    const title = goalTitleEl.value.trim();
    const hoursPerWeek = clamp(parseFloat(goalHoursEl.value) || 1, 1, 168);
    const slotMinutes = clamp(parseInt(goalSlotEl.value) || 30, 15, 240);
    const windows = readWindowsFromForm();
    if (!windows.length) {
      alert('Please add at least one preferred day/time window.');
      return;
    }
    const className = goalClassEl ? goalClassEl.value.trim() : '';
    const dueISO = goalDueEl && goalDueEl.value ? new Date(goalDueEl.value + 'T00:00:00').toISOString() : '';

    const existing = state.goals.find((g) => g.id === id);
    if (existing) {
      Object.assign(existing, { title, hoursPerWeek, slotMinutes, windows, className, dueISO });
    } else {
      state.goals.push({ id, title, hoursPerWeek, slotMinutes, windows, className, dueISO, createdISO: new Date().toISOString() });
    }
    saveState();
    clearGoalForm();
    regenerateSessionsForWeeksAround(currentWeekStart);
    renderGoals();
    renderSchedule();
    renderDashboard();
    renderGoalsPage();
    // Close modal if on goals page
    if (goalModalBackdrop) closeGoalModal();
  });

  if (resetGoalBtn) resetGoalBtn.addEventListener('click', () => clearGoalForm());
  function clearGoalForm() {
    goalIdEl.value = '';
    goalTitleEl.value = '';
    goalHoursEl.value = 5;
    goalSlotEl.value = 60;
    // default: no windows selected
    renderWindowsBadges([]);
    if (goalClassEl) goalClassEl.value = '';
    if (goalDueEl) goalDueEl.value = '';
  }

  function renderGoals() {
    goalsList.innerHTML = '';
    const tpl = document.getElementById('goal-item-template');
    const weekBounds = getWeekBounds(currentWeekStart);

    state.goals.forEach((g) => {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.querySelector('.goal-title').textContent = g.title;
      const completedMin = sumCompletedMinutesForGoalInRange(g.id, weekBounds.start, weekBounds.end);
      const targetMin = g.hoursPerWeek * 60;
      const pct = g.completed ? 100 : (targetMin ? clamp(Math.round((completedMin / targetMin) * 100), 0, 100) : 0);
      li.querySelector('.goal-sub').textContent = g.completed ? 'Completed' : `${(completedMin/60).toFixed(1)}h / ${g.hoursPerWeek}h this week`;
      li.querySelector('.progress-bar').style.width = pct + '%';
      li.classList.toggle('completed', !!g.completed);

      const completeBtn = li.querySelector('.complete');
      completeBtn.textContent = g.completed ? 'Reopen' : 'Complete';
      completeBtn.addEventListener('click', () => {
        g.completed = !g.completed;
        if (g.completed) {
          // remove planned sessions for this goal
          state.sessions = state.sessions.filter((s) => !(s.goalId === g.id && s.status === 'planned'));
        } else {
          // regenerate to plan sessions again
          regenerateSessionsForWeeksAround(currentWeekStart);
        }
        saveState();
        renderGoals();
        renderSchedule();
        renderDashboard();
      });

      li.querySelector('.edit').addEventListener('click', () => {
        goalIdEl.value = g.id;
        goalTitleEl.value = g.title;
        goalHoursEl.value = g.hoursPerWeek;
        goalSlotEl.value = g.slotMinutes;
        // populate windows as badges
        renderWindowsBadges(ensureGoalWindows(g).windows);
        if (goalClassEl) goalClassEl.value = g.className || '';
        if (goalDueEl) goalDueEl.value = g.dueISO ? new Date(g.dueISO).toISOString().slice(0,10) : '';
        switchTab('goals');
      });
      li.querySelector('.remove').addEventListener('click', () => {
        if (!confirm('Delete this goal?')) return;
        state.goals = state.goals.filter((x) => x.id !== g.id);
        state.sessions = state.sessions.filter((s) => s.goalId !== g.id);
        saveState();
        renderGoals();
        renderSchedule();
        renderDashboard();
      });

      goalsList.appendChild(li);
    });
  }

  // ---- Windows helpers & migration ----
  function readWindowsFromForm() {
    return currentWindowsFromBadges();
  }

  function currentWindowsFromBadges() {
    const container = document.getElementById('windows-badges');
    if (!container) return [];
    return Array.from(container.querySelectorAll('.badge')).map((b) => ({ day: parseInt(b.dataset.day), time: b.dataset.time }));
  }

  function renderWindowsBadges(windows) {
    const container = document.getElementById('windows-badges');
    if (!container) return;
    container.innerHTML = '';
    // Deduplicate
    const key = (w) => `${w.day}-${w.time}`;
    const map = new Map();
    windows.forEach((w) => map.set(key(w), w));
    Array.from(map.values()).forEach((w) => {
      const span = document.createElement('span');
      span.className = 'badge';
      span.dataset.day = String(w.day);
      span.dataset.time = w.time;
      span.textContent = `${labelDay(w.day)} • ${labelTime(w.time)}`;
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'badge-x';
      x.textContent = '×';
      x.addEventListener('click', () => {
        span.remove();
      });
      span.appendChild(x);
      container.appendChild(span);
    });
  }

  function addWindowFromSelectors() {
    const daySel = document.getElementById('win-day');
    const timeSel = document.getElementById('win-time');
    if (!daySel || !timeSel) return;
    const w = { day: parseInt(daySel.value), time: timeSel.value };
    const existing = currentWindowsFromBadges();
    const dedup = [...existing, w].filter((v, i, arr) => arr.findIndex((x) => x.day === v.day && x.time === v.time) === i);
    renderWindowsBadges(dedup);
  }

  function labelDay(d) {
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][((d % 7) + 7) % 7];
  }
  function labelTime(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  function getWindowsDefault() { return []; }

  function ensureGoalWindows(g) {
    if (g.windows && g.windows.length) return g;
    // Migrate legacy fields preferredTime + days to windows
    if (g.preferredTime && Array.isArray(g.days)) {
      g.windows = g.days.map((d) => ({ day: d, time: g.preferredTime }));
      return g;
    }
    g.windows = [];
    return g;
  }

  // ---- Busy events ----
  const busyForm = document.getElementById('busy-form');
  const busyTitleEl = document.getElementById('busy-title');
  const busyDateEl = document.getElementById('busy-date');
  const busyStartEl = document.getElementById('busy-start');
  const busyEndEl = document.getElementById('busy-end');

  if (busyForm) busyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = busyTitleEl.value.trim();
    if (!title) return;
    const date = new Date(busyDateEl.value + 'T00:00:00');
    const [sh, sm] = busyStartEl.value.split(':').map(Number);
    const [eh, em] = busyEndEl.value.split(':').map(Number);
    const start = setTimeHM(date, sh, sm);
    const end = setTimeHM(date, eh, em);
    if (!(end > start)) { alert('End must be after start'); return; }
    state.busy.push({ id: uid(), title, startISO: start.toISOString(), endISO: end.toISOString() });
    saveState();
    regenerateSessionsForWeeksAround(currentWeekStart);
    renderSchedule();
    renderDashboard();
    busyForm.reset();
  });

  // ---- Scheduler ----
  function regenerateSessionsForWeeksAround(weekStart) {
    // Keep status of existing sessions where possible by matching goalId and times
    const weeks = [addDays(weekStart, -7), weekStart, addDays(weekStart, 7)];
    weeks.forEach((ws) => regenerateSessionsForWeek(ws));
    saveState();
  }

  function regenerateSessionsForWeek(weekStart) {
    const { start, end } = getWeekBounds(weekStart);
    // Remove planned sessions in this week; keep checked_in/completed
    state.sessions = state.sessions.filter((s) => {
      const t = new Date(s.startISO);
      const inWeek = t >= start && t < end;
      return !(inWeek && s.status === 'planned');
    });

    // Build availability map from busy and already scheduled sessions (checked/completed)
    const daySlots = {}; // day index -> array of free windows [{start,end}]
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i);
      const [winStartH, winEndH] = [6, 22]; // general day window
      const dayStart = setTimeHM(day, winStartH, 0);
      const dayEnd = setTimeHM(day, winEndH, 0);
      let blocks = [ { start: dayStart, end: dayEnd } ];

      const blockers = [
        ...state.busy.map((b) => ({ start: new Date(b.startISO), end: new Date(b.endISO) })),
        ...state.sessions.filter((s) => s.status !== 'planned').map((s) => ({ start: new Date(s.startISO), end: new Date(s.endISO) })),
      ].filter((x) => x.start >= dayStart && x.end <= dayEnd);

      // subtract blockers from blocks
      blockers.sort((a, b) => a.start - b.start);
      blockers.forEach((blk) => {
        const next = [];
        blocks.forEach((win) => {
          if (!overlap(win.start, win.end, blk.start, blk.end)) {
            next.push(win);
          } else {
            if (blk.start > win.start) next.push({ start: win.start, end: blk.start });
            if (blk.end < win.end) next.push({ start: blk.end, end: win.end });
          }
        });
        blocks = next;
      });
      daySlots[i] = blocks;
    }

    // For each goal, schedule required minutes into preferred windows (multiple day/time)
    state.goals.forEach((g0) => {
      const g = ensureGoalWindows(g0);
      if (g.completed) return; // don't schedule completed goals
      const reqMin = g.hoursPerWeek * 60;
      const slotMin = g.slotMinutes;
      let scheduled = totalPlannedMinutesForGoalInRange(g.id, start, end);
      if (scheduled >= reqMin) return; // already enough from checked/completed

      const windows = (g.windows && g.windows.length) ? g.windows : [];
      if (!windows.length) return; // no preferred windows -> do not schedule

      // Build per-window candidate queues
      const queues = windows.map(({ day, time }, idx) => {
        const [wStartH, wEndH] = TIME_WINDOWS[time] || TIME_WINDOWS.morning;
        const dayDate = addDays(start, (day + 6) % 7); // start is Monday
        const dayIdx = (day + 6) % 7;
        const prefStart = setTimeHM(dayDate, wStartH, 0);
        const prefEnd = setTimeHM(dayDate, wEndH, 0);
        const segs = [];
        (daySlots[dayIdx] || []).forEach((win) => {
          const s = new Date(Math.max(win.start, prefStart));
          const e = new Date(Math.min(win.end, prefEnd));
          if (e - s >= 15 * 60000) segs.push({ dayIdx, start: s, end: e, wIndex: idx });
        });
        // sort this window's segments by time
        segs.sort((a,b) => a.start - b.start);
        return segs;
      });

      // Round-robin allocate sessions across window queues
      let wPtr = 0;
      const totalWindows = queues.length;
      let safety = 1000; // prevent infinite loop
      while (scheduled < reqMin && safety-- > 0) {
        // find next window with available segment
        let found = false;
        for (let i = 0; i < totalWindows; i++) {
          const idx = (wPtr + i) % totalWindows;
          const q = queues[idx];
          if (!q.length) continue;
          // take the earliest segment for this window
          const c = q.shift();
          const cap = minutesBetween(c.start, c.end);
          const dur = Math.min(slotMin, reqMin - scheduled, cap);
          if (dur >= 15) {
            const s = new Date(c.start);
            const e = new Date(c.start.getTime() + dur * 60000);
            state.sessions.push({ id: uid(), goalId: g.id, startISO: s.toISOString(), endISO: e.toISOString(), status: 'planned' });
            scheduled += dur;
            // leftover of this segment goes back to the same queue at front
            if (e < c.end) {
              q.unshift({ ...c, start: e });
            }
          }
          // move pointer to next window for fairness
          wPtr = (idx + 1) % totalWindows;
          found = true;
          break;
        }
        if (!found) break; // no more capacity in any window
      }
    });
  }

  function totalPlannedMinutesForGoalInRange(goalId, start, end) {
    // count checked_in/completed + existing planned after filter
    const relevant = state.sessions.filter((s) => s.goalId === goalId && new Date(s.startISO) >= start && new Date(s.endISO) <= end);
    return relevant.reduce((sum, s) => sum + minutesBetween(new Date(s.startISO), new Date(s.endISO)), 0);
  }

  function sumCompletedMinutesForGoalInRange(goalId, start, end) {
    const relevant = state.sessions.filter((s) => s.goalId === goalId && s.status === 'completed' && new Date(s.startISO) >= start && new Date(s.endISO) <= end);
    return relevant.reduce((sum, s) => sum + minutesBetween(new Date(s.startISO), new Date(s.endISO)), 0);
  }

  // ---- Schedule visualizer ----
  let currentWeekStart = startOfWeek(now);
  const weekLabel = document.getElementById('week-label');
  const weekGrid = document.getElementById('week-grid');
  const prevWeekBtn = document.getElementById('prev-week');
  const nextWeekBtn = document.getElementById('next-week');
  const slotDetails = document.getElementById('slot-details');
  const slotActions = document.getElementById('slot-actions');
  const checkInBtn = document.getElementById('check-in');
  const markCompleteBtn = document.getElementById('mark-complete');
  const slotEditWrap = document.getElementById('slot-edit');
  const slotEditDate = document.getElementById('slot-edit-date');
  const slotEditStart = document.getElementById('slot-edit-start');
  const slotEditEnd = document.getElementById('slot-edit-end');
  const slotSaveBtn = document.getElementById('slot-save');
  const slotDeleteBtn = document.getElementById('slot-delete');

  let selectedItem = null; // { kind: 'session'|'busy', id }

  if (prevWeekBtn) prevWeekBtn.addEventListener('click', () => { currentWeekStart = addDays(currentWeekStart, -7); regenerateSessionsForWeeksAround(currentWeekStart); renderSchedule(); });
  if (nextWeekBtn) nextWeekBtn.addEventListener('click', () => { currentWeekStart = addDays(currentWeekStart, 7); regenerateSessionsForWeeksAround(currentWeekStart); renderSchedule(); });

  function getWeekBounds(weekStart) {
    const start = startOfWeek(weekStart);
    const end = addDays(start, 7);
    return { start, end };
  }

  function renderSchedule() {
    const { start, end } = getWeekBounds(currentWeekStart);
    weekLabel.textContent = `${fmtDate(start)} - ${fmtDate(addDays(end, -1))}`;

    regenerateSessionsForWeek(currentWeekStart);

    // Build columns
    weekGrid.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i);
      const col = document.createElement('div');
      col.className = 'day-col';
      const head = document.createElement('div');
      head.className = 'day-head';
      head.textContent = day.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      const body = document.createElement('div');
      body.className = 'day-body';

      // Gather busy and sessions for the day
      const dayBusy = state.busy.filter((b) => sameDay(new Date(b.startISO), day));
      const daySessions = state.sessions.filter((s) => sameDay(new Date(s.startISO), day));

      const items = [
        ...dayBusy.map((b) => ({ type: 'busy', start: new Date(b.startISO), end: new Date(b.endISO), title: b.title, busy: b })),
        ...daySessions.map((s) => ({ type: s.status === 'completed' ? 'completed' : 'study', start: new Date(s.startISO), end: new Date(s.endISO), session: s })),
      ];

      // Sort by start time
      items.sort((a, b) => a.start - b.start);

      // Render items as blocks
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'slot';
        empty.textContent = '—';
        body.appendChild(empty);
      } else {
        items.forEach((it) => {
          const div = document.createElement('div');
          div.className = `slot ${it.type}`;
          if (it.type === 'busy') {
            div.textContent = `${fmtTime(it.start)}–${fmtTime(it.end)} • ${it.title}`;
            div.addEventListener('click', () => selectBusy(it.busy));
          } else {
            const g = state.goals.find((x) => x.id === it.session.goalId);
            div.textContent = `${fmtTime(it.start)}–${fmtTime(it.end)} • ${g ? g.title : 'Study'}`;
            div.addEventListener('click', () => selectSession(it.session));
          }
          body.appendChild(div);
        });
      }

      col.appendChild(head);
      col.appendChild(body);
      weekGrid.appendChild(col);
    }

    // Update streak in footer
    document.getElementById('streak-count').textContent = computeStreak();

    // Clear slot details if not valid
    // clear selection if item no longer exists
    if (selectedItem) {
      if (selectedItem.kind === 'session' && !state.sessions.find((s) => s.id === selectedItem.id)) clearSlotSelection();
      if (selectedItem.kind === 'busy' && !state.busy.find((b) => b.id === selectedItem.id)) clearSlotSelection();
    }
  }

  function selectSession(session) {
    selectedItem = { kind: 'session', id: session.id };
    const g = state.goals.find((x) => x.id === session.goalId);
    slotDetails.innerHTML = `<div><strong>${g ? g.title : 'Study'}</strong></div>
      <div class="muted">${fmtDate(new Date(session.startISO))} • ${fmtTime(new Date(session.startISO))}–${fmtTime(new Date(session.endISO))}</div>
      <div>Status: ${session.status}</div>`;
    slotActions && (slotActions.style.display = 'flex');
    if (slotEditWrap) {
      slotEditWrap.style.display = 'grid';
      slotEditDate.value = new Date(session.startISO).toISOString().slice(0,10);
      slotEditStart.value = new Date(session.startISO).toTimeString().slice(0,5);
      slotEditEnd.value = new Date(session.endISO).toTimeString().slice(0,5);
    }
  }
  function clearSlotSelection() {
    selectedItem = null;
    slotDetails.textContent = 'Select a study slot to check in.';
    slotActions && (slotActions.style.display = 'none');
    if (slotEditWrap) slotEditWrap.style.display = 'none';
  }

  function selectBusy(busy) {
    selectedItem = { kind: 'busy', id: busy.id };
    slotDetails.innerHTML = `<div><strong>${busy.title}</strong></div>
      <div class=\"muted\">${fmtDate(new Date(busy.startISO))} • ${fmtTime(new Date(busy.startISO))}–${fmtTime(new Date(busy.endISO))}</div>`;
    slotActions && (slotActions.style.display = 'none');
    if (slotEditWrap) {
      slotEditWrap.style.display = 'grid';
      slotEditDate.value = new Date(busy.startISO).toISOString().slice(0,10);
      slotEditStart.value = new Date(busy.startISO).toTimeString().slice(0,5);
      slotEditEnd.value = new Date(busy.endISO).toTimeString().slice(0,5);
    }
  }

  checkInBtn && checkInBtn.addEventListener('click', () => {
    if (!selectedItem || selectedItem.kind !== 'session') return;
    const s = state.sessions.find((x) => x.id === selectedItem.id);
    if (!s) return;
    if (s.status === 'completed') return;
    s.status = 'checked_in';
    saveState();
    renderSchedule();
    renderGoals();
  });

  markCompleteBtn && markCompleteBtn.addEventListener('click', () => {
    if (!selectedItem || selectedItem.kind !== 'session') return;
    const s = state.sessions.find((x) => x.id === selectedItem.id);
    if (!s) return;
    s.status = 'completed';
    saveState();
    renderSchedule();
    renderGoals();
    renderDashboard();
  });

  // Slot edit handlers
  slotSaveBtn && slotSaveBtn.addEventListener('click', () => {
    if (!selectedItem) return;
    const date = new Date(slotEditDate.value + 'T00:00:00');
    const [sh, sm] = slotEditStart.value.split(':').map(Number);
    const [eh, em] = slotEditEnd.value.split(':').map(Number);
    const start = setTimeHM(date, sh, sm);
    const end = setTimeHM(date, eh, em);
    if (!(end > start)) { alert('End must be after start'); return; }
    if (selectedItem.kind === 'busy') {
      const b = state.busy.find((x) => x.id === selectedItem.id);
      if (!b) return; b.startISO = start.toISOString(); b.endISO = end.toISOString();
    } else {
      const s = state.sessions.find((x) => x.id === selectedItem.id);
      if (!s) return; s.startISO = start.toISOString(); s.endISO = end.toISOString();
    }
    saveState();
    regenerateSessionsForWeeksAround(currentWeekStart);
    renderSchedule();
    renderDashboard();
  });

  slotDeleteBtn && slotDeleteBtn.addEventListener('click', () => {
    if (!selectedItem) return;
    if (!confirm('Delete this item?')) return;
    if (selectedItem.kind === 'busy') {
      state.busy = state.busy.filter((b) => b.id !== selectedItem.id);
    } else {
      state.sessions = state.sessions.filter((s) => s.id !== selectedItem.id);
    }
    saveState();
    clearSlotSelection();
    regenerateSessionsForWeeksAround(currentWeekStart);
    renderSchedule();
    renderDashboard();
  });

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function computeStreak() {
    // Count consecutive days up to today with at least one completed session
    const completedDates = new Set(state.sessions.filter((s) => s.status === 'completed').map((s) => toISODate(new Date(s.startISO))));
    let streak = 0;
    let d = new Date();
    while (completedDates.has(toISODate(d))) {
      streak += 1;
      d = addDays(d, -1);
    }
    return streak;
  }

  // ---- Dashboard ----
  const goalsSummary = document.getElementById('goals-summary');
  const upcomingList = document.getElementById('upcoming-list');
  const postForm = document.getElementById('post-form');
  const postContentEl = document.getElementById('post-content');
  const feedList = document.getElementById('feed');

  if (postForm) postForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = postContentEl.value.trim();
    if (!content) return;
    state.posts.unshift({ id: uid(), authorId: state.currentUser.id, authorName: state.currentUser.name, content, createdISO: new Date().toISOString(), likes: 0, comments: [] });
    saveState();
    postForm.reset();
    renderDashboard();
  });

  function renderDashboard() {
    const { start, end } = getWeekBounds(currentWeekStart);
    // Goals summary (if present on page)
    if (goalsSummary) {
      goalsSummary.innerHTML = '';
      state.goals.forEach((g) => {
        const wrap = document.createElement('div');
        wrap.className = 'stack';
        const completedMin = sumCompletedMinutesForGoalInRange(g.id, start, end);
        const targetMin = g.hoursPerWeek * 60;
        const pct = targetMin ? clamp(Math.round((completedMin / targetMin) * 100), 0, 100) : 0;
        wrap.innerHTML = `<div class="row between"><strong>${g.title}</strong><span class="muted">${(completedMin/60).toFixed(1)}h / ${g.hoursPerWeek}h</span></div>
          <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>`;
        goalsSummary.appendChild(wrap);
      });
    }

    // Upcoming next 7 days (if present on page)
    if (upcomingList) {
      const horizonEnd = addDays(new Date(), 7);
      const items = [
        ...state.busy.map((b) => ({ type: 'busy', start: new Date(b.startISO), end: new Date(b.endISO), title: b.title })),
        ...state.sessions.filter((s) => s.status !== 'completed').map((s) => {
          const g = state.goals.find((x) => x.id === s.goalId);
          return { type: 'study', start: new Date(s.startISO), end: new Date(s.endISO), title: g ? g.title : 'Study' };
        })
      ].filter((it) => it.start >= new Date() && it.start < horizonEnd)
       .sort((a, b) => a.start - b.start)
       .slice(0, 8);

      upcomingList.innerHTML = '';
      items.forEach((it) => {
        const li = document.createElement('li');
        li.className = 'row gap';
        const dot = document.createElement('span');
        dot.className = 'dot ' + (it.type === 'busy' ? 'busy' : 'study');
        const text = document.createElement('span');
        text.textContent = `${fmtDate(it.start)} • ${fmtTime(it.start)}–${fmtTime(it.end)} • ${it.title}`;
        li.appendChild(dot);
        li.appendChild(text);
        upcomingList.appendChild(li);
      });
    }

    // Feed (if present on page)
    if (feedList && document.getElementById('post-item-template')) {
      renderFeed();
    }

    // Update streak in footer
    const streakEl = document.getElementById('streak-count');
    if (streakEl) streakEl.textContent = computeStreak();
  }

  function renderFeed() {
    feedList.innerHTML = '';
    const tpl = document.getElementById('post-item-template');
    // Simple feed shows all posts (friends + you)
    const posts = [...state.posts].sort((a, b) => new Date(b.createdISO) - new Date(a.createdISO));
    posts.forEach((p) => {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.querySelector('.author').textContent = p.authorName;
      li.querySelector('.time').textContent = timeAgo(new Date(p.createdISO));
      li.querySelector('.content').textContent = p.content;
      li.querySelector('.like-count').textContent = p.likes;
      li.querySelector('.like').addEventListener('click', () => {
        p.likes += 1; saveState(); renderFeed();
      });
      const commentsUl = li.querySelector('.comments');
      p.comments.forEach((c) => {
        const ci = document.createElement('li');
        ci.textContent = `${c.authorName}: ${c.text}`;
        commentsUl.appendChild(ci);
      });
      const cForm = li.querySelector('.comment-form');
      const cInput = li.querySelector('.comment-input');
      cForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = cInput.value.trim(); if (!text) return;
        p.comments.push({ id: uid(), authorName: state.currentUser.name, text, createdISO: new Date().toISOString() });
        saveState();
        renderFeed();
      });
      feedList.appendChild(li);
    });
  }

  function timeAgo(date) {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); return `${d}d ago`;
  }

  // ---- Init ----
  // Direct binding if present at load
  if (addWindowBtn) addWindowBtn.addEventListener('click', (e) => { e.preventDefault(); addWindowFromSelectors(); });
  // Delegated binding for dynamic contexts (modal)
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.id === 'add-window') { e.preventDefault(); addWindowFromSelectors(); }
  });
  // Default badges: none
  if (windowsBadges) renderWindowsBadges([]);

  regenerateSessionsForWeeksAround(currentWeekStart);
  if (document.getElementById('week-grid')) renderSchedule();
  if (document.getElementById('goals-list')) renderGoals();
  if (document.getElementById('goals-summary') || document.getElementById('feed')) renderDashboard();
  if (document.getElementById('goals-active') || document.getElementById('goals-completed')) renderGoalsPage();
})();
