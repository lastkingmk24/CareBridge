#include "CareBridge.h"
#include <filesystem>
#include <fstream>

namespace fs = std::filesystem;

CareBridge::CareBridge(const std::string& dataDir) : dir_(dataDir) { load(); }

CareBridge::~CareBridge() {
    users_.forEach([](User*& u) { delete u; u = nullptr; });
}

// ------------------------------------------------------------------ lookups
User* CareBridge::findUser(const std::string& id) {
    User** u = users_.find([&](User* x) { return x->id() == id; });
    return u ? *u : nullptr;
}
Patient* CareBridge::findPatient(const std::string& id) {
    return dynamic_cast<Patient*>(findUser(id));
}
Doctor* CareBridge::findDoctor(const std::string& id) {
    return dynamic_cast<Doctor*>(findUser(id));
}
Hospital* CareBridge::findHospital(const std::string& id) {
    return hospitals_.find([&](const Hospital& h) { return h.id == id; });
}

// ----------------------------------------------------------------- accounts
Patient* CareBridge::registerPatient(const std::string& name, const std::string& password,
                                     int age, const std::string& city) {
    char buf[16];
    std::snprintf(buf, sizeof buf, "P%03d", nextPatientNo_++);
    Patient* p = new Patient(buf, clean(name), hashPassword(password), age, clean(city));
    users_.pushBack(p);
    save();
    return p;
}

User* CareBridge::login(const std::string& id, const std::string& password,
                        const std::string& role) {
    User* u = findUser(id);
    if (u && u->role() == role && u->checkPassword(password)) return u;
    return nullptr;
}

// ------------------------------------------------- hospitals & doctor search
std::vector<Hospital*> CareBridge::allHospitals() {
    std::vector<Hospital*> v;
    hospitals_.forEach([&](Hospital& h) { v.push_back(&h); });
    return v;
}

std::vector<Hospital*> CareBridge::nearbyHospitals(const std::string& city) {
    std::vector<Hospital*> v;
    hospitals_.forEach([&](Hospital& h) { if (lower(h.city) == lower(city)) v.push_back(&h); });
    return v;
}

std::vector<Doctor*> CareBridge::allDoctorsSorted() {
    std::vector<Doctor*> v;
    users_.forEach([&](User* u) { if (Doctor* d = dynamic_cast<Doctor*>(u)) v.push_back(d); });
    insertionSort(v, [](Doctor* a, Doctor* b) { return lower(a->name()) < lower(b->name()); });
    return v;
}

std::vector<Doctor*> CareBridge::doctorsAt(const std::string& hospitalId) {
    std::vector<Doctor*> v;
    for (Doctor* d : allDoctorsSorted()) if (d->hospitalId() == hospitalId) v.push_back(d);
    return v;
}

std::vector<Doctor*> CareBridge::searchDoctorsBySpecialization(const std::string& text) {
    std::vector<Doctor*> v;
    for (Doctor* d : allDoctorsSorted()) if (contains(d->specialization(), text)) v.push_back(d);
    return v;
}

Doctor* CareBridge::findDoctorByName(const std::string& name) {
    std::vector<Doctor*> v = allDoctorsSorted();
    int i = binarySearch(v, lower(name), [](Doctor* d) { return lower(d->name()); });
    return i < 0 ? nullptr : v[i];
}

// -------------------------------------------------------------- appointments
BookResult CareBridge::book(const std::string& patientId, const std::string& doctorId,
                            const std::string& time, const std::string& symptoms,
                            bool urgent, Appointment** out) {
    Patient* p = findPatient(patientId);
    Doctor* d = findDoctor(doctorId);
    if (!p || !d) return BookResult::Invalid;
    if (!d->bookSlot(time)) return BookResult::SlotTaken;

    Appointment a{nextApptId_++, patientId, doctorId, time, urgent, clean(symptoms), Status::Pending};
    Appointment* stored = appointments_.pushBack(a);
    d->pending.push(stored);
    if (out) *out = stored;
    save();
    return BookResult::Booked;
}

bool CareBridge::joinWaitlist(const std::string& patientId, const std::string& doctorId,
                              const std::string& symptoms, bool urgent) {
    if (!findPatient(patientId)) return false;
    Doctor* d = findDoctor(doctorId);
    if (!d) return false;
    d->waitlist.enqueue({patientId, urgent, clean(symptoms)});
    save();
    return true;
}

// When a slot becomes free, the first patient in the waiting queue gets it.
void CareBridge::promoteFromWaitlist(Doctor* d, const std::string& time, std::string* promoted) {
    WaitEntry w;
    while (d->waitlist.dequeue(w)) {
        if (book(w.patientId, d->id(), time, w.symptoms, w.urgent) == BookResult::Booked) {
            if (promoted) *promoted = w.patientId;
            return;
        }
    }
}

