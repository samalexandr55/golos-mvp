/**
 * ГОЛОС — script.js
 * Anonymous compliance reporting · Production MVP
 * -----------------------------------------------
 * Architecture:
 *   CONST      → app-wide constants
 *   Store      → localStorage facade
 *   Demo       → initial mock data
 *   Codegen    → unique code generation
 *   Nav        → screen routing
 *   App        → global helpers (stats, copy)
 *   Wizard     → 3-step form controller
 *   Status     → status screen controller
 *   Boot       → initialisation
 */

'use strict';

/* ============================================================
   CONSTANTS
============================================================ */

const STORAGE_KEY = 'golos_v1';

/** Human-readable category labels */
const CATEGORY_LABEL = Object.freeze({
  money:    'Деньги / Взятка',
  pressure: 'Давление / Этика',
  conflict: 'Конфликт интересов',
  other:    'Другое нарушение',
});

/** Status → badge config */
const BADGE_CONFIG = Object.freeze({
  active: { cls: 'badge--on',  label: 'В работе'        },
  review: { cls: 'badge--rev', label: 'На рассмотрении' },
  closed: { cls: 'badge--off', label: 'Завершено'       },
});

/** Timeline dot modifier per event type */
const DOT_CLASS = Object.freeze({
  created:  'tl-dot--on',
  assigned: '',
  question: '',
  done:     'tl-dot--done',
  closed:   'tl-dot--done',
  reply:    '',
});

/** Russian month names (short) */
const MONTHS_RU = ['янв','фев','мар','апр','мая','июн',
                   'июл','авг','сен','окт','ноя','дек'];

/** Minimum description length before wizard advances */
const MIN_DESC_LENGTH = 20;

/** Base stats displayed on the home screen (offset by real data) */
const BASE_ACTIVE = 8;
const BASE_CLOSED = 3;

/* ============================================================
   UTILITIES
============================================================ */

/** @param {string} id @returns {HTMLElement} */
const el = id => document.getElementById(id);

/** @param {string} selector @param {Element} [root] */
const qs = (selector, root = document) => root.querySelector(selector);

/** @param {string} selector @param {Element} [root] */
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

/**
 * Show/hide helpers — avoid repetitive classList calls.
 * All visibility is managed via the .hidden utility class in CSS.
 */
const show = id  => el(id).classList.remove('hidden');
const hide = id  => el(id).classList.add('hidden');
const setVisible = (id, visible) => el(id).classList.toggle('hidden', !visible);

