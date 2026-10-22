/* demo-api.js - browser-only implementation of the CareBridge JSON API.
 *
 * The real backend is the C++ server (src/server.cpp). GitHub Pages can only
 * host static files, so when app.js cannot reach the C++ server it talks to
 * this engine instead: the same endpoints and the same response shapes, with
 * the data kept in localStorage. Everything here is sample data from the
 * academic prototype - never enter real medical information.
 */
(function (global) {
  'use strict';

  var KEY = 'carebridge.demo.v1';

  // ------------------------------------------------------------- helpers
  // FNV-1a (32 bit). Mirrors the prototype's note: hashed, but NOT a
  // production-grade password scheme.
  function hashPassword(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function pad3(n) { return 'P' + ('00' + n).slice(-3); }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function isValidTime(t) { return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(t); }
  function clean(s) { return String(s == null ? '' : s).replace(/[|\r\n]/g, ' ').trim(); }
  function lower(s) { return String(s == null ? '' : s).toLowerCase(); }
  function contains(text, part) { return lower(text).indexOf(lower(part)) !== -1; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function fail(message) {
    var e = new Error(message);
    e.apiError = true;
    throw e;
  }

  // ---------------------------------------------------------------- seed
  function seedDb() {
    var db = {
      hospitals: [
        { id: 'H1', name: 'Doon CareBridge Hospital', city: 'Dehradun' },
        { id: 'H2', name: 'Rishikesh Community Hospital', city: 'Rishikesh' },
        { id: 'H3', name: 'Delhi Central Hospital', city: 'Delhi' }
      ],
      users: [],
      slots: {},
      appointments: [],
      waitlist: {},
      records: [],
      undo: {},
      sessions: {},
      next: { appt: 1, record: 1, patient: 2 }
    };

    var doctors = [
      { id: 'D001', name: 'Dr. Anil Rawat', spec: 'Cardiology', hospital: 'H1' },
      { id: 'D002', name: 'Dr. Meera Joshi', spec: 'General Medicine', hospital: 'H1' },
      { id: 'D003', name: 'Dr. Sameer Khan', spec: 'Pediatrics', hospital: 'H2' },
      { id: 'D004', name: 'Dr. Kavita Negi', spec: 'Dermatology', hospital: 'H2' },
      { id: 'D005', name: 'Dr. Rohit Sharma', spec: 'Orthopedics', hospital: 'H3' }
    ];
    var times = ['09:00', '10:00', '11:00', '14:00'];
    doctors.forEach(function (d) {
      db.users.push({
        role: 'doctor', id: d.id, name: d.name, hash: hashPassword('doc123'),
        specialization: d.spec, hospitalId: d.hospital
      });
      db.slots[d.id] = times.map(function (t) { return { time: t, booked: false }; });
      db.waitlist[d.id] = [];
    });
    db.users.push({
      role: 'patient', id: 'P001', name: 'Demo Patient',
      hash: hashPassword('pat123'), age: 20, city: 'Dehradun'
    });
    return db;
  }

  // ----------------------------------------------------------- storage
  function loadDb() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.users && parsed.hospitals) return parsed;
      }
    } catch (e) { /* corrupted store -> reseed */ }
    var fresh = seedDb();
    persistDb(fresh);
    return fresh;
  }

  function persistDb(data) {
    try { global.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
  }

  var db = loadDb();

  function save() { persistDb(db); }

  function reset() {
    db = seedDb();
    save();
    return { ok: true };
  }

  // -------------------------------------------------------------- views
  function hospital(id) {
    for (var i = 0; i < db.hospitals.length; i++) if (db.hospitals[i].id === id) return db.hospitals[i];
    return null;
  }
  function userById(id) {
    for (var i = 0; i < db.users.length; i++) if (db.users[i].id === id) return db.users[i];
    return null;
  }
  function doctorById(id) {
    var u = userById(id);
    return u && u.role === 'doctor' ? u : null;
  }
  function patientById(id) {
    var u = userById(id);
    return u && u.role === 'patient' ? u : null;
  }
  function slotsOf(id) {
    if (!db.slots[id]) db.slots[id] = [];
    return db.slots[id];
  }
  function waitlistOf(id) {
    if (!db.waitlist[id]) db.waitlist[id] = [];
    return db.waitlist[id];
  }
  function freeSlots(id) {
    return slotsOf(id).filter(function (s) { return !s.booked; });
  }
  function sortedSlots(id) {
    return slotsOf(id).slice().sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
  }
  function statusName(s) { return s === 1 ? 'completed' : s === 2 ? 'cancelled' : 'pending'; }

  function userJson(u) {
    var out = { id: u.id, name: u.name, role: u.role };
    if (u.role === 'patient') { out.age = u.age; out.city = u.city; }
    else {
      var h = hospital(u.hospitalId);
      out.specialization = u.specialization;
      out.hospitalId = u.hospitalId;
      out.hospital = h ? h.name : '';
    }
    return out;
  }

  function doctorJson(d) {
    var h = hospital(d.hospitalId);
    return {
      id: d.id, name: d.name, specialization: d.specialization,
      hospitalId: d.hospitalId, hospital: h ? h.name : '',
      freeSlots: freeSlots(d.id).length,
      waiting: waitlistOf(d.id).length,
      slots: sortedSlots(d.id)
    };
  }

  function apptJson(a) {
    var d = doctorById(a.doctorId);
    var p = patientById(a.patientId);
    var h = d ? hospital(d.hospitalId) : null;
    return {
      id: a.id, patientId: a.patientId, patient: p ? p.name : a.patientId,
      patientAge: p ? p.age : 0, doctorId: a.doctorId, doctor: d ? d.name : a.doctorId,
      specialization: d ? d.specialization : '', hospital: h ? h.name : '',
      time: a.time, urgent: !!a.urgent, symptoms: a.symptoms, status: statusName(a.status)
    };
  }

  function recordJson(r) {
    var d = doctorById(r.doctorId);
    return {
      id: r.id, patientId: r.patientId, doctorId: r.doctorId,
      doctor: d ? d.name : r.doctorId, date: r.date, symptoms: r.symptoms,
      diagnosis: r.diagnosis, tests: r.tests, followUp: r.followUp
    };
  }

  function patientJson(p, withRecords) {
    var out = { id: p.id, name: p.name, age: p.age, city: p.city };
    if (withRecords) {
      out.records = db.records
        .filter(function (r) { return r.patientId === p.id; })
        .sort(function (a, b) { return a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.id - a.id; })
        .map(recordJson);
    }
    return out;
  }

  // ------------------------------------------------------------ actions
  function requireUser(token) {
    var id = db.sessions[token];
    var u = id ? userById(id) : null;
    if (!u) fail('Please log in.');
    return u;
  }

  function book(patientId, doctorId, time, symptoms, urgent) {
    var p = patientById(patientId);
    var d = doctorById(doctorId);
    if (!p || !d) fail('Could not book this appointment.');
    var slot = null;
    slotsOf(d.id).forEach(function (s) { if (s.time === time) slot = s; });
    if (!slot) fail('That slot was just taken. Pick another.');
    if (slot.booked) fail('That slot was just taken. Pick another.');
    slot.booked = true;
    var appt = {
      id: db.next.appt++, patientId: patientId, doctorId: doctorId,
      time: time, urgent: !!urgent, symptoms: clean(symptoms), status: 0
    };
    db.appointments.push(appt);
    return appt;
  }

  function promoteFromWaitlist(doctorId, time) {
    var list = waitlistOf(doctorId);
    while (list.length) {
      var w = list.shift();
      try {
        book(w.patientId, doctorId, time, w.symptoms, w.urgent);
        return w.patientId;
      } catch (e) { /* patient no longer valid - try the next one */ }
    }
    return '';
  }

  function pendingOf(doctorId) {
    return db.appointments
      .filter(function (a) { return a.doctorId === doctorId && a.status === 0; })
      .sort(function (a, b) {
        if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
        return a.id - b.id;
      });
  }

  // ------------------------------------------------------------ routing
  function handle(method, rawPath, body, token) {
    body = body || {};
    var qIndex = rawPath.indexOf('?');
    var path = qIndex === -1 ? rawPath : rawPath.slice(0, qIndex);
    var query = {};
    if (qIndex !== -1) {
      rawPath.slice(qIndex + 1).split('&').forEach(function (pair) {
        if (!pair) return;
        var eq = pair.indexOf('=');
        var k = decodeURIComponent((eq === -1 ? pair : pair.slice(0, eq)).replace(/\+/g, ' '));
        var v = eq === -1 ? '' : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
        query[k] = v;
      });
    }
    var post = method === 'POST';
    var P = function (k) { return clean(body[k]); };

    // ---- public
    if (path === '/api/health') {
      return { ok: true, service: 'carebridge', engine: 'demo', sessions: true };
    }
    if (post && path === '/api/login') {
      var u = userById(P('id'));
      if (!u || u.role !== P('role') || u.hash !== hashPassword(body.password == null ? '' : body.password)) {
        fail('Wrong id, password or role.');
      }
      var t = 'demo-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      db.sessions[t] = u.id;
      save();
      return { ok: true, token: t, user: userJson(u) };
    }
    if (post && path === '/api/register') {
      var name = P('name'), city = P('city');
      var pw = body.password == null ? '' : String(body.password);
      var age = parseInt(P('age'), 10);
      if (!name || !city) fail('Name and city are required.');
      if (!(age >= 0 && age <= 120)) fail('Enter a valid age (0-120).');
      if (pw.length < 4) fail('Password must be at least 4 characters.');
      var p = {
        role: 'patient', id: pad3(db.next.patient++), name: clean(name),
        hash: hashPassword(pw), age: age, city: clean(city)
      };
      db.users.push(p);
      save();
      return { ok: true, id: p.id };
    }

    // ---- needs a session
    var me = requireUser(token);
    var patient = me.role === 'patient' ? me : null;
    var doctor = me.role === 'doctor' ? me : null;

    if (post && path === '/api/logout') {
      delete db.sessions[token];
      save();
      return { ok: true };
    }
    if (path === '/api/me') return { ok: true, user: userJson(me) };

    if (path === '/api/hospitals') {
      return {
        ok: true,
        hospitals: db.hospitals.map(function (h) {
          return {
            id: h.id, name: h.name, city: h.city,
            nearby: !!patient && lower(h.city) === lower(patient.city),
            doctors: db.users.filter(function (x) { return x.role === 'doctor' && x.hospitalId === h.id; }).length
          };
        })
      };
    }

    if (path === '/api/doctors') {
      var hosp = query.hospital || '';
      var q = query.q || '';
      var docs = db.users
        .filter(function (x) { return x.role === 'doctor'; })
        .sort(function (a, b) { return lower(a.name) < lower(b.name) ? -1 : 1; })
        .filter(function (d) {
          if (hosp && d.hospitalId !== hosp) return false;
          if (q && !contains(d.name, q) && !contains(d.specialization, q)) return false;
          return true;
        })
        .map(doctorJson);
      return { ok: true, doctors: docs };
    }

    // ---- patient
    if (patient) {
      if (post && path === '/api/book') {
        if (!P('symptoms')) fail('Please describe your symptoms.');
        var appt = book(patient.id, P('doctor'), P('time'), P('symptoms'), P('urgent') === '1');
        save();
        return { ok: true, appointment: apptJson(appt) };
      }
      if (post && path === '/api/waitlist') {
        if (!P('symptoms')) fail('Please describe your symptoms.');
        var d2 = doctorById(P('doctor'));
        if (!d2) fail('Could not join the waiting list.');
        waitlistOf(d2.id).push({ patientId: patient.id, urgent: P('urgent') === '1', symptoms: clean(P('symptoms')) });
        save();
        return { ok: true };
      }
      if (post && path === '/api/cancel') {
        var id = parseInt(P('id'), 10);
        var target = null;
        db.appointments.forEach(function (a) { if (a.id === id) target = a; });
        if (!target || target.patientId !== patient.id || target.status !== 0) {
          fail('This appointment cannot be cancelled.');
        }
        target.status = 2;
        var slot = null;
        slotsOf(target.doctorId).forEach(function (s) { if (s.time === target.time) slot = s; });
        if (slot) slot.booked = false;
        var promoted = promoteFromWaitlist(target.doctorId, target.time);
        save();
        return { ok: true, promoted: promoted };
      }
      if (path === '/api/appointments') {
        return {
          ok: true,
          appointments: db.appointments.filter(function (a) { return a.patientId === patient.id; })
            .reverse().map(apptJson)
        };
      }
      if (path === '/api/records') {
        return {
          ok: true,
          records: db.records.filter(function (r) { return r.patientId === patient.id; })
            .sort(function (a, b) { return a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.id - a.id; })
            .map(recordJson)
        };
      }
      fail('Not found.');
    }

    // ---- doctor
    if (doctor) {
      if (path === '/api/queue') {
        var queue = pendingOf(doctor.id).map(apptJson);
        return {
          ok: true, queue: queue,
          urgent: queue.filter(function (a) { return a.urgent; }).length,
          waiting: waitlistOf(doctor.id).length,
          freeSlots: freeSlots(doctor.id).length
        };
      }
      if (path === '/api/appointments') {
        return {
          ok: true,
          appointments: db.appointments.filter(function (a) { return a.doctorId === doctor.id; })
            .reverse().map(apptJson)
        };
      }
      if (path === '/api/slots') {
        return { ok: true, slots: sortedSlots(doctor.id), waiting: waitlistOf(doctor.id).length };
      }
      if (post && path === '/api/slot/open') {
        var time = P('time');
        if (!isValidTime(time)) fail('Use a valid HH:MM time that is not already open.');
        var exists = slotsOf(doctor.id).some(function (s) { return s.time === time; });
        if (exists) fail('Use a valid HH:MM time that is not already open.');
        slotsOf(doctor.id).push({ time: time, booked: false });
        var promoted = promoteFromWaitlist(doctor.id, time);
        save();
        return { ok: true, promoted: promoted };
      }
      if (post && path === '/api/slot/close') {
        var slots = slotsOf(doctor.id);
        var found = null;
        for (var i = 0; i < slots.length; i++) if (slots[i].time === P('time')) found = slots[i];
        if (!found || found.booked) fail('Only free slots can be closed.');
        db.slots[doctor.id] = slots.filter(function (s) { return s !== found; });
        save();
        return { ok: true };
      }
      if (post && path === '/api/consult') {
        if (!P('diagnosis')) fail('Diagnosis is required.');
        var cid = parseInt(P('id'), 10);
        var pendingAppt = null;
        pendingOf(doctor.id).forEach(function (a) { if (a.id === cid) pendingAppt = a; });
        if (!pendingAppt) fail('Appointment is not pending.');
        var patientRec = patientById(pendingAppt.patientId);
        if (!patientRec) fail('Could not save the record.');
        var rec = {
          id: db.next.record++, patientId: pendingAppt.patientId, doctorId: doctor.id,
          date: today(), symptoms: pendingAppt.symptoms,
          diagnosis: clean(P('diagnosis')), tests: clean(P('tests')), followUp: clean(P('followup'))
        };
        db.records.push(rec);
        pendingAppt.status = 1;
        save();
        return { ok: true, record: recordJson(rec) };
      }
      if (path === '/api/patients') {
        var text = query.q || '';
        return {
          ok: true,
          patients: db.users.filter(function (x) {
            return x.role === 'patient' && (lower(x.id) === lower(text) || contains(x.name, text));
          }).map(function (p2) { return patientJson(p2, true); })
        };
      }
      if (post && path === '/api/record/update') {
        var recId = parseInt(P('record'), 10);
        var patientId = P('patient');
        var edit = null;
        db.records.forEach(function (r) { if (r.id === recId && r.patientId === patientId) edit = r; });
        if (!edit) fail('Record not found.');
        if (!db.undo[patientId]) db.undo[patientId] = [];
        db.undo[patientId].push(clone(edit));
        edit.diagnosis = clean(P('diagnosis'));
        edit.tests = clean(P('tests'));
        edit.followUp = clean(P('followup'));
        save();
        return { ok: true };
      }
      if (post && path === '/api/record/undo') {
        var stack = db.undo[P('patient')] || [];
        if (!stack.length) fail('Nothing to undo for this patient.');
        var previous = stack.pop();
        var live = null;
        db.records.forEach(function (r) { if (r.id === previous.id) live = r; });
        if (!live) fail('Nothing to undo for this patient.');
        live.diagnosis = previous.diagnosis;
        live.tests = previous.tests;
        live.followUp = previous.followUp;
        save();
        return { ok: true };
      }
    }
    fail('Not found.');
  }

  global.CareBridgeDemo = {
    handle: handle,
    reset: reset,
    hasData: function () { return !!global.localStorage.getItem(KEY); }
  };
})(window);