bool CareBridge::cancel(int appointmentId, const std::string& patientId, std::string* promoted) {
    Appointment* a = appointments_.find([&](const Appointment& x) { return x.id == appointmentId; });
    if (!a || a->patientId != patientId || a->status != Status::Pending) return false;
    a->status = Status::Cancelled;   // stays in the heap; skipped lazily when served
    Doctor* d = findDoctor(a->doctorId);
    if (d) {
        d->releaseSlot(a->time);
        promoteFromWaitlist(d, a->time, promoted);
    }
    save();
    return true;
}

std::vector<Appointment*> CareBridge::appointmentsOfPatient(const std::string& patientId) {
    std::vector<Appointment*> v;
    appointments_.forEach([&](Appointment& a) { if (a.patientId == patientId) v.push_back(&a); });
    return v;
}

std::vector<Appointment*> CareBridge::appointmentsOfDoctor(const std::string& doctorId) {
    std::vector<Appointment*> v;
    appointments_.forEach([&](Appointment& a) { if (a.doctorId == doctorId) v.push_back(&a); });
    return v;
}

std::vector<Appointment*> CareBridge::pendingFor(const std::string& doctorId) {
    std::vector<Appointment*> v;
    Doctor* d = findDoctor(doctorId);
    if (!d) return v;
    for (Appointment* a : d->pending.sorted()) if (a->status == Status::Pending) v.push_back(a);
    return v;
}

Appointment* CareBridge::serveNext(const std::string& doctorId) {
    Doctor* d = findDoctor(doctorId);
    if (!d) return nullptr;
    Appointment* a = nullptr;
    while (d->pending.pop(a)) if (a->status == Status::Pending) return a;
    return nullptr;
}

// ------------------------------------------------------------- slot handling
bool CareBridge::openSlot(const std::string& doctorId, const std::string& time, std::string* promoted) {
    Doctor* d = findDoctor(doctorId);
    if (!d || !isValidTime(time) || !d->addSlot(time)) return false;
    promoteFromWaitlist(d, time, promoted);
    save();
    return true;
}

bool CareBridge::closeSlot(const std::string& doctorId, const std::string& time) {
    Doctor* d = findDoctor(doctorId);
    if (!d || !d->closeSlot(time)) return false;
    save();
    return true;
}

// ------------------------------------------------------------ health records
HealthRecord* CareBridge::completeConsultation(Appointment* a, const std::string& diagnosis,
                                               const std::string& tests, const std::string& followUp,
                                               const std::string& date) {
    if (!a) return nullptr;
    Patient* p = findPatient(a->patientId);
    if (!p) return nullptr;
    HealthRecord r{nextRecId_++, a->patientId, a->doctorId, date.empty() ? todayDate() : date,
                   a->symptoms, clean(diagnosis), clean(tests), clean(followUp)};
    HealthRecord* stored = p->records.pushBack(r);
    a->status = Status::Completed;
    save();
    return stored;
}

bool CareBridge::updateRecord(const std::string& patientId, int recordId, const std::string& diagnosis,
                              const std::string& tests, const std::string& followUp) {
    Patient* p = findPatient(patientId);
    if (!p) return false;
    HealthRecord* r = p->records.find([&](const HealthRecord& x) { return x.id == recordId; });
    if (!r) return false;
    p->undoStack.push(*r);             // remember the old version
    r->diagnosis = clean(diagnosis);
    r->tests = clean(tests);
    r->followUp = clean(followUp);
    save();
    return true;
}

bool CareBridge::undoRecordUpdate(const std::string& patientId) {
    Patient* p = findPatient(patientId);
    HealthRecord old;
    if (!p || !p->undoStack.pop(old)) return false;
    HealthRecord* r = p->records.find([&](const HealthRecord& x) { return x.id == old.id; });
    if (!r) return false;
    *r = old;
    save();
    return true;
}

std::vector<HealthRecord*> CareBridge::recordsSorted(const std::string& patientId) {
    std::vector<HealthRecord*> v;
    Patient* p = findPatient(patientId);
    if (!p) return v;
    p->records.forEach([&](HealthRecord& r) { v.push_back(&r); });
    insertionSort(v, [](HealthRecord* a, HealthRecord* b) {
        return a->date != b->date ? a->date > b->date : a->id > b->id;
    });
    return v;
}

std::vector<Patient*> CareBridge::searchPatients(const std::string& query) {
    std::vector<Patient*> v;
    users_.forEach([&](User* u) {
        Patient* p = dynamic_cast<Patient*>(u);
        if (p && (lower(p->id()) == lower(query) || contains(p->name(), query))) v.push_back(p);
    });
    return v;
}