/** Format a Date as "DD mon HH:MM" */
function formatTime(date = new Date()) {
  const d  = String(date.getDate());
  const mo = MONTHS_RU[date.getMonth()];
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${d} ${mo} ${hh}:${mm}`;
}

/** Clamp and return string, appending ellipsis if truncated */
function truncate(str, max = 80) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

/* ============================================================
   STORE — localStorage facade
   All reads are safe; write failures (private mode) are silent.
============================================================ */

const Store = (() => {

  function read() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function write(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* localStorage unavailable (private browsing, quota exceeded) */
    }
  }

  return Object.freeze({
    /** Return all stored reports as a plain object keyed by code. */
    all() { return read(); },

    /** Persist (create or update) a single report. */
    save(report) {
      const all = read();
      all[report.code] = report;
      write(all);
    },

    /** Look up a report by code (case-insensitive, trims whitespace). */
    find(rawCode) {
      const code = rawCode.trim().toUpperCase();
      return read()[code] ?? null;
    },

    /** Counts for home-screen stats. */
    stats() {
      const rows = Object.values(read());
      return {
        active: rows.filter(r => r.status !== 'closed').length,
        closed: rows.filter(r => r.status === 'closed').length,
      };
    },

    /** Returns true if storage has any records (used to skip demo init). */
    isEmpty() {
      return Object.keys(read()).length === 0;
    },
  });
})();

/* ============================================================
   DEMO DATA — inserted once on first visit
============================================================ */

const Demo = (() => {

  /** @returns {import('./types').Report} */
  function makeReport(overrides) {
    return Object.assign({
      code:       '',
      cat:        '',
      catLabel:   '',
      loc:        '',
      date:       '',
      desc:       '',
      status:     'active',
      createdAt:  Date.now(),
      events:     [],
      officerMsg: null,
      reply:      null,
    }, overrides);
  }

  return Object.freeze({
    init() {
      if (!Store.isEmpty()) return;

      Store.save(makeReport({
        code:       'DEMO-0001',
        cat:        'money',
        catLabel:   CATEGORY_LABEL.money,
        loc:        'Корпус А, кафедра экономики',
        date:       '12 мая 2026',
        desc:       'Преподаватель требует дополнительную оплату за пересдачу экзамена.',
        status:     'review',
        createdAt:  Date.now() - 86_400_000,
        events: [
          { time: '14 мая 19:32', text: 'Обращение принято',  type: 'created'  },
          { time: '15 мая 08:14', text: 'Назначен омбудсмен', type: 'assigned' },
          { time: '15 мая 09:45', text: 'Получен вопрос',     type: 'question' },
        ],
        officerMsg: 'Уточните: это произошло во время официальной пересдачи или договорённости в частном порядке?',
      }));

      Store.save(makeReport({
        code:      'DEMO-0002',
        cat:       'conflict',
        catLabel:  CATEGORY_LABEL.conflict,
        loc:       'Деканат',
        date:      '5 мая 2026',
        desc:      'Декан направляет студентов на практику исключительно в компанию своего родственника.',
        status:    'closed',
        createdAt: Date.now() - 172_800_000,
        events: [
          { time: '5 мая 14:00', text: 'Обращение принято',           type: 'created'  },
          { time: '6 мая 09:00', text: 'Назначен омбудсмен',          type: 'assigned' },
          { time: '8 мая 16:30', text: 'Расследование завершено',     type: 'done'     },
          { time: '9 мая 11:00', text: 'Меры приняты. Дело закрыто.', type: 'closed'   },
        ],
      }));

      Store.save(makeReport({
        code:      'DEMO-0003',
        cat:       'pressure',
        catLabel:  CATEGORY_LABEL.pressure,
        loc:       'Учебный корпус Б',
        date:      '16 мая 2026',
        desc:      'Научный руководитель принуждает включать его в соавторы выпускной работы.',
        status:    'active',
        createdAt: Date.now() - 3_600_000,
        events: [
          { time: '16 мая 18:00', text: 'Обращение принято', type: 'created' },
        ],
      }));
    },
  });
})();

/* ============================================================
   CODEGEN — cryptographically random unique code
   Format: XXXX-NNNN  (letters + numbers, no ambiguous chars)
============================================================ */

const Codegen = (() => {

  /* Remove visually ambiguous characters: O/0, I/1/l */
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; /* 24 chars */
  const NUMS  = '23456789';                 /* 8 chars  */

  return Object.freeze({
    generate() {
      const buf = new Uint8Array(8);
      (window.crypto || window.msCrypto).getRandomValues(buf);

      const part1 = Array.from(buf.slice(0, 4), n => ALPHA[n % ALPHA.length]).join('');
      const part2 = Array.from(buf.slice(4),    n => NUMS [n % NUMS.length ]).join('');

      return `${part1}-${part2}`;
    },
  });
})();

/* ============================================================
   NAV — screen routing
   Single source of truth for which screen is visible.
============================================================ */

const Nav = (() => {

  /** The code submitted in this session (set by Wizard, read by Status). */
  let _sessionCode = null;

  function activate(screenId) {
    qsa('.screen').forEach(s => s.classList.remove('is-active'));
    el(screenId).classList.add('is-active');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  return Object.freeze({
    /** Called by Wizard after successful submit to share the code. */
    setSessionCode(code) { _sessionCode = code; },
    getSessionCode()     { return _sessionCode;  },

    toHome()   { activate('s-home');    },
    toWizard() { activate('s-wizard');  },
    toConfirm(){ activate('s-confirm'); },

    toStatus() {
      activate('s-status');

      if (_sessionCode) {
        /* Return user came from confirm screen — show result immediately. */
        Status.render(_sessionCode);
      } else {
        /* Fresh entry — show search form. */
        show('pnl-search');
        hide('pnl-result');
        el('topbar-code').textContent = '';
        el('inp-code').value = '';
      }
    },
  });
})();

/* ============================================================
   APP — global helpers (stats, clipboard)
============================================================ */

const App = (() => {

  return Object.freeze({

    /** Refresh live stats on the home screen. */
    refreshStats() {
      const s = Store.stats();
      el('stat-active').textContent = BASE_ACTIVE + s.active;
      el('stat-closed').textContent = BASE_CLOSED + s.closed;
    },

    /**
     * Copy the code displayed in #el-code.
     * Three-tier fallback:
     *   1. navigator.clipboard (modern secure contexts)
     *   2. document.execCommand (legacy, HTTP)
     *   3. Silent fail (clipboard inaccessible — rare)
     */
    copyCode() {
      /* Always read from the live DOM — never from a cached variable. */
      const codeEl = el('el-code');
      const code   = (codeEl.textContent || '').trim();

      /* Guard: don't attempt copy if the element is empty or placeholder. */
      if (!code || code === '\u00a0' || code.includes('?')) return;

      const onDone = () => App._flashCopyButton();
      const onFail = () => App._legacyCopy(code, onDone);

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(code).then(onDone).catch(onFail);
      } else {
        App._legacyCopy(code, onDone);
      }
    },

    _flashCopyButton() {
      const btn = el('btn-copy');
      const originalHTML = btn.innerHTML;

      btn.textContent = '✓ Скопировано';
      btn.classList.add('btn--ok');

      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.classList.remove('btn--ok');
      }, 2200);
    },

    /** execCommand fallback for HTTP / older browsers */
    _legacyCopy(text, onSuccess) {
      const ta = document.createElement('textarea');
      Object.assign(ta.style, {
        position: 'fixed',
        left: '-9999px',
        top:  '-9999px',
        opacity: '0',
      });
      ta.value    = text;
      ta.readOnly = true;
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, 99999);
      try {
        const ok = document.execCommand('copy');
        if (ok) onSuccess();
      } catch { /* clipboard unavailable */ }
      document.body.removeChild(ta);
    },
  });
})();

/* ============================================================
   WIZARD — 3-step form controller
============================================================ */

const Wizard = (() => {

  /* Mutable form state — reset on every startWizard() call. */
  const state = {
    step:     1,
    category: null,  /* matches CATEGORY_LABEL key */
    location: '',
    date:     '',
    description: '',
    confirmed: false,
  };

  /* ── Progress bar ── */
  function updateProgress(step) {
    for (let i = 1; i <= 3; i++) {
      const dot = el(`step-dot-${i}`);
      dot.classList.remove('is-active', 'is-done');
      if      (i <  step) dot.classList.add('is-done');
      else if (i === step) dot.classList.add('is-active');
    }
    for (let i = 1; i <= 2; i++) {
      el(`step-line-${i}`).classList.toggle('is-done', i < step);
    }
  }

  /* ── Pane / footer visibility ── */
  function setStep(n) {
    state.step = n;

    /* Panes */
    for (let i = 1; i <= 3; i++) {
      el(`pane-${i}`).classList.toggle('is-active', i === n);
    }

    /* Footer button rows */
    ['wf-1', 'wf-2', 'wf-3'].forEach((id, idx) => {
      el(id).classList.toggle('hidden', idx + 1 !== n);
    });

    /* Back button */
    el('wizard-back').style.visibility = n === 1 ? 'hidden' : 'visible';

    updateProgress(n);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  /* ── Review panel population ── */
  function fillReview() {
    const set = (id, value) => {
      const node = el(id);
      if (value) {
        node.textContent = truncate(value);
        node.classList.remove('is-empty');
      } else {
        node.textContent = 'не указано';
        node.classList.add('is-empty');
      }
    };

    set('rv-cat',  CATEGORY_LABEL[state.category]);
    set('rv-loc',  state.location);
    set('rv-date', state.date);
    set('rv-desc', state.description);
  }

  /* ── Validation helpers ── */
  function isCategoryValid() { return state.category !== null; }
  function isDescValid()     { return state.description.trim().length >= MIN_DESC_LENGTH; }
  function isConfirmed()     { return state.confirmed; }

  /* Public API */
  return Object.freeze({

    /** Reset all state and launch the wizard screen. */
    start() {
      Object.assign(state, {
        step: 1, category: null,
        location: '', date: '', description: '', confirmed: false,
      });

      /* Clear category selection */
      qsa('.cat').forEach(btn => {
        btn.classList.remove('is-selected');
        btn.setAttribute('aria-pressed', 'false');
      });

      /* Clear form inputs */
      ['f-loc', 'f-date', 'f-desc'].forEach(id => { el(id).value = ''; });

      /* Reset checkbox */
      el('chk-confirm').checked = false;

      /* Disable all advance buttons */
      ['btn-next-1', 'btn-next-2', 'btn-submit'].forEach(id => {
        el(id).disabled = true;
      });

      setStep(1);
      Nav.toWizard();
    },

    /** Called by category button onclick. */
    pickCategory(btn) {
      qsa('.cat').forEach(b => {
        b.classList.remove('is-selected');
        b.setAttribute('aria-pressed', 'false');
      });

      btn.classList.add('is-selected');
      btn.setAttribute('aria-pressed', 'true');

      state.category = btn.dataset.val;
      el('btn-next-1').disabled = !isCategoryValid();
    },

    /** Called by textarea oninput. */
    onDescriptionInput() {
      state.description = el('f-desc').value;
      el('btn-next-2').disabled = !isDescValid();
    },

    /** Called by confirmation checkbox onchange. */
    onConfirmChange() {
      state.confirmed = el('chk-confirm').checked;
      el('btn-submit').disabled = !isConfirmed();
    },

    /** Advance to next step (or stay if validation fails). */
    advance() {
      if (state.step === 1 && isCategoryValid()) {
        setStep(2);
      } else if (state.step === 2 && isDescValid()) {
        state.location    = el('f-loc').value.trim();
        state.date        = el('f-date').value.trim();
        state.description = el('f-desc').value.trim();
        fillReview();
        setStep(3);
      }
    },

    /** Go back one step, or return to home from step 1. */
    back() {
      if (state.step > 1) setStep(state.step - 1);
      else                Nav.toHome();
    },

    /**
     * Build the report object, persist it, display the code,
     * then navigate to the confirmation screen.
     */
    submit() {
      if (!isConfirmed()) return;

      const code = Codegen.generate();

      const report = {
        code,
        cat:      state.category,
        catLabel: CATEGORY_LABEL[state.category],
        loc:      state.location,
        date:     state.date,
        desc:     state.description,
        status:   'active',
        createdAt: Date.now(),
        events: [
          { time: formatTime(), text: 'Обращение принято', type: 'created' },
        ],
        officerMsg: null,
        reply:      null,
      };

      Store.save(report);
      App.refreshStats();

      /* Set the code in the DOM *before* navigating so copy works immediately. */
      el('el-code').textContent = code;

      Nav.setSessionCode(code);
      Nav.toConfirm();
    },
  });
})();

/* ============================================================
   STATUS — status tracking + anonymous dialogue
============================================================ */

const Status = (() => {

  /* Code currently visible on the status screen. */
  let _visibleCode = '';

  /* ── Timeline HTML builder ── */
  function buildTimeline(events, reportStatus) {
    return events.map((ev, i) => {
      const isLast = i === events.length - 1;

      /* Closed reports use green dots for all events. */
      const dotMod = reportStatus === 'closed'
        ? 'tl-dot--done'
        : (DOT_CLASS[ev.type] || '');

      return `
        <li class="tl-row">
          <div class="tl-row__aside">
            <div class="tl-dot ${dotMod}"></div>
            ${isLast ? '' : '<div class="tl-line"></div>'}
          </div>
          <div class="tl-row__body">
            <p class="tl-row__when">${ev.time}</p>
            <p class="tl-row__what">${ev.text}</p>
          </div>
        </li>`;
    }).join('');
  }

  /* ── Badge ── */
  function applyBadge(report) {
    const cfg   = BADGE_CONFIG[report.status] ?? BADGE_CONFIG.active;
    const badge = el('res-badge');
    badge.className = `badge ${cfg.cls}`;
    el('res-badge-text').textContent = cfg.label;
  }

  /* Public API */
  return Object.freeze({

    /** Search by code entered in the input field. */
    find() {
      const raw  = el('inp-code').value;
      const code = raw.trim().toUpperCase();

      if (!code) return;

      const report = Store.find(code);
      if (!report) {
        el('search-err').classList.add('is-show');
        return;
      }

      Status.render(code);
    },

    clearError() {
      el('search-err').classList.remove('is-show');
    },

    /**
     * Populate and display the result panel for a given code.
     * Called both from find() and from Nav.toStatus() when returning
     * from the confirm screen.
     */
    render(code) {
      const report = Store.find(code);
      if (!report) return;

      _visibleCode = code;

      /* Switch panels */
      hide('pnl-search');
      show('pnl-result');

      /* Header */
      el('topbar-code').textContent = code;
      el('res-title').textContent   = `Обращение ${code}`;

      /* Badge */
      applyBadge(report);

      /* Timeline */
      el('tl-history').innerHTML = buildTimeline(report.events, report.status);

      /* Officer message */
      const hasMessage = Boolean(report.officerMsg);
      setVisible('pnl-officer', hasMessage);
      if (hasMessage) {
        el('officer-text').textContent = report.officerMsg;
      }

      /* Reply / sent states */
      const canReply   = hasMessage && !report.reply;
      const replySent  = hasMessage && Boolean(report.reply);
      setVisible('pnl-reply', canReply);
      setVisible('pnl-sent',  replySent);

      window.scrollTo({ top: 0, behavior: 'instant' });
    },

    /** Update character counter on reply textarea. */
    countChars() {
      const ta = el('inp-reply');
      if (ta.value.length > 500) ta.value = ta.value.slice(0, 500);
      el('char-count').textContent = ta.value.length;
    },

    /**
     * Persist the user's reply and update the UI.
     * The reply is appended to the event log so future renders show it.
     */
    sendReply() {
      const text = el('inp-reply').value.trim();
      if (!text || !_visibleCode) return;

      const report = Store.find(_visibleCode);
      if (!report) return;

      report.reply = text;
      report.events.push({
        time: formatTime(),
        text: 'Ваш ответ отправлен',
        type: 'reply',
      });

      Store.save(report);

      /* UI transition: hide reply form, show confirmation notice. */
      hide('pnl-reply');
      show('pnl-sent');
    },
  });
})();

/* ============================================================
   GLOBAL EVENT WIRING
   All onclick attributes in HTML call into the modules above.
   This section wires anything that can't be done inline.
============================================================ */

(function wireEvents() {

  /* Enter key in code search field triggers lookup */
  const codeInput = el('inp-code');
  if (codeInput) {
    codeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') Status.find();
    });
  }

  /* Prevent accidental form submission on wizard fields */
  qsa('input.field__inp, textarea.field__ta').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && inp.tagName !== 'TEXTAREA') e.preventDefault();
    });
  });

})();

/* ============================================================
   BOOT — runs once on DOMContentLoaded
============================================================ */

const Boot = (() => {
  return Object.freeze({
    init() {
      Demo.init();          /* populate localStorage on first visit */
      App.refreshStats();   /* show live stats on home screen       */
    },
  });
})();

/* Wire up global helpers used from HTML onclick attributes */
/* These are intentionally on window to keep HTML clean with short names */
window.Nav    = Nav;
window.App    = App;
window.Wizard = Wizard;
window.Status = Status;

/* Run */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Boot.init);
} else {
  Boot.init();
}
