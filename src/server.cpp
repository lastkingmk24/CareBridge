// server.cpp - tiny HTTP server + JSON API that puts a web UI (web/ folder)
// on top of the CareBridge C++ core. Single thread, select() based, so it
// works on Linux, macOS and Windows (Winsock) with no extra libraries.
// Listens on 127.0.0.1 only (local use).
#include <algorithm>
#include <cstring>
#include <ctime>
#include <fstream>
#include <iostream>
#include <map>
#include <random>
#include <sstream>
#include "CareBridge.h"

#ifdef _WIN32
  #include <winsock2.h>
  #include <ws2tcpip.h>
  typedef SOCKET sock_t;
  #define CLOSESOCK closesocket
  #define BAD_SOCK INVALID_SOCKET
#else
  #include <arpa/inet.h>
  #include <csignal>
  #include <netinet/in.h>
  #include <sys/select.h>
  #include <sys/socket.h>
  #include <unistd.h>
  typedef int sock_t;
  #define CLOSESOCK close
  #define BAD_SOCK (-1)
#endif
#ifndef MSG_NOSIGNAL
  #define MSG_NOSIGNAL 0
#endif

// ------------------------------------------------------------------- helpers
typedef std::map<std::string, std::string> Params;

static std::string urlDecode(const std::string& s) {
    std::string o;
    for (std::size_t i = 0; i < s.size(); ++i) {
        if (s[i] == '+') o += ' ';
        else if (s[i] == '%' && i + 2 < s.size() && std::isxdigit((unsigned char)s[i + 1]) &&
                 std::isxdigit((unsigned char)s[i + 2])) {
            o += static_cast<char>(std::stoi(s.substr(i + 1, 2), nullptr, 16));
            i += 2;
        } else o += s[i];
    }
    return o;
}

static Params parseForm(const std::string& s) {
    Params p;
    for (const std::string& part : split(s, '&')) {
        std::size_t eq = part.find('=');
        if (eq == std::string::npos) continue;
        p[urlDecode(part.substr(0, eq))] = urlDecode(part.substr(eq + 1));
    }
    return p;
}

static std::string jesc(const std::string& s) {
    std::string o;
    for (unsigned char c : s) {
        switch (c) {
            case '"': o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n"; break;
            case '\r': o += "\\r"; break;
            case '\t': o += "\\t"; break;
            default:
                if (c < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; }
                else o += static_cast<char>(c);
        }
    }
    return o;
}

// Minimal JSON object builder.
struct J {
    std::string s = "{";
    bool first = true;
    J& key(const std::string& k) { if (!first) s += ','; first = false; s += "\"" + k + "\":"; return *this; }
    J& str(const std::string& k, const std::string& v) { key(k); s += "\"" + jesc(v) + "\""; return *this; }
    J& num(const std::string& k, long v) { key(k); s += std::to_string(v); return *this; }
    J& boolean(const std::string& k, bool v) { key(k); s += v ? "true" : "false"; return *this; }
    J& raw(const std::string& k, const std::string& v) { key(k); s += v; return *this; }
    std::string done() const { return s + "}"; }
};
static std::string jarr(const std::vector<std::string>& items) {
    std::string s = "[";
    for (std::size_t i = 0; i < items.size(); ++i) { if (i) s += ','; s += items[i]; }
    return s + "]";
}

struct Response { int code = 200; std::string type = "application/json"; std::string body; };
static Response fail(const std::string& msg, int code = 400) {
    return {code, "application/json", J().boolean("ok", false).str("error", msg).done()};
}
static Response okJson(const std::string& body) { return {200, "application/json", body}; }
static Response okSimple() { return okJson(J().boolean("ok", true).done()); }

// ------------------------------------------------------------------- state
static CareBridge sys("data");
static std::map<std::string, std::string> sessions;   // token -> user id
static std::string webRoot = "web";                  // folder served for the UI

static std::string envOr(const char* name, const std::string& fallback) {
    const char* v = std::getenv(name);
    return (v && *v) ? std::string(v) : fallback;
}

static std::string newToken() {
    static std::mt19937_64 rng(std::random_device{}() ^ static_cast<unsigned long long>(std::time(nullptr)));
    char buf[40];
    std::snprintf(buf, sizeof buf, "%016llx%016llx", (unsigned long long)rng(), (unsigned long long)rng());
    return buf;
}

