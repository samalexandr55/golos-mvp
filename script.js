/**
 * ГОЛОС — script.js (polished)
 * Цифровой комплаенс-канал университета
 * ─────────────────────────────────────────────
 * Улучшения v2:
 *  + App.runDemo()       — demo flow для жюри
 *  + last-updated        — "последнее обновление" в статусе
 *  + empty state         — когда нет сообщения от омбудсмена
 *  + microcopy           — тексты уровня реального SaaS
 *  + actionable errors   — понятные подсказки в ошибках
 */

'use strict';

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const STORAGE_KEY  = 'golos_v1';
const MIN_DESC_LEN = 20;
const BASE_ACTIVE  = 8;
const BASE_CLOSED  = 3;

const CAT_LABEL = Object.freeze({
  money:    'Деньги / Взятка',
  pressure: 'Давление / Этика',
  conflict: 'Конфликт интересов',
  other:    'Другое нарушение',
});

const BADGE_CFG = Object.freeze({
  active: { cls: 'badge--on',  label: 'В работе'        },
  review: { cls: 'badge--rev', label: 'На рассмотрении' },
  closed: { cls: 'badge--off', label: 'Завершено'       },
});

const MONTHS = [
  'янв','фев','мар','апр','мая','июн',
  'июл','авг','сен','окт','ноя','дек',
];

/* ─────────────────────────────────────────────
   DOM HELPERS
───────────────────────────────────────────── */

const el  = id  => document.getElementById(id);
const qsa = sel => [...document.querySelectorAll(sel)];

const show = id => el(id).classList.remove('hidden');
const hide = id => el(id).classList.add('hidden');
const setV = (id, visible) => el(id).classList.toggle('hidden', !visible);

