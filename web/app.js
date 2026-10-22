/* app.js - CareBridge web interface.
 *
 * Talks to the C++ JSON API (src/server.cpp) when it is running, and to the
 * browser-only demo engine (demo-api.js) on static hosting such as GitHub
 * Pages. No external libraries, no build step.
 *
 * Academic prototype: sample data only - never store real medical data.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------- helpers
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ESCAPES[c]; });
  }
  function initials(name) {
    var parts = String(name || '?').replace(/^Dr\.?\s*/i, '').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function prettyDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function longToday() {
    return new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function firstName(name) { return String(name || '').replace(/^Dr\.?\s*/i, '').split(/\s+/)[0]; }

  // --------------------------------------------------------------- icons
  var ICONS = {
    cross: '<path d="M12 5v14M5 12h14"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    stethoscope: '<path d="M5 3v5a4 4 0 0 0 8 0V3"/><path d="M9 12v3a4 4 0 0 0 8 0v-1"/><circle cx="19" cy="10" r="2"/>',
    hospital: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M12 9v6M9 12h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.6" cy="6" r="1.1"/><circle cx="3.6" cy="12" r="1.1"/><circle cx="3.6" cy="18" r="1.1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3"/><path d="M21 3.5V9h-5.5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m4.5 12.5 5 5L20 7"/>',
    alert: '<path d="M12 8.5v5"/><circle cx="12" cy="16.8" r=".7"/><path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.8 3h15.4a2 2 0 0 0 1.8-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    heart: '<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    shield: '<path d="M12 3 4.5 6v6c0 5 3.2 7.7 7.5 9 4.3-1.3 7.5-4 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>',
    inbox: '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5.5 5h13l1.5 8v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4z"/>'
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || 'ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  }

  // ---------------------------------------------------------------- state
  var state = {
    user: null,
    token: sessionStorage.getItem('cb.token') || '',
    mode: 'checking',          // server | demo
    view: '',
    theme: localStorage.getItem('cb.theme') || 'light',
    auth: { form: 'login', role: 'patient', error: '', busy: false, info: '' },
    cache: {}
  };
  var modalState = { time: null, urgent: false, doctor: null };

  // ------------------------------------------------------------ api layer
  var Demo = window.CareBridgeDemo;

  function normalisePath(path) {
    return path.charAt(0) === '/' ? path : '/' + path;
  }

  async function detectEngine() {
    try {
      var res = await fetch('api/health', { headers: { accept: 'application/json' }, cache: 'no-store' });
      var type = res.headers.get('content-type') || '';
      if (!res.ok || type.indexOf('json') === -1) throw new Error('no api');
      var data = await res.json();
      state.mode = data.engine === 'cpp' ? 'server' : 'demo';
    } catch (e) {
      state.mode = Demo ? 'demo' : 'offline';
    }
  }

  async function request(method, path, body) {
    if (state.mode === 'demo') {
      if (!Demo) throw new Error('The demo engine failed to load.');
      try {
        return Demo.handle(method, normalisePath(path), body || {}, state.token);
      } catch (e) {
        throw new Error(e && e.message ? e.message : 'Request failed.');
      }
    }
    var opts = { method: method, headers: {}, cache: 'no-store' };
    if (state.token) opts.headers['x-token'] = state.token;
    if (method === 'POST') {
      opts.headers['content-type'] = 'application/x-www-form-urlencoded';
      opts.body = new URLSearchParams(body || {}).toString();
    }
    var res;
    try { res = await fetch(path, opts); }
    catch (e) { throw new Error('Cannot reach the CareBridge server. Is it running?'); }
    var type = res.headers.get('content-type') || '';
    if (type.indexOf('json') === -1) throw new Error('The CareBridge server is not responding correctly.');
    var data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || 'Request failed.');
    return data;
  }

  // ------------------------------------------------------- toast / modal
  function toast(message, kind) {
    var host = $('#toasts');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.innerHTML = icon(kind === 'err' ? 'alert' : kind === 'ok' ? 'check' : 'heart') + '<span>' + esc(message) + '</span>';
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(function () { el.remove(); }, 260);
    }, 3600);
  }

  function closeModal() {
    var root = $('#modal-root');
    if (root) root.innerHTML = '';
  }

  function openModal(opts) {
    var root = $('#modal-root');
    if (!root) return;
    root.innerHTML =
      '<div class="overlay" data-overlay="1">' +
        '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
          '<div class="head">' +
            '<div>' +
              '<h3>' + esc(opts.title) + '</h3>' +
              (opts.subtitle ? '<div class="muted small">' + esc(opts.subtitle) + '</div>' : '') +
            '</div>' +
            '<button class="icon-btn" data-act="close-modal" aria-label="Close">' + icon('x') + '</button>' +
          '</div>' +
          '<form id="modal-form" novalidate>' + (opts.body || '') +
            '<div class="foot">' + (opts.footer || '') + '</div>' +
          '</form>' +
        '</div>' +
      '</div>';
  }

  function field(id, label, opts) {
    opts = opts || {};
    var input = opts.textarea
      ? '<textarea class="input" id="' + id + '"' + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
        (opts.required ? ' required' : '') + '>' + esc(opts.value || '') + '</textarea>'
      : '<input class="input" id="' + id + '" type="' + (opts.type || 'text') + '"' +
        (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
        (opts.value ? ' value="' + esc(opts.value) + '"' : '') +
        (opts.required ? ' required' : '') + (opts.autocomplete ? ' autocomplete="' + opts.autocomplete + '"' : '') + '>';
    return '<label class="f" for="' + id + '">' + esc(label) + '</label>' + input;
  }

  function urgentSwitch(on, id) {
    return '<div class="switch' + (on ? ' on' : '') + '" id="' + (id || 'urgent-switch') + '" data-act="toggle-urgent" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" tabindex="0">' +
      '<span class="tg"></span>' +
      '<div><b>Urgent case</b><div class="muted small">Urgent patients are seen first by the doctor.</div></div>' +
    '</div>';
  }

  // ------------------------------------------------------------- rendering
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
  }

  function render() {
    var app = $('#app');
    if (!app) return;
    if (!state.user) { renderAuth(app); return; }
    renderShell(app);
  }

  // ------------------------------------------------------------- auth view
  function renderAuth(app) {
    var a = state.auth;
    var register = a.form === 'register';
    if (register) a.role = 'patient';

    var tabs =
      '<div class="tabs" role="tablist">' +
        '<button type="button" role="tab" data-act="auth-role" data-role="patient" class="' + (a.role === 'patient' ? 'on' : '') + '">' + icon('user') + ' Patient</button>' +
        '<button type="button" role="tab" data-act="auth-role" data-role="doctor" class="' + (a.role === 'doctor' ? 'on' : '') + '"' + (register ? ' disabled' : '') + '>' + icon('stethoscope') + ' Doctor</button>' +
      '</div>';

    var fields = register
      ? field('auth-name', 'Full name', { placeholder: 'e.g. Asha Negi', required: true, autocomplete: 'name' }) +
        '<div class="row" style="gap:12px;align-items:flex-start">' +
          '<div class="grow">' + field('auth-age', 'Age', { type: 'number', placeholder: '24', required: true }) + '</div>' +
          '<div class="grow">' + field('auth-city', 'City', { placeholder: 'Dehradun', required: true }) + '</div>' +
        '</div>' +
        field('auth-password', 'Password', { type: 'password', placeholder: 'at least 4 characters', required: true, autocomplete: 'new-password' })
      : field('auth-id', 'Your ID', { placeholder: a.role === 'doctor' ? 'e.g. D001' : 'e.g. P001', required: true, autocomplete: 'username' }) +
        field('auth-password', 'Password', { type: 'password', placeholder: 'Your password', required: true, autocomplete: 'current-password' });

    var chips = register ? '' :
      '<div class="chips">' +
        '<button type="button" class="chip" data-act="fill-demo" data-id="P001" data-pw="pat123" data-role="patient">P001 / pat123 (patient)</button>' +
        '<button type="button" class="chip" data-act="fill-demo" data-id="D001" data-pw="doc123" data-role="doctor">D001 / doc123 (doctor)</button>' +
      '</div>';

    app.innerHTML =
      '<div class="auth">' +
        '<section class="hero">' +
          '<div class="brand"><span class="logo">' + icon('cross') + '</span> CareBridge</div>' +
          '<h1>Healthcare support for better diagnosis</h1>' +
          '<p class="lead">Book with the right doctor, skip the queue when it matters, and keep every diagnosis in one clear timeline.</p>' +
          '<div class="feature"><span class="bub">' + icon('hospital') + '</span><div><b>Find care that is actually near you</b><span>Browse hospitals in your city and search by name or specialization.</span></div></div>' +
          '<div class="feature"><span class="bub">' + icon('clock') + '</span><div><b>Urgent cases go first</b><span>A priority queue puts urgent patients at the front and a waiting list fills cancelled slots automatically.</span></div></div>' +
          '<div class="feature"><span class="bub">' + icon('file') + '</span><div><b>One health-record timeline</b><span>Every consultation writes a record your doctor can update - and undo.</span></div></div>' +
        '</section>' +
        '<section class="auth-side">' +
          '<form class="auth-card" id="auth-form" novalidate>' +
            '<h2>' + (register ? 'Create your account' : 'Welcome back') + '</h2>' +
            '<p class="muted small" style="margin:6px 0 0">' +
              (register ? 'Register as a patient to book appointments.' : 'Sign in to continue to your ' + (a.role === 'doctor' ? 'doctor' : 'patient') + ' workspace.') +
            '</p>' +
            tabs +
            fields +
            '<div class="error-text" id="auth-error">' + esc(a.error) + '</div>' +
            '<button class="btn primary block" type="submit"' + (a.busy ? ' disabled' : '') + '>' +
              (a.busy ? 'Please wait...' : register ? 'Create account' : 'Sign in') + '</button>' +
            chips +
            '<p class="muted small mt">' +
              (register
                ? 'Already registered? <button type="button" class="link" data-act="auth-form" data-form="login">Sign in</button>'
                : 'New patient? <button type="button" class="link" data-act="auth-form" data-form="register">Create an account</button>') +
            '</p>' +
            (state.mode === 'demo'
              ? '<p class="muted small">Static demo: accounts and bookings are stored only in this browser.</p>'
              : '') +
          '</form>' +
        '</section>' +
      '</div>';
  }

  function authError(message) {
    state.auth.error = message;
    var box = $('#auth-error');
    if (box) box.textContent = message;
  }

  // ------------------------------------------------------------ app shell
  var NAV = {
    patient: [
      { view: 'overview', label: 'Overview', icon: 'heart' },
      { view: 'find-care', label: 'Find care', icon: 'search' },
      { view: 'appointments', label: 'Appointments', icon: 'calendar', count: 'appointments' },
      { view: 'records', label: 'Health records', icon: 'file' }
    ],
    doctor: [
      { view: 'overview', label: 'Overview', icon: 'heart' },
      { view: 'queue', label: 'Queue', icon: 'list', count: 'queue' },
      { view: 'slots', label: 'My slots', icon: 'clock' },
      { view: 'appointments', label: 'Appointments', icon: 'calendar' },
      { view: 'patients', label: 'Patients', icon: 'users' }
    ]
  };
  var TITLES = {
    overview: 'Overview',
    'find-care': 'Find care',
    appointments: 'Appointments',
    records: 'Health records',
    queue: 'Patient queue',
    slots: 'My slots',
    patients: 'Patients'
  };

  function renderShell(app) {
    var role = state.user.role;
    var nav = NAV[role] || NAV.patient;
    if (!state.view || !nav.some(function (n) { return n.view === state.view; })) {
      state.view = routeFromHash(nav) || nav[0].view;
    }

    var navHtml = nav.map(function (item) {
      return '<button type="button" data-act="nav" data-view="' + item.view + '" class="' + (state.view === item.view ? 'on' : '') + '">' +
        icon(item.icon) + '<span class="t">' + esc(item.label) + '</span>' +
        (item.count ? '<span class="count" data-count="' + item.count + '" hidden>0</span>' : '') +
      '</button>';
    }).join('');

    var subtitle = role === 'doctor'
      ? state.user.id + ' \u00b7 ' + (state.user.specialization || 'Doctor')
      : state.user.id + ' \u00b7 Patient';

    app.innerHTML =
      '<div class="shell">' +
        '<aside class="sidebar">' +
          '<div class="brand"><span class="logo">' + icon('cross') + '</span> CareBridge</div>' +
          '<nav class="nav" aria-label="Main">' +
            '<div class="label">' + (role === 'doctor' ? 'Doctor workspace' : 'Patient workspace') + '</div>' +
            navHtml +
          '</nav>' +
          '<div class="me">' +
            '<div class="avatar">' + esc(initials(state.user.name)) + '</div>' +
            '<div class="who"><b>' + esc(state.user.name) + '</b><span>' + esc(subtitle) + '</span></div>' +
          '</div>' +
          '<button type="button" class="btn ghost block logout" data-act="logout">' + icon('logout') + '<span class="t">Log out</span></button>' +
        '</aside>' +
        '<div class="main">' +
          '<header class="topbar">' +
            '<h1>' + esc(TITLES[state.view] || 'CareBridge') + '</h1>' +
            '<div class="row">' +
              '<span class="date-chip">' + esc(longToday()) + '</span>' +
              '<button type="button" class="icon-btn" data-act="theme" aria-label="Toggle dark mode" title="Toggle dark mode">' +
                icon(state.theme === 'dark' ? 'sun' : 'moon') + '</button>' +
              '<button type="button" class="icon-btn" data-act="reload" aria-label="Refresh" title="Refresh">' + icon('refresh') + '</button>' +
            '</div>' +
          '</header>' +
          '<div class="content">' +
            (state.mode === 'demo'
              ? '<div class="card small" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;border-style:dashed;margin-bottom:18px">' +
                  icon('alert') +
                  '<span class="grow">Static demo mode - the C++ server is not reachable, so data is saved in this browser only.</span>' +
                  '<button type="button" class="btn sm ghost" data-act="reset-demo">Reset demo data</button>' +
                '</div>'
              : (state.mode === 'offline'
                ? '<div class="card small" style="display:flex;gap:12px;align-items:center;border-style:dashed;margin-bottom:18px">' + icon('alert') +
                  '<span>The interface loaded but no data engine is available. Start the C++ server (./carebridge_web) and reload.</span></div>'
                : '')) +
            '<div id="view"><div class="loader"><div class="spin"></div></div></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    loadView();
  }

  function routeFromHash(nav) {
    var raw = location.hash.replace(/^#\/?/, '');
    return nav.some(function (n) { return n.view === raw; }) ? raw : '';
  }

  function setView(html) {
    var host = $('#view');
    if (host) host.innerHTML = html;
  }

  async function loadView() {
    if (!state.user) return;
    var entry = VIEWS[state.view];
    if (!entry) { setView(emptyState('inbox', 'Page not found', 'Pick a page from the sidebar.')); return; }
    setView('<div class="loader"><div class="spin"></div></div>');
    try {
      var result = await entry();
      setView(result.html);
      if (result.after) result.after();
      refreshCounts();
    } catch (e) {
      setView('<div class="empty">' + icon('alert') + '<b>Could not load this page</b><span>' + esc(e.message) + '</span></div>' +
        '<div class="row mt"><button class="btn primary sm" data-act="reload">Try again</button></div>');
    }
  }

  async function refreshCounts() {
    try {
      if (state.user.role === 'patient') {
        var mine = await request('GET', 'api/appointments');
        setCount('appointments', mine.appointments.filter(function (a) { return a.status === 'pending'; }).length);
      } else {
        var q = await request('GET', 'api/queue');
        setCount('queue', q.queue.length);
      }
    } catch (e) { /* badges are cosmetic */ }
  }

  function setCount(key, value) {
    var el = document.querySelector('[data-count="' + key + '"]');
    if (!el) return;
    el.textContent = String(value);
    el.hidden = !value;
  }

  // ------------------------------------------------------- shared snippets
  function emptyState(iconName, title, text) {
    return '<div class="empty">' + icon(iconName) + '<b>' + esc(title) + '</b><span>' + esc(text) + '</span></div>';
  }

  function statusBadge(status) {
    return '<span class="badge ' + status + '">' + esc(status.charAt(0).toUpperCase() + status.slice(1)) + '</span>';
  }

  function urgentBadge(isUrgent) {
    return isUrgent ? '<span class="badge urgent">' + icon('alert', 'ic') + 'Urgent</span>' : '';
  }

  function statCard(tone, iconName, value, label) {
    return '<div class="stat"><div class="bub ' + tone + '">' + icon(iconName) + '</div>' +
      '<div><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div></div>';
  }

  function recordFacts(record) {
    return '<div class="facts">' +
      '<div class="fact"><small>Symptoms</small>' + esc(record.symptoms || '-') + '</div>' +
      '<div class="fact"><small>Tests</small>' + esc(record.tests || '-') + '</div>' +
      '<div class="fact"><small>Follow-up</small>' + esc(record.followUp || '-') + '</div>' +
    '</div>';
  }

  function appointmentItem(a, options) {
    options = options || {};
    return '<div class="item' + (a.urgent ? ' urgent' : '') + '">' +
      '<div class="time">' + esc(a.time) + '</div>' +
      '<div class="grow">' +
        '<div class="row wrap" style="gap:8px">' +
          '<h4>' + esc(options.doctorView ? a.patient : a.doctor) + '</h4>' +
          statusBadge(a.status) + urgentBadge(a.urgent) +
        '</div>' +
        '<div class="muted small">' +
          esc(options.doctorView ? 'Age ' + a.patientAge + ' \u00b7 ' + a.patientId : a.specialization + ' \u00b7 ' + a.hospital) +
        '</div>' +
        (a.symptoms ? '<div class="sym">' + esc(a.symptoms) + '</div>' : '') +
      '</div>' +
      (options.action || '') +
    '</div>';
  }

  // ------------------------------------------------------------- views
  var VIEWS = {};

  // ---- patient: overview
  VIEWS.overview = async function () {
    if (state.user.role === 'doctor') return doctorOverview();

    var results = await Promise.all([
      request('GET', 'api/appointments'),
      request('GET', 'api/records'),
      request('GET', 'api/doctors'),
      request('GET', 'api/hospitals')
    ]);
    var appointments = results[0].appointments;
    var records = results[1].records;
    var doctors = results[2].doctors;
    var hospitals = results[3].hospitals;

    var pending = appointments.filter(function (a) { return a.status === 'pending'; })
      .slice().sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
    var nearby = hospitals.filter(function (h) { return h.nearby; });
    var freeNow = doctors.reduce(function (sum, d) { return sum + d.freeSlots; }, 0);
    var next = pending[0];

    var html =
      '<div class="banner">' +
        '<h2>Hi ' + esc(firstName(state.user.name)) + '</h2>' +
        '<p>' + (pending.length
          ? 'You have ' + pending.length + ' upcoming appointment' + (pending.length === 1 ? '' : 's') + '. Your next visit is at ' + esc(next.time) + ' with ' + esc(next.doctor) + '.'
          : 'No upcoming visits. Find a doctor near you and book a slot in a couple of clicks.') + '</p>' +
        '<button class="btn" data-act="nav" data-view="find-care">' + icon('search') + 'Find care</button>' +
      '</div>' +
      '<div class="stats">' +
        statCard('teal', 'calendar', pending.length, 'Upcoming appointments') +
        statCard('blue', 'hospital', nearby.length, 'Hospitals in ' + (state.user.city || 'your city')) +
        statCard('green', 'stethoscope', freeNow, 'Free slots available') +
        statCard('amber', 'file', records.length, 'Health records') +
      '</div>' +
      '<div class="cols">' +
        '<div class="card">' +
          '<h3>Next appointment</h3>' +
          (next
            ? '<div class="item' + (next.urgent ? ' urgent' : '') + '">' +
                '<div class="time">' + esc(next.time) + '</div>' +
                '<div class="grow"><div class="row wrap" style="gap:8px"><h4>' + esc(next.doctor) + '</h4>' + urgentBadge(next.urgent) + '</div>' +
                  '<div class="muted small">' + esc(next.specialization) + ' \u00b7 ' + esc(next.hospital) + '</div>' +
                  '<div class="sym">' + esc(next.symptoms) + '</div></div>' +
              '</div>' +
              '<div class="row mt">' +
                '<button class="btn sm" data-act="nav" data-view="appointments">All appointments</button>' +
                '<button class="btn sm danger" data-act="cancel-appt" data-id="' + next.id + '">Cancel</button>' +
              '</div>'
            : emptyState('calendar', 'Nothing booked yet', 'Pick a doctor and a time that works for you.')) +
        '</div>' +
        '<div class="card">' +
          '<h3>Hospitals near you</h3>' +
          (nearby.length
            ? '<div class="list">' + nearby.map(function (h) {
                return '<div class="row between"><div><b>' + esc(h.name) + '</b><div class="muted small">' + esc(h.city) +
                  ' \u00b7 ' + h.doctors + ' doctor' + (h.doctors === 1 ? '' : 's') + '</div></div>' +
                  '<span class="badge near">' + icon('hospital', 'ic') + 'Nearby</span></div>';
              }).join('') + '</div>'
            : emptyState('hospital', 'No hospitals in your city', 'Ask the front desk to add one, or browse all doctors.')) +
        '</div>' +
      '</div>' +
      '<div class="card mt">' +
        '<h3>Recent health records</h3>' +
        (records.length
          ? '<div class="timeline">' + records.slice(0, 3).map(function (r) {
              return '<div class="tl"><div class="card">' +
                '<div class="row between wrap"><b>' + esc(r.diagnosis || 'Consultation') + '</b>' +
                '<span class="muted small">' + esc(prettyDate(r.date)) + '</span></div>' +
                '<div class="muted small">' + esc(r.doctor) + ' \u00b7 record #' + r.id + '</div>' +
                recordFacts(r) +
              '</div></div>';
            }).join('') + '</div>'
          : emptyState('file', 'No records yet', 'A record is created every time a doctor completes a consultation.')) +
      '</div>';

    return { html: html };
  };

  // ---- patient: find care
  async function findCare() {
    var results = await Promise.all([request('GET', 'api/doctors'), request('GET', 'api/hospitals')]);
    state.cache.doctors = results[0].doctors;
    state.cache.hospitals = results[1].hospitals;

    var html =
      '<div class="page-head">' +
        '<div class="search">' + icon('search') +
          '<input class="input" id="doc-search" type="search" placeholder="Search by doctor name or specialization" aria-label="Search doctors">' +
        '</div>' +
        '<button class="btn ghost sm" data-act="reload">' + icon('refresh') + 'Refresh</button>' +
      '</div>' +
      '<div class="pill-row" id="hosp-pills" style="margin-bottom:18px"></div>' +
      '<div class="grid" id="doctor-grid"></div>';

    function renderDoctors() {
      var grid = $('#doctor-grid');
      var pills = $('#hosp-pills');
      if (!grid || !pills) return;
      var query = ($('#doc-search') && $('#doc-search').value || '').trim().toLowerCase();
      var activeHospital = state.cache.hospital || '';

      pills.innerHTML =
        '<button class="pill' + (activeHospital ? '' : ' on') + '" data-act="filter-hospital" data-id="">All hospitals <small>' +
          state.cache.doctors.length + '</small></button>' +
        state.cache.hospitals.map(function (h) {
          var count = state.cache.doctors.filter(function (d) { return d.hospitalId === h.id; }).length;
          return '<button class="pill' + (activeHospital === h.id ? ' on' : '') + '" data-act="filter-hospital" data-id="' + esc(h.id) + '">' +
            esc(h.name) + (h.nearby ? ' \u00b7 nearby' : '') + ' <small>' + count + '</small></button>';
        }).join('');

      var list = state.cache.doctors.filter(function (d) {
        if (activeHospital && d.hospitalId !== activeHospital) return false;
        if (!query) return true;
        return (d.name + ' ' + d.specialization + ' ' + d.hospital).toLowerCase().indexOf(query) !== -1;
      });

      grid.innerHTML = list.length ? list.map(doctorCard).join('')
        : '<div style="grid-column:1/-1">' + emptyState('search', 'No doctors match', 'Try another name, specialization or hospital.') + '</div>';
    }

    function doctorCard(d) {
      var total = d.slots.length;
      var free = d.freeSlots;
      var pct = total ? Math.round((free / total) * 100) : 0;
      return '<article class="card doc-card">' +
        '<div class="row">' +
          '<div class="avatar">' + esc(initials(d.name)) + '</div>' +
          '<div class="grow"><b>' + esc(d.name) + '</b><div class="muted small">' + esc(d.specialization) + '</div></div>' +
          (free ? '<span class="badge near">' + free + ' free</span>' : '<span class="badge cancelled">Full</span>') +
        '</div>' +
        '<div class="meta">' + icon('hospital') + esc(d.hospital) + '</div>' +
        '<div>' +
          '<div class="row between small"><span class="muted">Today\'s slots</span><b>' + free + ' / ' + total + ' free</b></div>' +
          '<div class="meter mt-s"><i style="width:' + pct + '%"></i></div>' +
        '</div>' +
        '<div class="row between">' +
          '<span class="muted small">' + (d.waiting ? d.waiting + ' on waiting list' : 'No waiting list') + '</span>' +
          (free
            ? '<button class="btn primary sm" data-act="book" data-doctor="' + esc(d.id) + '">' + icon('calendar') + 'Book</button>'
            : '<button class="btn sm" data-act="waitlist" data-doctor="' + esc(d.id) + '">' + icon('clock') + 'Join waiting list</button>') +
        '</div>' +
      '</article>';
    }

    return {
      html: html,
      after: function () {
        renderDoctors();
        var input = $('#doc-search');
        if (input) input.addEventListener('input', renderDoctors);
        var pills = $('#hosp-pills');
        if (pills) {
          pills.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-act="filter-hospital"]');
            if (!btn) return;
            state.cache.hospital = btn.getAttribute('data-id');
            renderDoctors();
          });
        }
      }
    };
  }

  // ---- patient: appointments
  async function patientAppointments() {
    var data = await request('GET', 'api/appointments');
    var list = data.appointments;
    var pending = list.filter(function (a) { return a.status === 'pending'; });

    var html = pending.length
      ? '<div class="card"><h3>Upcoming (' + pending.length + ')</h3><div class="list">' +
          pending.map(function (a) {
            return appointmentItem(a, {
              action: '<button class="btn sm danger" data-act="cancel-appt" data-id="' + a.id + '">Cancel</button>'
            });
          }).join('') + '</div></div>'
      : '<div class="card">' + emptyState('calendar', 'No upcoming appointments', 'Head to Find care to book a slot.') +
        '<div class="row" style="justify-content:center"><button class="btn primary sm" data-act="nav" data-view="find-care">Find care</button></div></div>';

    var past = list.filter(function (a) { return a.status !== 'pending'; });
    if (past.length) {
      html += '<div class="card mt"><h3>Past appointments</h3>' +
        '<div class="list">' + past.map(function (a) { return appointmentItem(a); }).join('') + '</div></div>';
    }
    return { html: html };
  }

  // ---- patient: health records
  async function patientRecords() {
    var data = await request('GET', 'api/records');
    var records = data.records;
    var html = '<div class="page-head"><div><h2 style="font-size:20px">Your health timeline</h2>' +
      '<div class="muted small">' + records.length + ' record' + (records.length === 1 ? '' : 's') + ', newest first</div></div>' +
      '<button class="btn ghost sm" data-act="reload">' + icon('refresh') + 'Refresh</button></div>';
    html += records.length
      ? '<div class="timeline">' + records.map(function (r) {
          return '<div class="tl"><div class="card">' +
            '<div class="row between wrap"><h3 style="margin:0">' + esc(r.diagnosis || 'Consultation') + '</h3>' +
            '<span class="muted small">' + esc(prettyDate(r.date)) + '</span></div>' +
            '<div class="muted small">' + esc(r.doctor) + ' \u00b7 ' + esc(r.doctorId) + ' \u00b7 record #' + r.id + '</div>' +
            recordFacts(r) +
          '</div></div>';
        }).join('') + '</div>'
      : emptyState('file', 'No records yet', 'After a consultation your doctor writes the diagnosis here.');
    return { html: html };
  }

  // ---- doctor: overview
  async function doctorOverview() {
    var results = await Promise.all([request('GET', 'api/queue'), request('GET', 'api/slots')]);
    var queue = results[0].queue;
    state.cache.queue = queue;
    var slots = results[1].slots;
    var waiting = results[1].waiting;
    var free = slots.filter(function (s) { return !s.booked; }).length;
    var urgent = queue.filter(function (a) { return a.urgent; }).length;
    var next = queue[0];

    var html =
      '<div class="banner">' +
        '<h2>' + (next ? 'Next up: ' + esc(next.patient) : 'Your queue is clear') + '</h2>' +
        '<p>' + (next
          ? esc(next.time) + ' \u00b7 ' + esc(next.symptoms || 'no symptoms noted') + '. Urgent cases are always moved to the front.'
          : 'No pending appointments. Open new slots so patients can book you.') + '</p>' +
        (next
          ? '<button class="btn" data-act="consult" data-id="' + next.id + '">' + icon('stethoscope') + 'Start consultation</button>'
          : '<button class="btn" data-act="nav" data-view="slots">' + icon('plus') + 'Manage slots</button>') +
      '</div>' +
      '<div class="stats">' +
        statCard('teal', 'list', queue.length, 'Patients waiting') +
        statCard('red', 'alert', urgent, 'Urgent cases') +
        statCard('green', 'clock', free, 'Free slots') +
        statCard('amber', 'users', waiting, 'On waiting list') +
      '</div>' +
      '<div class="cols">' +
        '<div class="card next-card">' +
          '<h3>Priority queue</h3>' +
          (queue.length
            ? '<div class="list">' + queue.slice(0, 4).map(function (a, i) {
                return '<div class="item' + (a.urgent ? ' urgent' : '') + '">' +
                  '<div class="rank">' + (i + 1) + '</div>' +
                  '<div class="grow"><div class="row wrap" style="gap:8px"><h4>' + esc(a.patient) + '</h4>' + urgentBadge(a.urgent) + '</div>' +
                  '<div class="muted small">' + esc(a.time) + ' \u00b7 ' + esc(a.patientId) + ' \u00b7 age ' + a.patientAge + '</div>' +
                  '<div class="sym">' + esc(a.symptoms) + '</div></div>' +
                  '<button class="btn primary sm" data-act="consult" data-id="' + a.id + '">Consult</button>' +
                '</div>';
              }).join('') + '</div>' +
              (queue.length > 4 ? '<button class="btn ghost sm mt" data-act="nav" data-view="queue">See all ' + queue.length + ' patients</button>' : '')
            : emptyState('check', 'All caught up', 'New bookings will appear here, urgent ones first.')) +
        '</div>' +
        '<div class="card">' +
          '<h3>Your slots</h3>' +
          (slots.length
            ? '<div class="slots">' + slots.map(function (s) {
                return '<div class="slot ' + (s.booked ? 'booked' : 'free') + '">' + esc(s.time) +
                  '<small>' + (s.booked ? 'booked' : 'free') + '</small></div>';
              }).join('') + '</div>' +
              '<button class="btn sm mt" data-act="nav" data-view="slots">' + icon('clock') + 'Manage slots</button>'
            : emptyState('clock', 'No slots open', 'Open a time so patients can book you.')) +
        '</div>' +
      '</div>';

    return { html: html };
  }

  // ---- doctor: queue
  async function doctorQueue() {
    var data = await request('GET', 'api/queue');
    var queue = data.queue;
    state.cache.queue = queue;
    var html = '<div class="page-head">' +
      '<div><h2 style="font-size:20px">Priority queue</h2><div class="muted small">' +
        queue.length + ' pending \u00b7 ' + data.urgent + ' urgent \u00b7 ' + data.waiting + ' on the waiting list</div></div>' +
      '<button class="btn ghost sm" data-act="reload">' + icon('refresh') + 'Refresh</button></div>';

    html += queue.length
      ? '<div class="list">' + queue.map(function (a, i) {
          return '<div class="item' + (a.urgent ? ' urgent' : '') + '">' +
            '<div class="rank">' + (i + 1) + '</div>' +
            '<div class="grow">' +
              '<div class="row wrap" style="gap:8px"><h4>' + esc(a.patient) + '</h4>' + urgentBadge(a.urgent) + '</div>' +
              '<div class="muted small">' + esc(a.time) + ' \u00b7 ' + esc(a.patientId) + ' \u00b7 age ' + a.patientAge + '</div>' +
              '<div class="sym">' + esc(a.symptoms) + '</div>' +
            '</div>' +
            '<button class="btn primary sm" data-act="consult" data-id="' + a.id + '">' + icon('stethoscope') + 'Consult</button>' +
          '</div>';
        }).join('') + '</div>'
      : emptyState('check', 'Queue is empty', 'New appointments will show up here, urgent ones first.');
    return { html: html };
  }

  // ---- doctor: slots
  async function doctorSlots() {
    var data = await request('GET', 'api/slots');
    var slots = data.slots;
    var free = slots.filter(function (s) { return !s.booked; }).length;

    var html = '<div class="cols">' +
      '<div class="card"><h3>Today\'s slots</h3>' +
        '<p class="muted small" style="margin-top:-6px">' + free + ' of ' + slots.length + ' available. Click the x on a free slot to close it.</p>' +
        (slots.length
          ? '<div class="slots">' + slots.map(function (s) {
              return '<div class="slot ' + (s.booked ? 'booked' : 'free') + '">' + esc(s.time) +
                '<small>' + (s.booked ? 'booked' : 'free') + '</small>' +
                (s.booked ? '' : '<span class="x" role="button" tabindex="0" aria-label="Close slot ' + esc(s.time) + '" ' +
                  'data-act="close-slot" data-time="' + esc(s.time) + '">' + icon('x') + '</span>') +
              '</div>';
            }).join('') + '</div>'
          : emptyState('clock', 'No slots open', 'Open your first slot with the form on the right.')) +
      '</div>' +
      '<div class="card"><h3>Open a new slot</h3>' +
        '<form id="slot-form" novalidate>' +
          field('slot-time', 'Time (24h)', { placeholder: '15:30', required: true }) +
          '<button class="btn primary block mt" type="submit">' + icon('plus') + 'Open slot</button>' +
        '</form>' +
        '<p class="muted small mt">' + data.waiting + ' patient' + (data.waiting === 1 ? '' : 's') +
        ' on the waiting list. The first one is booked automatically when a slot frees up.</p>' +
      '</div>' +
    '</div>';
    return { html: html };
  }

  // ---- doctor: appointment history
  async function doctorAppointments() {
    var data = await request('GET', 'api/appointments');
    var list = data.appointments;
    var html = '<div class="page-head"><div><h2 style="font-size:20px">Appointment history</h2>' +
      '<div class="muted small">' + list.length + ' total</div></div>' +
      '<button class="btn ghost sm" data-act="reload">' + icon('refresh') + 'Refresh</button></div>';
    html += list.length
      ? '<div class="card" style="overflow:auto"><table class="hist-table"><thead><tr>' +
          '<th>#</th><th>Patient</th><th>Time</th><th>Status</th><th>Symptoms</th></tr></thead><tbody>' +
          list.map(function (a) {
            return '<tr><td>' + a.id + '</td><td><b>' + esc(a.patient) + '</b><div class="muted small">' + esc(a.patientId) +
              ' \u00b7 age ' + a.patientAge + '</div></td><td>' + esc(a.time) + (a.urgent ? ' <span class="badge urgent">Urgent</span>' : '') +
              '</td><td>' + statusBadge(a.status) + '</td><td>' + esc(a.symptoms || '-') + '</td></tr>';
          }).join('') + '</tbody></table></div>'
      : emptyState('calendar', 'No appointments yet', 'Bookings from patients appear here.');
    return { html: html };
  }

  // ---- doctor: patients
  async function doctorPatients() {
    var data = await request('GET', 'api/patients');
    state.cache.patients = data.patients;
    var html = '<div class="page-head">' +
      '<div class="search">' + icon('search') +
        '<input class="input" id="patient-search" type="search" placeholder="Search patients by name or ID" aria-label="Search patients">' +
      '</div>' +
      '<button class="btn ghost sm" data-act="reload">' + icon('refresh') + 'Refresh</button>' +
    '</div><div id="patient-grid" class="grid"></div>';

    function renderPatients() {
      var grid = $('#patient-grid');
      if (!grid) return;
      var q = (($('#patient-search') && $('#patient-search').value) || '').trim().toLowerCase();
      var list = state.cache.patients.filter(function (p) {
        return !q || (p.name + ' ' + p.id).toLowerCase().indexOf(q) !== -1;
      });
      if (!list.length) {
        grid.innerHTML = '<div style="grid-column:1/-1">' + emptyState('users', 'No patients found', 'Try another name or patient ID.') + '</div>';
        return;
      }
      grid.innerHTML = list.map(function (p) {
        return '<article class="card doc-card" style="align-self:start">' +
          '<div class="row">' +
            '<div class="avatar">' + esc(initials(p.name)) + '</div>' +
            '<div class="grow"><b>' + esc(p.name) + '</b><div class="muted small">' + esc(p.id) + ' \u00b7 age ' + p.age +
              ' \u00b7 ' + esc(p.city) + '</div></div>' +
          '</div>' +
          (p.records.length
            ? '<div class="list">' + p.records.map(function (r) {
                return '<div class="item" style="padding:10px 12px">' +
                  '<div class="grow"><div class="row between"><b style="font-size:14px">' + esc(r.diagnosis || 'Consultation') + '</b>' +
                  '<span class="muted small">' + esc(prettyDate(r.date)) + '</span></div>' +
                  '<div class="muted small">' + esc(r.symptoms || '-') + '</div></div>' +
                  '<button class="btn sm" data-act="edit-record" data-patient="' + esc(p.id) + '" data-record="' + r.id + '">' +
                    icon('edit') + 'Edit</button>' +
                '</div>';
              }).join('') + '</div>' +
              '<button class="btn sm ghost" data-act="undo-record" data-patient="' + esc(p.id) + '">' + icon('undo') + 'Undo last update</button>'
            : '<div class="muted small">No health records yet.</div>') +
        '</article>';
      }).join('');
    }

    return {
      html: html,
      after: function () {
        renderPatients();
        var input = $('#patient-search');
        if (input) input.addEventListener('input', renderPatients);
      }
    };
  }

  VIEWS['find-care'] = findCare;
  VIEWS.appointments = function () {
    return state.user.role === 'doctor' ? doctorAppointments() : patientAppointments();
  };
  VIEWS.records = patientRecords;
  VIEWS.queue = doctorQueue;
  VIEWS.slots = doctorSlots;
  VIEWS.patients = doctorPatients;

  // -------------------------------------------------------------- actions
  async function doLogin(id, password, role) {
    var data = await request('POST', 'api/login', { id: id, password: password, role: role });
    state.token = data.token;
    sessionStorage.setItem('cb.token', data.token);
    state.user = data.user;
    state.auth.error = '';
    state.view = '';
    closeModal();
    render();
  }

  function pickSlot(time, el) {
    modalState.time = time;
    var picker = $('#slot-picker');
    if (picker) {
      Array.prototype.forEach.call(picker.querySelectorAll('.slot'), function (node) {
        node.classList.remove('sel');
      });
    }
    if (el) el.classList.add('sel');
    var button = $('[data-act="confirm-book"]');
    if (button) button.disabled = false;
  }

  async function confirmBooking(doctorId) {
    var symptomsEl = $('#book-symptoms');
    var symptoms = symptomsEl ? symptomsEl.value.trim() : '';
    if (!modalState.time) return toast('Pick a time first.', 'err');
    if (!symptoms) return toast('Please describe your symptoms.', 'err');
    var button = $('[data-act="confirm-book"]');
    if (button) button.disabled = true;
    try {
      var data = await request('POST', 'api/book', {
        doctor: doctorId, time: modalState.time, symptoms: symptoms, urgent: modalState.urgent ? '1' : '0'
      });
      closeModal();
      toast('Booked with ' + data.appointment.doctor + ' at ' + data.appointment.time + '.', 'ok');
      loadView();
    } catch (e) {
      if (button) button.disabled = false;
      toast(e.message, 'err');
    }
  }

  async function joinWaitlist(doctorId) {
    var symptomsEl = $('#wait-symptoms');
    var symptoms = symptomsEl ? symptomsEl.value.trim() : '';
    if (!symptoms) return toast('Please describe your symptoms.', 'err');
    try {
      await request('POST', 'api/waitlist', { doctor: doctorId, symptoms: symptoms, urgent: modalState.urgent ? '1' : '0' });
      closeModal();
      toast('Added to the waiting list. You are booked automatically when a slot frees up.', 'ok');
      loadView();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function cancelAppointment(id) {
    if (!window.confirm('Cancel this appointment?')) return;
    try {
      var data = await request('POST', 'api/cancel', { id: id });
      toast(data.promoted
        ? 'Appointment cancelled. ' + data.promoted + ' was promoted from the waiting list.'
        : 'Appointment cancelled.', 'ok');
      loadView();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function submitConsultation(id) {
    var diagnosis = ($('#consult-diagnosis') || {}).value || '';
    var tests = ($('#consult-tests') || {}).value || '';
    var followUp = ($('#consult-followup') || {}).value || '';
    if (!diagnosis.trim()) return toast('Diagnosis is required.', 'err');
    try {
      var data = await request('POST', 'api/consult', {
        id: id, diagnosis: diagnosis, tests: tests, followup: followUp
      });
      closeModal();
      toast('Record saved for ' + data.record.patientId + '.', 'ok');
      loadView();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function saveRecord(patientId, recordId) {
    var diagnosis = ($('#rec-diagnosis') || {}).value || '';
    var tests = ($('#rec-tests') || {}).value || '';
    var followUp = ($('#rec-followup') || {}).value || '';
    if (!diagnosis.trim()) return toast('Diagnosis is required.', 'err');
    try {
      await request('POST', 'api/record/update', {
        patient: patientId, record: recordId, diagnosis: diagnosis, tests: tests, followup: followUp
      });
      closeModal();
      toast('Record updated. You can undo this.', 'ok');
      loadView();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function undoRecord(patientId) {
    try {
      await request('POST', 'api/record/undo', { patient: patientId });
      closeModal();
      toast('Last record update undone.', 'ok');
      loadView();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function openSlot(time) {
    try {
      var data = await request('POST', 'api/slot/open', { time: time });
      toast(data.promoted
        ? 'Slot ' + time + ' opened. ' + data.promoted + ' was booked from the waiting list.'
        : 'Slot ' + time + ' opened.', 'ok');
      loadView();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function closeSlot(time) {
    try {
      await request('POST', 'api/slot/close', { time: time });
      toast('Slot ' + time + ' closed.', 'ok');
      loadView();
    } catch (e) { toast(e.message, 'err'); }
  }

  // --------------------------------------------------------------- modals
  function bookModal(doctorId) {
    var doc = (state.cache.doctors || []).filter(function (d) { return d.id === doctorId; })[0];
    if (!doc) return toast('Doctor not found. Refresh the page.', 'err');
    modalState.time = null;
    modalState.urgent = false;
    modalState.doctor = doctorId;
    openModal({
      title: 'Book with ' + doc.name,
      subtitle: doc.specialization + ' \u00b7 ' + doc.hospital,
      body:
        '<label class="f">Pick a time</label>' +
        '<div class="slots" id="slot-picker">' +
          doc.slots.map(function (s) {
            return s.booked
              ? '<div class="slot booked">' + esc(s.time) + '<small>booked</small></div>'
              : '<div class="slot free" data-act="pick-slot" data-time="' + esc(s.time) + '" role="button" tabindex="0">' +
                  esc(s.time) + '<small>available</small></div>';
          }).join('') +
        '</div>' +
        field('book-symptoms', 'Describe your symptoms', { textarea: true, placeholder: 'e.g. chest pain since yesterday morning', required: true }) +
        urgentSwitch(false),
      footer:
        '<button class="btn ghost" type="button" data-act="close-modal">Cancel</button>' +
        '<button class="btn primary" type="button" data-act="confirm-book" data-doctor="' + esc(doc.id) + '" disabled>Confirm booking</button>'
    });
  }

  function waitlistModal(doctorId) {
    var doc = (state.cache.doctors || []).filter(function (d) { return d.id === doctorId; })[0];
    if (!doc) return toast('Doctor not found. Refresh the page.', 'err');
    modalState.urgent = false;
    modalState.doctor = doctorId;
    openModal({
      title: 'Join the waiting list',
      subtitle: doc.name + ' is fully booked \u00b7 ' + doc.waiting + ' waiting',
      body:
        '<p class="muted small">When a slot is cancelled or a new one is opened, the first patient on the list is booked automatically.</p>' +
        field('wait-symptoms', 'Describe your symptoms', { textarea: true, placeholder: 'e.g. persistent cough for a week', required: true }) +
        urgentSwitch(false),
      footer:
        '<button class="btn ghost" type="button" data-act="close-modal">Cancel</button>' +
        '<button class="btn primary" type="button" data-act="confirm-waitlist" data-doctor="' + esc(doc.id) + '">Join waiting list</button>'
    });
  }

  function consultModal(appointmentId) {
    var appt = (state.cache.queue || []).filter(function (a) { return a.id === appointmentId; })[0];
    if (!appt) return toast('This appointment is no longer pending. Reload the page.', 'err');
    openModal({
      title: 'Consultation: ' + appt.patient,
      subtitle: appt.patientId + ' \u00b7 age ' + appt.patientAge + ' \u00b7 ' + appt.time,
      body:
        '<div class="fact"><small>Reported symptoms</small>' + esc(appt.symptoms || '-') + '</div>' +
        field('consult-diagnosis', 'Diagnosis', { textarea: true, placeholder: 'e.g. Acute bronchitis', required: true }) +
        field('consult-tests', 'Tests advised', { placeholder: 'e.g. Chest X-ray, CBC' }) +
        field('consult-followup', 'Follow-up', { placeholder: 'e.g. Review after 5 days' }),
      footer:
        '<button class="btn ghost" type="button" data-act="close-modal">Cancel</button>' +
        '<button class="btn primary" type="button" data-act="save-consult" data-id="' + appt.id + '">' + icon('check') + 'Save record</button>'
    });
  }

  function editRecordModal(patientId, recordId) {
    var patient = (state.cache.patients || []).filter(function (p) { return p.id === patientId; })[0];
    var record = patient && patient.records.filter(function (r) { return r.id === recordId; })[0];
    if (!record) return toast('Record not found. Reload the page.', 'err');
    openModal({
      title: 'Edit record #' + record.id,
      subtitle: patient.name + ' \u00b7 ' + prettyDate(record.date),
      body:
        '<div class="fact"><small>Symptoms (locked)</small>' + esc(record.symptoms || '-') + '</div>' +
        field('rec-diagnosis', 'Diagnosis', { textarea: true, value: record.diagnosis, required: true }) +
        field('rec-tests', 'Tests advised', { value: record.tests }) +
        field('rec-followup', 'Follow-up', { value: record.followUp }),
      footer:
        '<button class="btn ghost" type="button" data-act="undo-record" data-patient="' + esc(patientId) + '">' + icon('undo') + 'Undo last update</button>' +
        '<button class="btn primary" type="button" data-act="save-record" data-patient="' + esc(patientId) + '" data-record="' + record.id + '">Save changes</button>'
    });
  }

  // --------------------------------------------------------------- events
  document.addEventListener('click', function (e) {
    var overlay = e.target.closest('[data-overlay]');
    if (overlay && e.target === overlay) { closeModal(); return; }

    var target = e.target.closest('[data-act]');
    if (!target) return;
    var act = target.getAttribute('data-act');

    switch (act) {
      case 'close-modal':
        closeModal();
        break;
      case 'auth-role':
        state.auth.role = target.getAttribute('data-role');
        state.auth.error = '';
        render();
        break;
      case 'auth-form':
        state.auth.form = target.getAttribute('data-form');
        state.auth.error = '';
        render();
        break;
      case 'fill-demo': {
        state.auth.form = 'login';
        state.auth.role = target.getAttribute('data-role');
        render();
        var idEl = $('#auth-id');
        var pwEl = $('#auth-password');
        if (idEl) idEl.value = target.getAttribute('data-id');
        if (pwEl) pwEl.value = target.getAttribute('data-pw');
        break;
      }
      case 'nav':
        e.preventDefault();
        state.view = target.getAttribute('data-view');
        location.hash = '#/' + state.view;
        render();
        break;
      case 'logout':
        request('POST', 'api/logout').catch(function () {});
        state.user = null;
        state.token = '';
        sessionStorage.removeItem('cb.token');
        state.view = '';
        location.hash = '';
        render();
        break;
      case 'theme':
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('cb.theme', state.theme);
        applyTheme();
        target.innerHTML = icon(state.theme === 'dark' ? 'sun' : 'moon');
        break;
      case 'reload':
        loadView();
        break;
      case 'reset-demo':
        if (!Demo) break;
        if (!window.confirm('Reset the demo data back to the sample hospitals, doctors and patient?')) break;
        Demo.reset();
        state.user = null;
        state.token = '';
        sessionStorage.removeItem('cb.token');
        render();
        toast('Demo data reset.', 'ok');
        break;
      case 'book':
        bookModal(target.getAttribute('data-doctor'));
        break;
      case 'waitlist':
        waitlistModal(target.getAttribute('data-doctor'));
        break;
      case 'pick-slot':
        pickSlot(target.getAttribute('data-time'), target);
        break;
      case 'toggle-urgent':
        modalState.urgent = !modalState.urgent;
        target.classList.toggle('on', modalState.urgent);
        target.setAttribute('aria-checked', modalState.urgent ? 'true' : 'false');
        break;
      case 'confirm-book':
        confirmBooking(target.getAttribute('data-doctor'));
        break;
      case 'confirm-waitlist':
        joinWaitlist(target.getAttribute('data-doctor'));
        break;
      case 'cancel-appt':
        cancelAppointment(parseInt(target.getAttribute('data-id'), 10));
        break;
      case 'consult':
        request('GET', 'api/queue').then(function (data) {
          state.cache.queue = data.queue;
          consultModal(parseInt(target.getAttribute('data-id'), 10));
        }).catch(function (err) { toast(err.message, 'err'); });
        break;
      case 'save-consult':
        submitConsultation(parseInt(target.getAttribute('data-id'), 10));
        break;
      case 'close-slot':
        closeSlot(target.getAttribute('data-time'));
        break;
      case 'edit-record':
        editRecordModal(target.getAttribute('data-patient'), parseInt(target.getAttribute('data-record'), 10));
        break;
      case 'save-record':
        saveRecord(target.getAttribute('data-patient'), parseInt(target.getAttribute('data-record'), 10));
        break;
      case 'undo-record':
        undoRecord(target.getAttribute('data-patient'));
        break;
      default:
        break;
    }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    e.preventDefault();

    if (form.id === 'auth-form') {
      if (state.auth.busy) return;
      var register = state.auth.form === 'register';
      var passwordEl = $('#auth-password');
      var password = passwordEl ? passwordEl.value : '';
      state.auth.busy = true;
      authError('');
      var submit = form.querySelector('button[type="submit"]');
      if (submit) { submit.disabled = true; submit.textContent = 'Please wait...'; }

      (async function () {
        try {
          if (register) {
            var name = ($('#auth-name') || {}).value || '';
            var age = ($('#auth-age') || {}).value || '';
            var city = ($('#auth-city') || {}).value || '';
            if (!name.trim() || !city.trim() || !age.trim() || !password) {
              throw new Error('Please fill in every field.');
            }
            var created = await request('POST', 'api/register', {
              name: name.trim(), age: String(parseInt(age, 10) || 0), city: city.trim(), password: password
            });
            state.auth.form = 'login';
            state.auth.role = 'patient';
            await doLogin(created.id, password, 'patient');
            toast('Account created. Welcome, ' + created.id + '.', 'ok');
          } else {
            var id = ($('#auth-id') || {}).value || '';
            if (!id.trim()) throw new Error('Please enter your ID.');
            await doLogin(id.trim(), password, state.auth.role);
            toast('Signed in.', 'ok');
          }
          state.auth.busy = false;
        } catch (err) {
          state.auth.busy = false;
          authError(err.message);
          render();
        }
      })();
      return;
    }

    if (form.id === 'modal-form') {
      var primary = form.querySelector('[data-act="confirm-book"], [data-act="confirm-waitlist"], [data-act="save-consult"], [data-act="save-record"]');
      if (primary) primary.click();
      return;
    }

    if (form.id === 'slot-form') {
      var timeEl = $('#slot-time');
      var time = timeEl ? timeEl.value.trim() : '';
      if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) return toast('Use a 24-hour time like 15:30.', 'err');
      openSlot(time);
      if (timeEl) timeEl.value = '';
      return;
    }
  });

  // keyboard support for the urgent switch
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var target = e.target.closest('[data-act="toggle-urgent"]');
    if (!target) return;
    e.preventDefault();
    target.click();
  });

  window.addEventListener('hashchange', function () {
    if (!state.user) return;
    var nav = NAV[state.user.role] || [];
    var next = routeFromHash(nav);
    if (next && next !== state.view) { state.view = next; render(); }
  });

  // ----------------------------------------------------------------- boot
  (async function boot() {
    applyTheme();
    await detectEngine();
    if (state.token) {
      try {
        var me = await request('GET', 'api/me');
        state.user = me.user;
      } catch (e) {
        state.token = '';
        sessionStorage.removeItem('cb.token');
      }
    }
    render();
  })();
})();