// ----------------------------------------------------------------- JSON views
static std::string userJson(User* u) {
    J j;
    j.str("id", u->id()).str("name", u->name()).str("role", u->role());
    if (Patient* p = dynamic_cast<Patient*>(u)) j.num("age", p->age()).str("city", p->city());
    if (Doctor* d = dynamic_cast<Doctor*>(u)) {
        Hospital* h = sys.findHospital(d->hospitalId());
        j.str("specialization", d->specialization()).str("hospitalId", d->hospitalId())
         .str("hospital", h ? h->name : "");
    }
    return j.done();
}

static std::string doctorJson(Doctor* d) {
    Hospital* h = sys.findHospital(d->hospitalId());
    std::vector<std::string> slots;
    for (const Slot& s : d->allSlots())
        slots.push_back(J().str("time", s.time).boolean("booked", s.booked).done());
    return J().str("id", d->id()).str("name", d->name()).str("specialization", d->specialization())
        .str("hospitalId", d->hospitalId()).str("hospital", h ? h->name : "")
        .num("freeSlots", (long)d->freeSlots().size()).num("waiting", (long)d->waitlist.size())
        .raw("slots", jarr(slots)).done();
}

static std::string apptJson(const Appointment& a) {
    Doctor* d = sys.findDoctor(a.doctorId);
    Patient* p = sys.findPatient(a.patientId);
    Hospital* h = d ? sys.findHospital(d->hospitalId()) : nullptr;
    return J().num("id", a.id).str("patientId", a.patientId).str("patient", p ? p->name() : a.patientId)
        .num("patientAge", p ? p->age() : 0).str("doctorId", a.doctorId).str("doctor", d ? d->name() : a.doctorId)
        .str("specialization", d ? d->specialization() : "").str("hospital", h ? h->name : "")
        .str("time", a.time).boolean("urgent", a.urgent).str("symptoms", a.symptoms)
        .str("status", a.status == Status::Pending ? "pending" : a.status == Status::Completed ? "completed" : "cancelled")
        .done();
}

static std::string recordJson(const HealthRecord& r) {
    Doctor* d = sys.findDoctor(r.doctorId);
    return J().num("id", r.id).str("patientId", r.patientId).str("doctorId", r.doctorId)
        .str("doctor", d ? d->name() : r.doctorId).str("date", r.date).str("symptoms", r.symptoms)
        .str("diagnosis", r.diagnosis).str("tests", r.tests).str("followUp", r.followUp).done();
}

static std::string patientJson(Patient* p, bool withRecords) {
    J j;
    j.str("id", p->id()).str("name", p->name()).num("age", p->age()).str("city", p->city());
    if (withRecords) {
        std::vector<std::string> recs;
        for (HealthRecord* r : sys.recordsSorted(p->id())) recs.push_back(recordJson(*r));
        j.raw("records", jarr(recs));
    }
    return j.done();
}

// ------------------------------------------------------------------- routes
struct Request {
    std::string method, path;
    Params query, form, headers;
};

static User* authUser(const Request& rq) {
    auto it = rq.headers.find("x-token");
    if (it == rq.headers.end()) return nullptr;
    auto s = sessions.find(it->second);
    return s == sessions.end() ? nullptr : sys.findUser(s->second);
}

static std::string P(const Request& rq, const std::string& k) {
    auto it = rq.form.find(k);
    return it == rq.form.end() ? "" : trim(it->second);
}