function nowStr(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${hh}:${mm}`;
}

function clip(str, max = 80) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

/* ─────────────────────────────────────────────
   STORE
───────────────────────────────────────────── */

const Store = (() => {
  const read = () => {
    try   { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  };
  const write = data => {
    try   { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch { /* silent fail — private browsing */ }
  };

  return Object.freeze({
    all()    { return read(); },
    isEmpty(){ return Object.keys(read()).length === 0; },

    save(report) {
      const all = read();
      all[report.code] = report;
      write(all);
    },

    find(raw) {
      return read()[(raw || '').trim().toUpperCase()] ?? null;
    },

    stats() {
      const rows = Object.values(read());
      return {
        active: rows.filter(r => r.status !== 'closed').length,
        closed: rows.filter(r => r.status === 'closed').length,
      };
    },
  });
})();

/* ─────────────────────────────────────────────
   DEMO DATA
───────────────────────────────────────────── */

const Demo = (() => {
  const make = o => Object.assign({
    code: '', cat: '', catLabel: '', loc: '', date: '', desc: '',
    status: 'active', createdAt: Date.now(),
    events: [], officerMsg: null, reply: null,
  }, o);

  return Object.freeze({
    init() {
      if (!Store.isEmpty()) return;

      Store.save(make({
        code: 'DEMO-0001',
        cat: 'money', catLabel: CAT_LABEL.money,
        loc: 'Корпус А, кафедра экономики',
        date: '12 мая 2026',
        desc: 'Преподаватель требует дополнительную оплату за пересдачу экзамена.',
        status: 'review',
        createdAt: Date.now() - 86_400_000,
        events: [
          { time: '14 мая 19:32', text: 'Обращение зарегистрировано', type: 'created'  },
          { time: '15 мая 08:14', text: 'Назначен омбудсмен',         type: 'assigned' },
          { time: '15 мая 09:45', text: 'Омбудсмен запросил уточнение', type: 'question' },
        ],
        officerMsg: 'Уточните: это произошло во время официальной пересдачи или в частном порядке вне аудитории?',
      }));

      Store.save(make({
        code: 'DEMO-0002',
        cat: 'conflict', catLabel: CAT_LABEL.conflict,
        loc: 'Деканат',
        date: '5 мая 2026',
        desc: 'Декан направляет студентов на практику исключительно в компанию родственника.',
        status: 'closed',
        createdAt: Date.now() - 172_800_000,
        events: [
          { time: '5 мая 14:00', text: 'Обращение зарегистрировано',     type: 'created'  },
          { time: '6 мая 09:00', text: 'Назначен омбудсмен',             type: 'assigned' },
          { time: '8 мая 16:30', text: 'Расследование завершено',        type: 'done'     },
          { time: '9 мая 11:00', text: 'Меры приняты. Дело закрыто.',    type: 'closed'   },
        ],
      }));

      Store.save(make({
        code: 'DEMO-0003',
        cat: 'pressure', catLabel: CAT_LABEL.pressure,
        loc: 'Учебный корпус Б',
        date: '16 мая 2026',
        desc: 'Научный руководитель принуждает включать его в соавторы выпускной работы.',
        status: 'active',
        createdAt: Date.now() - 3_600_000,
        events: [
          { time: '16 мая 18:00', text: 'Обращение зарегистрировано', type: 'created' },
        ],
      }));
    },
  });
})();

/* ─────────────────────────────────────────────
   CODEGEN
───────────────────────────────────────────── */

const Codegen = (() => {
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const NUMS  = '23456789';

  return Object.freeze({
    generate() {
      const buf = new Uint8Array(8);
      (window.crypto || window.msCrypto).getRandomValues(buf);
      const p1 = Array.from(buf.slice(0, 4), n => ALPHA[n % ALPHA.length]).join('');
      const p2 = Array.from(buf.slice(4),    n => NUMS [n % NUMS.length ]).join('');
      return `${p1}-${p2}`;
    },
  });
})();

/* ─────────────────────────────────────────────
   NAV
───────────────────────────────────────────── */

const Nav = (() => {
  let _sessionCode = null;

  function activate(id) {
    qsa('.screen').forEach(s => s.classList.remove('is-active'));
    el(id).classList.add('is-active');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  return Object.freeze({
    setSession(code) { _sessionCode = code; },
    getSession()     { return _sessionCode;  },

    toHome()    { activate('s-home');    },
    toWizard()  { activate('s-wizard');  },
    toConfirm() { activate('s-confirm'); },

    toStatus() {
      activate('s-status');
      if (_sessionCode) {
        Status.render(_sessionCode);
      } else {
        show('pnl-search');
        hide('pnl-result');
        el('topbar-code').textContent = '';
        el('inp-code').value = '';
      }
    },
  });
})();

/* ─────────────────────────────────────────────
   APP
───────────────────────────────────────────── */

const App = (() => {
  let _anonOpen = false;

  return Object.freeze({

    refreshStats() {
      const s = Store.stats();
      el('stat-active').textContent = BASE_ACTIVE + s.active;
      el('stat-closed').textContent = BASE_CLOSED + s.closed;
    },

    /* DEMO FLOW для жюри — 2 клика показывают весь продукт */
    runDemo() {
      qsa('.screen').forEach(s => s.classList.remove('is-active'));
      el('s-status').classList.add('is-active');
      window.scrollTo({ top: 0, behavior: 'instant' });
      Status.render('DEMO-0001');
    },

    toggleAnonymity() {
      _anonOpen = !_anonOpen;
      setV('anon-panel', _anonOpen);
    },

    /* COPY — три уровня fallback */
    copyCode() {
      const codeEl = el('el-code');
      if (!codeEl) return;
      const code = codeEl.textContent.trim();
      if (!code || code === '\u00a0' || code.startsWith('?')) return;

      const flash    = () => App._flashBtn();
      const fallback = () => App._execCopy(code, flash);

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(code).then(flash).catch(fallback);
      } else {
        fallback();
      }
    },

    _flashBtn() {
      const btn = el('btn-copy');
      if (!btn) return;
      const orig = btn.innerHTML;
      btn.textContent = '✓ Скопировано';
      btn.classList.add('btn--ok');
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.classList.remove('btn--ok');
      }, 2200);
    },

    _execCopy(text, onDone) {
      const ta = document.createElement('textarea');
      Object.assign(ta.style, {
        position: 'fixed', left: '-9999px', top: '-9999px', opacity: '0',
      });
      ta.value = text;
      ta.readOnly = true;
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, 99999);
      try { if (document.execCommand('copy')) onDone(); } catch {}
      document.body.removeChild(ta);
    },
  });
})();

/* ─────────────────────────────────────────────
   WIZARD
───────────────────────────────────────────── */

const Wizard = (() => {
  const W = {
    step: 1, category: null,
    location: '', date: '', description: '',
    fileName: null,   /* имя выбранного файла (только для отображения) */
    confirmed: false,
  };

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

  function goStep(n) {
    W.step = n;
    for (let i = 1; i <= 3; i++) {
      el(`pane-${i}`).classList.toggle('is-active', i === n);
    }
    ['wf-1', 'wf-2', 'wf-3'].forEach((id, idx) => {
      el(id).classList.toggle('hidden', idx + 1 !== n);
    });
    el('wizard-back').style.visibility = n === 1 ? 'hidden' : 'visible';
    updateProgress(n);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function fillReview() {
    const set = (id, val) => {
      const node = el(id);
      if (val) {
        node.textContent = clip(val);
        node.classList.remove('is-empty');
      } else {
        node.textContent = 'не указано';
        node.classList.add('is-empty');
      }
    };
    set('rv-cat',  CAT_LABEL[W.category]);
    set('rv-loc',  W.location);
    set('rv-date', W.date);
    set('rv-desc', W.description);
    set('rv-file', W.fileName);
  }

  return Object.freeze({

    start() {
      Object.assign(W, {
        step: 1, category: null,
        location: '', date: '', description: '', confirmed: false,
      });
      qsa('.cat').forEach(b => {
        b.classList.remove('is-selected');
        b.setAttribute('aria-pressed', 'false');
      });
      ['f-loc', 'f-date', 'f-desc'].forEach(id => { el(id).value = ''; });
      const fileInp = el('f-file');
      if (fileInp) fileInp.value = '';
      const dropText = el('file-drop-text');
      if (dropText) dropText.textContent = 'Нажмите чтобы выбрать файл';
      const dropZone = el('file-drop-zone');
      if (dropZone) dropZone.classList.remove('file-drop--selected');
      el('chk-confirm').checked = false;
      ['btn-next-1', 'btn-next-2', 'btn-submit'].forEach(id => {
        el(id).disabled = true;
      });
      goStep(1);
      Nav.toWizard();
    },

    /* HTML: onclick="Wizard.pickCat(this)" */
    pickCat(btn) {
      qsa('.cat').forEach(b => {
        b.classList.remove('is-selected');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-selected');
      btn.setAttribute('aria-pressed', 'true');
      W.category = btn.dataset.val;
      el('btn-next-1').disabled = false;
    },

    /* HTML: oninput="Wizard.checkDesc()" */
    checkDesc() {
      W.description = el('f-desc').value;
      const ok = W.description.trim().length >= MIN_DESC_LEN;
      el('btn-next-2').disabled = !ok;
    },

    /* HTML: onchange="Wizard.checkConfirm()" */
    checkConfirm() {
      W.confirmed = el('chk-confirm').checked;
      el('btn-submit').disabled = !W.confirmed;
    },

    /* HTML: onchange="Wizard.onFileChange(this)" */
    onFileChange(input) {
      const file     = input.files && input.files[0];
      const dropText = el('file-drop-text');
      const dropZone = el('file-drop-zone');
      if (file) {
        W.fileName = file.name;
        dropText.textContent = file.name;
        dropZone.classList.add('file-drop--selected');
      } else {
        W.fileName = null;
        dropText.textContent = 'Нажмите чтобы выбрать файл';
        dropZone.classList.remove('file-drop--selected');
      }
    },

    /* HTML: onclick="Wizard.next()" */
    next() {
      if (W.step === 1 && W.category) {
        goStep(2);
      } else if (W.step === 2 && W.description.trim().length >= MIN_DESC_LEN) {
        W.location    = el('f-loc').value.trim();
        W.date        = el('f-date').value.trim();
        W.description = el('f-desc').value.trim();
        /* W.fileName уже установлен через onFileChange */
        fillReview();
        goStep(3);
      }
    },

    back() {
      if (W.step > 1) goStep(W.step - 1);
      else            Nav.toHome();
    },

    submit() {
      if (!W.confirmed) return;
      const code = Codegen.generate();

      Store.save({
        code,
        cat:      W.category,
        catLabel: CAT_LABEL[W.category],
        loc:      W.location,
        date:     W.date,
        desc:     W.description,
        status:   'active',
        createdAt: Date.now(),
        events: [{
          time: nowStr(),
          text: 'Обращение зарегистрировано',
          type: 'created',
        }],
        officerMsg: null,
        reply:      null,
      });

      App.refreshStats();
      el('el-code').textContent = code;
      Nav.setSession(code);
      Nav.toConfirm();
    },
  });
})();

/* ─────────────────────────────────────────────
   STATUS
───────────────────────────────────────────── */

const Status = (() => {
  let _code = '';

  function buildTimeline(events, status) {
    return events.map((ev, i) => {
      const last   = i === events.length - 1;
      const dotMod = status === 'closed' ? 'tl-dot--done'
                   : i === 0             ? 'tl-dot--on'   : '';
      return `<li class="tl-row">
        <div class="tl-row__aside">
          <div class="tl-dot ${dotMod}"></div>
          ${last ? '' : '<div class="tl-line"></div>'}
        </div>
        <div class="tl-row__body">
          <p class="tl-row__when">${ev.time}</p>
          <p class="tl-row__what">${ev.text}</p>
        </div>
      </li>`;
    }).join('');
  }

  return Object.freeze({

    /* HTML: onclick="Status.find()" */
    find() {
      const code = el('inp-code').value.trim().toUpperCase();
      if (!code) return;
      const r = Store.find(code);
      if (!r) {
        el('search-err').classList.add('is-show');
        return;
      }
      Status.render(code);
    },

    /* HTML: oninput="Status.clearErr()" */
    clearErr() {
      el('search-err').classList.remove('is-show');
    },

    render(code) {
      const r = Store.find(code);
      if (!r) return;

      _code = code;
      hide('pnl-search');
      show('pnl-result');

      el('topbar-code').textContent = code;
      el('res-title').textContent   = `Обращение ${code}`;

      /* Badge */
      const cfg = BADGE_CFG[r.status] ?? BADGE_CFG.active;
      el('res-badge').className = `badge ${cfg.cls}`;
      el('res-badge-text').textContent = cfg.label;

      /* LAST UPDATED — берём время последнего события */
      const lastEvent = r.events[r.events.length - 1];
      if (lastEvent) {
        el('last-updated').textContent = `Последнее обновление: ${lastEvent.time}`;
      }

      /* Timeline */
      el('tl-history').innerHTML = buildTimeline(r.events, r.status);

      /* States: officer / empty / reply / sent */
      const hasMsg  = Boolean(r.officerMsg);
      const hasReply = hasMsg && !r.reply;
      const replySent = hasMsg && Boolean(r.reply);

      setV('pnl-officer',       hasMsg);
      setV('pnl-empty-officer', !hasMsg && r.status !== 'closed');
      setV('pnl-reply',         hasReply);
      setV('pnl-sent',          replySent);

      if (hasMsg) {
        el('officer-text').textContent = r.officerMsg;
      }

      window.scrollTo({ top: 0, behavior: 'instant' });
    },

    /* HTML: oninput="Status.countChars()" */
    countChars() {
      const ta = el('inp-reply');
      if (ta.value.length > 500) ta.value = ta.value.slice(0, 500);
      el('char-count').textContent = ta.value.length;
    },

    sendReply() {
      const text = el('inp-reply').value.trim();
      if (!text || !_code) return;
      const r = Store.find(_code);
      if (!r) return;

      r.reply = text;
      r.events.push({
        time: nowStr(),
        text: 'Ваш ответ отправлен',
        type: 'reply',
      });
      Store.save(r);

      /* Обновить last-updated */
      el('last-updated').textContent = `Последнее обновление: ${nowStr()}`;

      hide('pnl-reply');
      show('pnl-sent');
    },
  });
})();

/* ─────────────────────────────────────────────
   EXPORTS → window (для onclick в HTML)
───────────────────────────────────────────── */

window.Nav    = Nav;
window.App    = App;
window.Wizard = Wizard;
window.Status = Status;

/* ─────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */

function boot() {
  Demo.init();
  App.refreshStats();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
