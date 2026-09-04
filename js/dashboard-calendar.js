/**
 * PMS Dashboard Calendar — month grid with user-specific upcoming events.
 */
const PMSCalendar = (() => {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const LOAD_TIMEOUT_MS = 8000;

  const instances = new Map();

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toDateKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function parseDateKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function mondayIndex(date) {
    const day = date.getDay();
    return day === 0 ? 6 : day - 1;
  }

  function esc(str) {
    if (typeof PMSUI !== 'undefined') return PMSUI.esc(str);
    const el = document.createElement('div');
    el.textContent = str ?? '';
    return el.innerHTML;
  }

  function fmtDate(key) {
    if (typeof PMSUI !== 'undefined') return PMSUI.fmtDate(key);
    return key;
  }

  async function fetchEvents(user) {
    if (typeof PMSApi !== 'undefined' && typeof PMSApi.getCalendarEvents === 'function') {
      try {
        const payload = await PMSApi.getCalendarEvents();
        if (payload?.events?.length) return payload.events;
      } catch (_) { /* fall through to local store */ }
    }
    return PMSStorage.getCalendarEventsForUser(user);
  }

  function eventsForDay(events, key) {
    return events.filter((e) => e.date === key);
  }

  function upcomingEvents(events, fromDate = new Date(), days = 7) {
    const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    return events
      .filter((e) => {
        const d = parseDateKey(e.date);
        return d >= start && d < end;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  }

  function renderMonthGrid(state) {
    const { viewDate, events, selectedDate, todayKey } = state;
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = mondayIndex(first);

    const cells = [];
    for (let i = 0; i < leading; i += 1) {
      cells.push('<td class="cal-day cal-day--empty" aria-hidden="true"></td>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${year}-${pad(month + 1)}-${pad(day)}`;
      const dayEvents = eventsForDay(events, key);
      const classes = ['cal-day'];
      if (key === todayKey) classes.push('cal-day--today');
      if (key === selectedDate) classes.push('cal-day--selected');
      if (dayEvents.length) classes.push('cal-day--has-events');
      const dots = dayEvents.slice(0, 3).map((e) => `<span class="cal-dot cal-dot--${esc(e.type)}" title="${esc(e.title)}"></span>`).join('');
      const count = dayEvents.length > 3 ? `<span class="cal-day-count">+${dayEvents.length - 3}</span>` : '';
      cells.push(`<td class="${classes.join(' ')}">
        <button type="button" class="cal-day-btn" data-date="${esc(key)}" aria-label="${dayEvents.length ? `${dayEvents.length} event(s) on ${key}` : `No events on ${key}`}">
          <span class="cal-day-num">${day}</span>
          ${dayEvents.length ? `<span class="cal-dots">${dots}${count}</span>` : ''}
        </button>
      </td>`);
    }

    const trailing = (7 - (cells.length % 7)) % 7;
    for (let i = 0; i < trailing; i += 1) {
      cells.push('<td class="cal-day cal-day--empty" aria-hidden="true"></td>');
    }

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
    }

    return `<table class="cal-grid" role="grid" aria-label="${MONTHS[month]} ${year} calendar">
      <thead><tr>${WEEKDAYS.map((d) => `<th scope="col">${d}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
  }

  function renderDayDetail(state) {
    const { selectedDate, events } = state;
    if (!selectedDate) {
      return '<p class="cal-detail-empty">Select a date to view events.</p>';
    }
    const dayEvents = eventsForDay(events, selectedDate);
    if (!dayEvents.length) {
      return `<p class="cal-detail-empty">No events on ${fmtDate(selectedDate)}.</p>`;
    }
    return `<ul class="cal-event-list">${dayEvents.map((e) => {
      const time = e.time ? `<span class="cal-event-time">${esc(e.time)}</span>` : '';
      const link = e.linkHref
        ? `<a href="${esc(e.linkHref)}" class="cal-event-link">${esc(e.title)}</a>`
        : `<strong>${esc(e.title)}</strong>`;
      return `<li class="cal-event cal-event--${esc(e.type)} cal-event--${esc(e.severity || 'low')}">
        ${link}${time}
        ${e.subtitle ? `<span class="cal-event-sub">${esc(e.subtitle)}</span>` : ''}
      </li>`;
    }).join('')}</ul>`;
  }

  function renderUpcoming(state) {
    const list = upcomingEvents(state.events);
    if (!list.length) {
      return '<p class="cal-detail-empty">No upcoming events in the next 7 days.</p>';
    }
    return `<ul class="cal-upcoming-list">${list.map((e) => {
      const link = e.linkHref
        ? `<a href="${esc(e.linkHref)}" class="cal-event-link">${esc(e.title)}</a>`
        : `<strong>${esc(e.title)}</strong>`;
      return `<li class="cal-upcoming-item cal-event--${esc(e.type)}">
        <span class="cal-upcoming-date">${fmtDate(e.date)}${e.time ? ` · ${esc(e.time)}` : ''}</span>
        ${link}
        ${e.subtitle ? `<span class="cal-event-sub">${esc(e.subtitle)}</span>` : ''}
      </li>`;
    }).join('')}</ul>`;
  }

  function render(state) {
    const container = document.getElementById(state.containerId);
    if (!container) return;

    if (state.loading) {
      container.innerHTML = '<div class="cal-loading"><span class="loading-spinner" aria-hidden="true"></span> Loading events…</div>';
      return;
    }

    const monthLabel = `${MONTHS[state.viewDate.getMonth()]} ${state.viewDate.getFullYear()}`;
    const errorBanner = state.error
      ? `<div class="cal-error" role="alert">${esc(state.error)}${state.events.length ? ' Showing cached events.' : ''}</div>`
      : '';

    container.innerHTML = `
      ${errorBanner}
      <div class="cal-toolbar">
        <button type="button" class="cal-nav-btn" data-cal-nav="prev" aria-label="Previous month">‹</button>
        <div class="cal-month-label">
          <h3 class="cal-month-title">Calendar</h3>
          <p class="cal-month-sub">${monthLabel}</p>
        </div>
        <button type="button" class="cal-nav-btn" data-cal-nav="next" aria-label="Next month">›</button>
        <button type="button" class="cal-nav-btn cal-nav-btn--today" data-cal-nav="today">Today</button>
      </div>
      ${renderMonthGrid(state)}
      <div class="cal-panels">
        <div class="cal-panel">
          <h4 class="cal-panel-title">${state.selectedDate ? fmtDate(state.selectedDate) : 'Day events'}</h4>
          ${renderDayDetail(state)}
        </div>
        <div class="cal-panel">
          <h4 class="cal-panel-title">Upcoming (7 days)</h4>
          ${renderUpcoming(state)}
        </div>
      </div>`;

    container.querySelectorAll('[data-cal-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.calNav;
        if (action === 'prev') {
          state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() - 1, 1);
        } else if (action === 'next') {
          state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() + 1, 1);
        } else {
          state.viewDate = new Date();
          state.selectedDate = state.todayKey;
        }
        render(state);
      });
    });

    container.querySelectorAll('.cal-day-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedDate = btn.dataset.date;
        render(state);
      });
    });
  }

  async function loadEvents(state) {
    state.loading = true;
    render(state);
    try {
      const result = await Promise.race([
        fetchEvents(state.user),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS);
        }),
      ]);
      state.events = Array.isArray(result) ? result : [];
      state.error = null;
    } catch (err) {
      try {
        state.events = PMSStorage.getCalendarEventsForUser(state.user);
        state.error = state.events.length ? null : (err.message === 'timeout' ? 'Unable to load events — request timed out.' : 'Unable to load events.');
      } catch (_) {
        state.events = [];
        state.error = 'Unable to load events.';
      }
    }
    state.loading = false;

    if (!state.selectedDate && state.events.length) {
      const todayUpcoming = upcomingEvents(state.events).find((e) => e.date >= state.todayKey);
      state.selectedDate = todayUpcoming?.date || state.todayKey;
    }

    render(state);
  }

  function mount(containerId, user, options = {}) {
    const container = document.getElementById(containerId);
    if (!container || !user) return;

    const today = new Date();
    const state = {
      containerId,
      user,
      viewDate: options.initialDate ? new Date(options.initialDate) : new Date(today.getFullYear(), today.getMonth(), 1),
      selectedDate: options.selectedDate || toDateKey(today),
      todayKey: toDateKey(today),
      events: [],
      loading: true,
      error: null,
    };

    instances.set(containerId, state);
    loadEvents(state);
  }

  function refresh(containerId) {
    const state = instances.get(containerId);
    if (state) loadEvents(state);
  }

  return { mount, refresh };
})();