static Response api(const Request& rq) {
    const std::string& path = rq.path;
    const bool post = rq.method == "POST";

    // ---- public
    if (path == "/api/health") {
        // The UI uses this to decide between the real C++ backend and the
        // browser-only demo engine used on static hosting (GitHub Pages).
        return okJson(J().boolean("ok", true).str("service", "carebridge")
                              .str("engine", "cpp").boolean("sessions", true).done());
    }
    if (post && path == "/api/login") {
        User* u = sys.login(P(rq, "id"), rq.form.count("password") ? rq.form.at("password") : "", P(rq, "role"));
        if (!u) return fail("Wrong id, password or role.", 401);
        std::string t = newToken();
        sessions[t] = u->id();
        return okJson(J().boolean("ok", true).str("token", t).raw("user", userJson(u)).done());
    }
    if (post && path == "/api/register") {
        std::string name = P(rq, "name"), city = P(rq, "city");
        std::string pw = rq.form.count("password") ? rq.form.at("password") : "";
        int age = toInt(P(rq, "age"), -1);
        if (name.empty() || city.empty()) return fail("Name and city are required.");
        if (age < 0 || age > 120) return fail("Enter a valid age (0-120).");
        if (pw.size() < 4) return fail("Password must be at least 4 characters.");
        Patient* p = sys.registerPatient(name, pw, age, city);
        return okJson(J().boolean("ok", true).str("id", p->id()).done());
    }

    // ---- everything below needs a session
    User* me = authUser(rq);
    if (!me) return fail("Please log in.", 401);
    Patient* pat = dynamic_cast<Patient*>(me);
    Doctor* doc = dynamic_cast<Doctor*>(me);

    if (post && path == "/api/logout") {
        auto it = rq.headers.find("x-token");
        if (it != rq.headers.end()) sessions.erase(it->second);
        return okSimple();
    }
    if (path == "/api/me") return okJson(J().boolean("ok", true).raw("user", userJson(me)).done());

    if (path == "/api/hospitals") {
        std::vector<std::string> out;
        for (Hospital* h : sys.allHospitals()) {
            bool near = pat && lower(h->city) == lower(pat->city());
            out.push_back(J().str("id", h->id).str("name", h->name).str("city", h->city)
                              .boolean("nearby", near).num("doctors", (long)sys.doctorsAt(h->id).size()).done());
        }
        return okJson(J().boolean("ok", true).raw("hospitals", jarr(out)).done());
    }
    if (path == "/api/doctors") {
        std::string hosp = rq.query.count("hospital") ? rq.query.at("hospital") : "";
        std::string q = rq.query.count("q") ? rq.query.at("q") : "";
        std::vector<std::string> out;
        for (Doctor* d : sys.allDoctorsSorted()) {
            if (!hosp.empty() && d->hospitalId() != hosp) continue;
            if (!q.empty() && !contains(d->name(), q) && !contains(d->specialization(), q)) continue;
            out.push_back(doctorJson(d));
        }
        return okJson(J().boolean("ok", true).raw("doctors", jarr(out)).done());
    }

    // ---- patient only
    if (pat) {
        if (post && path == "/api/book") {
            std::string symptoms = P(rq, "symptoms");
            if (symptoms.empty()) return fail("Please describe your symptoms.");
            Appointment* a = nullptr;
            BookResult r = sys.book(pat->id(), P(rq, "doctor"), P(rq, "time"), symptoms, P(rq, "urgent") == "1", &a);
            if (r == BookResult::SlotTaken) return fail("That slot was just taken. Pick another.");
            if (r != BookResult::Booked) return fail("Could not book this appointment.");
            return okJson(J().boolean("ok", true).raw("appointment", apptJson(*a)).done());
        }
        if (post && path == "/api/waitlist") {
            std::string symptoms = P(rq, "symptoms");
            if (symptoms.empty()) return fail("Please describe your symptoms.");
            if (!sys.joinWaitlist(pat->id(), P(rq, "doctor"), symptoms, P(rq, "urgent") == "1")) return fail("Could not join the waiting list.");
            return okSimple();
        }
        if (post && path == "/api/cancel") {
            std::string promoted;
            if (!sys.cancel(toInt(P(rq, "id")), pat->id(), &promoted)) return fail("This appointment cannot be cancelled.");
            return okJson(J().boolean("ok", true).str("promoted", promoted).done());
        }
        if (path == "/api/appointments") {
            std::vector<std::string> out;
            for (Appointment* a : sys.appointmentsOfPatient(pat->id())) out.push_back(apptJson(*a));
            std::reverse(out.begin(), out.end());
            return okJson(J().boolean("ok", true).raw("appointments", jarr(out)).done());
        }
        if (path == "/api/records") {
            std::vector<std::string> out;
            for (HealthRecord* r : sys.recordsSorted(pat->id())) out.push_back(recordJson(*r));
            return okJson(J().boolean("ok", true).raw("records", jarr(out)).done());
        }
        return fail("Not found.", 404);
    }

    // ---- doctor only
    if (doc) {
        if (path == "/api/queue") {
            std::vector<std::string> out;
            long urgent = 0;
            for (Appointment* a : sys.pendingFor(doc->id())) { out.push_back(apptJson(*a)); if (a->urgent) ++urgent; }
            return okJson(J().boolean("ok", true).raw("queue", jarr(out)).num("urgent", urgent)
                              .num("waiting", (long)doc->waitlist.size()).num("freeSlots", (long)doc->freeSlots().size()).done());
        }
        if (path == "/api/appointments") {
            std::vector<std::string> out;
            for (Appointment* a : sys.appointmentsOfDoctor(doc->id())) out.push_back(apptJson(*a));
            std::reverse(out.begin(), out.end());
            return okJson(J().boolean("ok", true).raw("appointments", jarr(out)).done());
        }
        if (path == "/api/slots") {
            std::vector<std::string> slots;
            for (const Slot& s : doc->allSlots()) slots.push_back(J().str("time", s.time).boolean("booked", s.booked).done());
            return okJson(J().boolean("ok", true).raw("slots", jarr(slots)).num("waiting", (long)doc->waitlist.size()).done());
        }
        if (post && path == "/api/slot/open") {
            std::string promoted;
            if (!sys.openSlot(doc->id(), P(rq, "time"), &promoted)) return fail("Use a valid HH:MM time that is not already open.");
            return okJson(J().boolean("ok", true).str("promoted", promoted).done());
        }
        if (post && path == "/api/slot/close") {
            if (!sys.closeSlot(doc->id(), P(rq, "time"))) return fail("Only free slots can be closed.");
            return okSimple();
        }
        if (post && path == "/api/consult") {
            int id = toInt(P(rq, "id"));
            if (P(rq, "diagnosis").empty()) return fail("Diagnosis is required.");
            for (Appointment* a : sys.pendingFor(doc->id())) {
                if (a->id != id) continue;
                HealthRecord* r = sys.completeConsultation(a, P(rq, "diagnosis"), P(rq, "tests"), P(rq, "followup"));
                if (!r) return fail("Could not save the record.");
                return okJson(J().boolean("ok", true).raw("record", recordJson(*r)).done());
            }
            return fail("Appointment is not pending.");
        }
        if (path == "/api/patients") {
            std::vector<std::string> out;
            for (Patient* p : sys.searchPatients(rq.query.count("q") ? rq.query.at("q") : "")) out.push_back(patientJson(p, true));
            return okJson(J().boolean("ok", true).raw("patients", jarr(out)).done());
        }
        if (post && path == "/api/record/update") {
            if (!sys.updateRecord(P(rq, "patient"), toInt(P(rq, "record")), P(rq, "diagnosis"), P(rq, "tests"), P(rq, "followup")))
                return fail("Record not found.");
            return okSimple();
        }
        if (post && path == "/api/record/undo") {
            if (!sys.undoRecordUpdate(P(rq, "patient"))) return fail("Nothing to undo for this patient.");
            return okSimple();
        }
    }
    return fail("Not found.", 404);
}

