/**
 * ГОЛОС — script.js  (fixed)
 * ─────────────────────────────────────────────
 * Все имена методов совпадают с onclick-атрибутами в HTML.
 *
 * Модули:
 *   CONST    — константы
 *   Store    — localStorage façade
 *   Demo     — начальные тестовые данные
 *   Codegen  — генерация уникального кода
 *   Nav      — переключение экранов
 *   App      — статистика, копирование, панель анонимности
 *   Wizard   — логика 3-шаговой формы
 *   Status   — статус обращения + диалог
 *   Boot     — инициализация
 */

'use strict';

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const STORAGE_KEY   = 'golos_v1';
const MIN_DESC_LEN  = 20;
const BASE_ACTIVE   = 8;
const BASE_CLOSED   = 3;

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

const MONTHS = ['янв','фев','мар','апр','мая','июн',
                'июл','авг','сен','окт','ноя','дек'];

/* ─────────────────────────────────────────────
   DOM HELPERS
───────────────────────────────────────────── */

const el  = id  => document.getElementById(id);
const qsa = sel => [...document.querySelectorAll(sel)];

const show = id => el(id).classList.remove('hidden');
const hide = id => el(id).classList.add('hidden');
const setV = (id, on) => el(id).classList.toggle('hidden', !on);

function nowStr() {
  const d  = new Date();
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${hh}:${mm}`;
}

function clip(str, max = 80) {
  return str && str.length > max ? str.slice(0, max) + '…' : (str || '');
}

/* ─────────────────────────────────────────────
   STORE — localStorage façade
   Все операции обёрнуты в try/catch (приватный режим).
───────────────────────────────────────────── */

const Store = (() => {
  const read = () => {
    try   { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  };
  const write = data => {
    try   { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch { /* private browsing — silent fail */ }
  };

  return Object.freeze({
    all()   { return read(); },
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
   DEMO DATA — вставляется один раз при первом визите
───────────────────────────────────────────── */

const Demo = (() => {
  const make = o => Object.assign({
    code:'', cat:'', catLabel:'', loc:'', date:'', desc:'',
    status:'active', createdAt: Date.now(),
    events:[], officerMsg:null, reply:null,
  }, o);

  return Object.freeze({
    init() {
      if (!Store.isEmpty()) return;

      Store.save(make({
        code:'DEMO-0001', cat:'money', catLabel: CAT_LABEL.money,
        loc:'Корпус А, кафедра экономики', date:'12 мая 2026',
        desc:'Преподаватель требует дополнительную оплату за пересдачу.',
        status:'review', createdAt: Date.now() - 86_400_000,
        events:[
          {time:'14 мая 19:32', text:'Обращение принято',  type:'created'  },
          {time:'15 мая 08:14', text:'Назначен омбудсмен', type:'assigned' },
          {time:'15 мая 09:45', text:'Получен вопрос',     type:'question' },
        ],
        officerMsg:'Уточните: это произошло во время официальной пересдачи или в частном порядке?',
      }));

      Store.save(make({
        code:'DEMO-0002', cat:'conflict', catLabel: CAT_LABEL.conflict,
        loc:'Деканат', date:'5 мая 2026',
        desc:'Декан направляет студентов в компанию родственника.',
        status:'closed', createdAt: Date.now() - 172_800_000,
        events:[
          {time:'5 мая 14:00', text:'Обращение принято',           type:'created'  },
          {time:'6 мая 09:00', text:'Назначен омбудсмен',          type:'assigned' },
          {time:'8 мая 16:30', text:'Расследование завершено',     type:'done'     },
          {time:'9 мая 11:00', text:'Меры приняты. Дело закрыто.', type:'closed'   },
        ],
      }));

      Store.save(make({
        code:'DEMO-0003', cat:'pressure', catLabel: CAT_LABEL.pressure,
        loc:'Учебный корпус Б', date:'16 мая 2026',
        desc:'Научный руководитель принуждает включать его в соавторы работы.',
        status:'active', createdAt: Date.now() - 3_600_000,
        events:[{time:'16 мая 18:00', text:'Обращение принято', type:'created'}],
      }));
    },
  });
})();

/* ─────────────────────────────────────────────
   CODEGEN — криптографически случайный код XXXX-NNNN
   Исключены визуально похожие символы: O/0  I/1/l
───────────────────────────────────────────── */

const Codegen = (() => {
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';  /* 24 буквы */
  const NUMS  = '23456789';                   /* 8 цифр   */

  return Object.freeze({
    generate() {
      const buf = new Uint8Array(8);
      (window.crypto || window.msCrypto).getRandomValues(buf);
      const p1 = Array.from(buf.slice(0,4), n => ALPHA[n % ALPHA.length]).join('');
      const p2 = Array.from(buf.slice(4),   n => NUMS [n % NUMS.length ]).join('');
      return `${p1}-${p2}`;
    },
  });
})();

/* ─────────────────────────────────────────────
   NAV — единственный маршрутизатор экранов
───────────────────────────────────────────── */

const Nav = (() => {
  let _sessionCode = null;   /* код последнего отправленного обращения */

  function activate(id) {
    qsa('.screen').forEach(s => s.classList.remove('is-active'));
    el(id).classList.add('is-active');
    window.scrollTo({ top:0, behavior:'instant' });
  }

  return Object.freeze({
    setSession(code) { _sessionCode = code; },
    getSession()     { return _sessionCode;  },

    toHome()   { activate('s-home');    },
    toWizard() { activate('s-wizard');  },
    toConfirm(){ activate('s-confirm'); },

    toStatus() {
      activate('s-status');
      if (_sessionCode) {
        /* Пришли с экрана подтверждения — сразу показываем результат */
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
   APP — глобальные хелперы
───────────────────────────────────────────── */

const App = (() => {
  let _anonOpen = false;   /* состояние панели анонимности */

  return Object.freeze({

    /* Обновить счётчики на главном экране */
    refreshStats() {
      const s = Store.stats();
      el('stat-active').textContent = BASE_ACTIVE + s.active;
      el('stat-closed').textContent = BASE_CLOSED + s.closed;
    },

    /* Переключить панель объяснения анонимности */
    toggleAnonymity() {
      _anonOpen = !_anonOpen;
      setV('anon-panel', _anonOpen);
    },

    /* ── COPY ──────────────────────────────────
       Три уровня fallback:
         1. navigator.clipboard  (HTTPS, современные браузеры)
         2. execCommand('copy')  (HTTP, старые браузеры)
         3. Тихий провал         (clipboard недоступен)
    ─────────────────────────────────────────── */
    copyCode() {
      /* Читаем код НАПРЯМУЮ из DOM — never from a stale variable */
      const codeEl = el('el-code');
      if (!codeEl) return;

      const code = codeEl.textContent.trim();

      /* Защита: не копируем если элемент пустой или содержит заглушку */
      if (!code || code === '\u00a0' || code.startsWith('?')) return;

      const flash = () => App._flashBtn();
      const fallback = () => App._execCopy(code, flash);

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(code).then(flash).catch(fallback);
      } else {
        fallback();
      }
    },

    _flashBtn() {
      const btn  = el('btn-copy');
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
      Object.assign(ta.style, { position:'fixed', left:'-9999px', top:'-9999px', opacity:'0' });
      ta.value    = text;
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
   WIZARD — контроллер 3-шаговой формы
   Все имена методов совпадают с onclick в HTML.
───────────────────────────────────────────── */

const Wizard = (() => {
  /* Мутируемое состояние — сбрасывается при start() */
  const W = {
    step: 1, category: null,
    location: '', date: '', description: '', confirmed: false,
  };

  /* ── Прогресс-бар ── */
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

  /* ── Переключение панелей/футера ── */
  function goStep(n) {
    W.step = n;

    /* Панели */
    for (let i = 1; i <= 3; i++) {
      el(`pane-${i}`).classList.toggle('is-active', i === n);
    }

    /* Строки футера */
    ['wf-1','wf-2','wf-3'].forEach((id, idx) => {
      el(id).classList.toggle('hidden', idx + 1 !== n);
    });

    /* Кнопка «Назад» */
    el('wizard-back').style.visibility = n === 1 ? 'hidden' : 'visible';

    updateProgress(n);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  /* ── Заполнить экран проверки ── */
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
  }

  return Object.freeze({

    /* ── Запустить wizard ── */
    start() {
      Object.assign(W, {
        step:1, category:null,
        location:'', date:'', description:'', confirmed:false,
      });

      qsa('.cat').forEach(b => {
        b.classList.remove('is-selected');
        b.setAttribute('aria-pressed','false');
      });

      ['f-loc','f-date','f-desc'].forEach(id => { el(id).value = ''; });
      el('chk-confirm').checked = false;
      ['btn-next-1','btn-next-2','btn-submit'].forEach(id => {
        el(id).disabled = true;
      });

      goStep(1);
      Nav.toWizard();
    },

    /* ── Выбор категории ──
       HTML вызывает: onclick="Wizard.pickCat(this)"          */
    pickCat(btn) {
      qsa('.cat').forEach(b => {
        b.classList.remove('is-selected');
        b.setAttribute('aria-pressed','false');
      });
      btn.classList.add('is-selected');
      btn.setAttribute('aria-pressed','true');
      W.category = btn.dataset.val;
      el('btn-next-1').disabled = false;
    },

    /* ── Валидация описания ──
       HTML вызывает: oninput="Wizard.checkDesc()"            */
    checkDesc() {
      W.description = el('f-desc').value;
      el('btn-next-2').disabled = W.description.trim().length < MIN_DESC_LEN;
    },

    /* ── Галочка подтверждения ──
       HTML вызывает: onchange="Wizard.checkConfirm()"        */
    checkConfirm() {
      W.confirmed = el('chk-confirm').checked;
      el('btn-submit').disabled = !W.confirmed;
    },

    /* ── Следующий шаг ──
       HTML вызывает: onclick="Wizard.next()"                 */
    next() {
      if (W.step === 1 && W.category) {
        goStep(2);
      } else if (W.step === 2 && W.description.trim().length >= MIN_DESC_LEN) {
        W.location = el('f-loc').value.trim();
        W.date     = el('f-date').value.trim();
        W.description = el('f-desc').value.trim();
        fillReview();
        goStep(3);
      }
    },

    /* ── Назад ── */
    back() {
      if (W.step > 1) goStep(W.step - 1);
      else            Nav.toHome();
    },

    /* ── Отправить обращение ── */
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
        events: [{ time: nowStr(), text: 'Обращение принято', type: 'created' }],
        officerMsg: null,
        reply:      null,
      });

      App.refreshStats();

      /* ВАЖНО: устанавливаем код в DOM ДО навигации */
      el('el-code').textContent = code;
      Nav.setSession(code);
      Nav.toConfirm();
    },
  });
})();

/* ─────────────────────────────────────────────
   STATUS — отслеживание + анонимный диалог
───────────────────────────────────────────── */

const Status = (() => {
  let _code = '';   /* код открытого на экране обращения */

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

    /* ── Поиск по коду ──
       HTML вызывает: onclick="Status.find()"                */
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

    /* ── Сбросить ошибку ──
       HTML вызывает: oninput="Status.clearErr()"           */
    clearErr() {
      el('search-err').classList.remove('is-show');
    },

    /* ── Отрисовать результат ── */
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

      /* Timeline */
      el('tl-history').innerHTML = buildTimeline(r.events, r.status);

      /* Officer message */
      const hasMsg = Boolean(r.officerMsg);
      setV('pnl-officer', hasMsg);
      if (hasMsg) el('officer-text').textContent = r.officerMsg;

      /* Reply panels */
      setV('pnl-reply', hasMsg && !r.reply);
      setV('pnl-sent',  hasMsg && Boolean(r.reply));

      window.scrollTo({ top:0, behavior:'instant' });
    },

    /* ── Счётчик символов ──
       HTML вызывает: oninput="Status.countChars()"         */
    countChars() {
      const ta = el('inp-reply');
      if (ta.value.length > 500) ta.value = ta.value.slice(0, 500);
      el('char-count').textContent = ta.value.length;
    },

    /* ── Отправить ответ ── */
    sendReply() {
      const text = el('inp-reply').value.trim();
      if (!text || !_code) return;

      const r = Store.find(_code);
      if (!r) return;

      r.reply = text;
      r.events.push({ time: nowStr(), text: 'Ваш ответ отправлен', type:'reply' });
      Store.save(r);

      hide('pnl-reply');
      show('pnl-sent');
    },
  });
})();

/* ─────────────────────────────────────────────
   GLOBAL EXPORTS
   Все объекты экспортируются на window,
   чтобы onclick-атрибуты в HTML работали.
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