// --------------------------------------------------------------- persistence
void CareBridge::save() const {
    fs::create_directories(dir_);
    {
        std::ofstream f(dir_ + "/hospitals.txt");
        hospitals_.forEach([&](const Hospital& h) { f << h.id << '|' << h.name << '|' << h.city << '\n'; });
    }
    std::ofstream users(dir_ + "/users.txt"), slots(dir_ + "/slots.txt"),
        wait(dir_ + "/waitlist.txt"), recs(dir_ + "/records.txt");
    users_.forEach([&](User* u) {
        users << u->serialize() << '\n';
        if (const Doctor* d = dynamic_cast<const Doctor*>(u)) {
            d->slots.forEach([&](const Slot& s) {
                slots << d->id() << '|' << s.time << '|' << (s.booked ? 1 : 0) << '\n';
            });
            d->waitlist.forEach([&](const WaitEntry& w) {
                wait << d->id() << '|' << w.patientId << '|' << (w.urgent ? 1 : 0) << '|' << w.symptoms << '\n';
            });
        } else if (const Patient* p = dynamic_cast<const Patient*>(u)) {
            p->records.forEach([&](const HealthRecord& r) {
                recs << r.id << '|' << r.patientId << '|' << r.doctorId << '|' << r.date << '|'
                     << r.symptoms << '|' << r.diagnosis << '|' << r.tests << '|' << r.followUp << '\n';
            });
        }
    });
    std::ofstream appts(dir_ + "/appointments.txt");
    appointments_.forEach([&](const Appointment& a) {
        appts << a.id << '|' << a.patientId << '|' << a.doctorId << '|' << a.time << '|'
              << (a.urgent ? 1 : 0) << '|' << a.symptoms << '|' << static_cast<int>(a.status) << '\n';
    });
}

void CareBridge::load() {
    std::ifstream hf(dir_ + "/hospitals.txt");
    if (!hf) { seedSampleData(); save(); return; }

    std::string line;
    while (std::getline(hf, line)) {
        auto f = split(line);
        if (f.size() >= 3) hospitals_.pushBack({f[0], f[1], f[2]});
    }
    std::ifstream uf(dir_ + "/users.txt");
    while (std::getline(uf, line)) {
        auto f = split(line);
        if (f.size() >= 6 && f[0] == "P") {
            users_.pushBack(new Patient(f[1], f[2], f[3], toInt(f[4]), f[5]));
            int n = toInt(f[1].substr(1));
            if (n >= nextPatientNo_) nextPatientNo_ = n + 1;
        } else if (f.size() >= 6 && f[0] == "D") {
            users_.pushBack(new Doctor(f[1], f[2], f[3], f[4], f[5]));
        }
    }
    std::ifstream sf(dir_ + "/slots.txt");
    while (std::getline(sf, line)) {
        auto f = split(line);
        Doctor* d = f.size() >= 3 ? findDoctor(f[0]) : nullptr;
        if (d) { d->addSlot(f[1]); if (f[2] == "1") d->bookSlot(f[1]); }
    }
    std::ifstream af(dir_ + "/appointments.txt");
    while (std::getline(af, line)) {
        auto f = split(line);
        if (f.size() < 7) continue;
        Appointment a{toInt(f[0]), f[1], f[2], f[3], f[4] == "1", f[5], static_cast<Status>(toInt(f[6]))};
        Appointment* stored = appointments_.pushBack(a);
        if (a.id >= nextApptId_) nextApptId_ = a.id + 1;
        Doctor* d = findDoctor(a.doctorId);
        if (d && a.status == Status::Pending) d->pending.push(stored);   // rebuild the heap
    }
    std::ifstream wf(dir_ + "/waitlist.txt");
    while (std::getline(wf, line)) {
        auto f = split(line);
        Doctor* d = f.size() >= 4 ? findDoctor(f[0]) : nullptr;
        if (d) d->waitlist.enqueue({f[1], f[2] == "1", f[3]});
    }
    std::ifstream rf(dir_ + "/records.txt");
    while (std::getline(rf, line)) {
        auto f = split(line);
        Patient* p = f.size() >= 8 ? findPatient(f[1]) : nullptr;
        if (!p) continue;
        HealthRecord r{toInt(f[0]), f[1], f[2], f[3], f[4], f[5], f[6], f[7]};
        p->records.pushBack(r);
        if (r.id >= nextRecId_) nextRecId_ = r.id + 1;
    }
}

// Sample data only (fictional hospitals/doctors) - no real medical data.
void CareBridge::seedSampleData() {
    hospitals_.pushBack({"H1", "Doon CareBridge Hospital", "Dehradun"});
    hospitals_.pushBack({"H2", "Rishikesh Community Hospital", "Rishikesh"});
    hospitals_.pushBack({"H3", "Delhi Central Hospital", "Delhi"});

    struct Seed { const char *id, *name, *spec, *hosp; };
    const Seed docs[] = {
        {"D001", "Dr. Anil Rawat",  "Cardiology",       "H1"},
        {"D002", "Dr. Meera Joshi", "General Medicine", "H1"},
        {"D003", "Dr. Sameer Khan", "Pediatrics",       "H2"},
        {"D004", "Dr. Kavita Negi", "Dermatology",      "H2"},
        {"D005", "Dr. Rohit Sharma","Orthopedics",      "H3"},
    };
    for (const Seed& s : docs) {
        Doctor* d = new Doctor(s.id, s.name, hashPassword("doc123"), s.spec, s.hosp);
        for (const char* t : {"09:00", "10:00", "11:00", "14:00"}) d->addSlot(t);
        users_.pushBack(d);
    }
    users_.pushBack(new Patient("P001", "Demo Patient", hashPassword("pat123"), 20, "Dehradun"));
    nextPatientNo_ = 2;
}