// ------------------------------------------------------------ static files
static std::string mimeFor(const std::string& p) {
    auto ends = [&](const char* e) { std::string x = e; return p.size() >= x.size() && p.compare(p.size() - x.size(), x.size(), x) == 0; };
    if (ends(".html")) return "text/html; charset=utf-8";
    if (ends(".css")) return "text/css; charset=utf-8";
    if (ends(".js")) return "application/javascript; charset=utf-8";
    if (ends(".svg")) return "image/svg+xml";
    if (ends(".png")) return "image/png";
    return "application/octet-stream";
}

static Response staticFile(std::string path) {
    if (path == "/") path = "/index.html";
    if (path.find("..") != std::string::npos || path.find('\\') != std::string::npos) return fail("Forbidden.", 403);
    std::ifstream f(webRoot + path, std::ios::binary);
    if (!f) return fail("Not found.", 404);
    std::ostringstream ss;
    ss << f.rdbuf();
    return {200, mimeFor(path), ss.str()};
}

static std::string statusText(int c) {
    return c == 200 ? "OK" : c == 400 ? "Bad Request" : c == 401 ? "Unauthorized" : c == 403 ? "Forbidden" : c == 404 ? "Not Found" : "Error";
}

static std::string handle(const std::string& raw, std::size_t headerEnd) {
    Request rq;
    std::istringstream hs(raw.substr(0, headerEnd));
    std::string line, target, version;
    std::getline(hs, line);
    std::istringstream rl(line);
    rl >> rq.method >> target >> version;
    while (std::getline(hs, line)) {
        std::size_t c = line.find(':');
        if (c == std::string::npos) continue;
        rq.headers[lower(trim(line.substr(0, c)))] = trim(line.substr(c + 1));
    }
    std::size_t qm = target.find('?');
    rq.path = urlDecode(target.substr(0, qm));
    if (qm != std::string::npos) rq.query = parseForm(target.substr(qm + 1));
    rq.form = parseForm(raw.substr(headerEnd + 4));

    Response r;
    if (rq.path.rfind("/api/", 0) == 0) r = api(rq);
    else if (rq.method == "GET") r = staticFile(rq.path);
    else r = fail("Not found.", 404);

    std::ostringstream out;
    out << "HTTP/1.1 " << r.code << ' ' << statusText(r.code) << "\r\nContent-Type: " << r.type
        << "\r\nContent-Length: " << r.body.size() << "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n" << r.body;
    return out.str();
}

// --------------------------------------------------------------- event loop
struct Client { sock_t fd; std::string buf; std::time_t last; };

static void sendAll(sock_t fd, const std::string& data) {
    std::size_t sent = 0;
    while (sent < data.size()) {
        int n = static_cast<int>(send(fd, data.data() + sent, static_cast<int>(data.size() - sent), MSG_NOSIGNAL));
        if (n <= 0) break;
        sent += static_cast<std::size_t>(n);
    }
}

int main(int argc, char** argv) {
    int port = argc > 1 ? toInt(argv[1], 8080) : 8080;
    // Default is loopback (safe for local use). Set CAREBRIDGE_HOST=0.0.0.0
    // (or pass it as the second argument) to expose the demo on a container,
    // Codespace or hosting sandbox.
    std::string host = argc > 2 ? argv[2] : envOr("CAREBRIDGE_HOST", "127.0.0.1");
    webRoot = envOr("CAREBRIDGE_WEB", "web");
#ifdef _WIN32
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) { std::cerr << "WSAStartup failed\n"; return 1; }
#else
    std::signal(SIGPIPE, SIG_IGN);
#endif
    sock_t srv = socket(AF_INET, SOCK_STREAM, 0);
    int yes = 1;
    setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&yes), sizeof yes);
    sockaddr_in addr;
    std::memset(&addr, 0, sizeof addr);
    addr.sin_family = AF_INET;
    addr.sin_port = htons(static_cast<unsigned short>(port));
    if (host == "localhost") host = "127.0.0.1";
    if (inet_pton(AF_INET, host.c_str(), &addr.sin_addr) != 1) {
        std::cerr << "Invalid host '" << host << "'. Use 127.0.0.1 or 0.0.0.0.\n";
        return 1;
    }
    if (srv == BAD_SOCK || bind(srv, reinterpret_cast<sockaddr*>(&addr), sizeof addr) != 0 || listen(srv, 16) != 0) {
        std::cerr << "Could not listen on " << host << ':' << port << ". Try another port: carebridge_web 9090\n";
        return 1;
    }
    std::cout << "CareBridge is running on " << host << ':' << port << " (UI folder: " << webRoot << ")\n"
              << "  Open http://localhost:" << port << " in your browser.\n"
              << "  Demo logins: patient P001 / pat123, doctor D001 / doc123\n  Press Ctrl+C to stop.\n";

    std::vector<Client> clients;
    for (;;) {
        fd_set rs;
        FD_ZERO(&rs);
        FD_SET(srv, &rs);
        sock_t maxfd = srv;
        for (const Client& c : clients) { FD_SET(c.fd, &rs); if (c.fd > maxfd) maxfd = c.fd; }
        timeval tv{1, 0};
        if (select(static_cast<int>(maxfd) + 1, &rs, nullptr, nullptr, &tv) < 0) continue;

        if (FD_ISSET(srv, &rs)) {
            sock_t fd = accept(srv, nullptr, nullptr);
            if (fd != BAD_SOCK) clients.push_back({fd, "", std::time(nullptr)});
        }
        std::time_t now = std::time(nullptr);
        for (std::size_t i = 0; i < clients.size();) {
            Client& c = clients[i];
            bool done = false;
            if (FD_ISSET(c.fd, &rs)) {
                char buf[8192];
                int n = static_cast<int>(recv(c.fd, buf, sizeof buf, 0));
                if (n <= 0) done = true;
                else {
                    c.buf.append(buf, static_cast<std::size_t>(n));
                    c.last = now;
                    std::size_t he = c.buf.find("\r\n\r\n");
                    if (he != std::string::npos) {
                        std::size_t len = 0, cl = lower(c.buf.substr(0, he)).find("content-length:");
                        if (cl != std::string::npos) len = static_cast<std::size_t>(toInt(trim(c.buf.substr(cl + 15, 12))));
                        if (c.buf.size() >= he + 4 + len || c.buf.size() > (1u << 20)) {
                            sendAll(c.fd, handle(c.buf, he));
                            done = true;
                        }
                    }
                }
            } else if (now - c.last > 15) done = true;   // drop idle/pre-connected sockets
            if (done) { CLOSESOCK(c.fd); clients.erase(clients.begin() + static_cast<long>(i)); }
            else ++i;
        }
    }
}
