// main.cpp - menu-driven console interface for CareBridge.
#include <iostream>
#include "CareBridge.h"

struct InputClosed {};

static std::string ask(const std::string& prompt) {
    std::cout << prompt;
    std::string s;
    if (!std::getline(std::cin, s)) throw InputClosed{};
    return trim(s);
}

static int askInt(const std::string& prompt, int lo, int hi) {
    for (;;) {
        std::string s = ask(prompt);
        char* end = nullptr;
        long v = std::strtol(s.c_str(), &end, 10);
        if (!s.empty() && *end == '\0' && v >= lo && v <= hi) return static_cast<int>(v);
        std::cout << "  Please enter a number from " << lo << " to " << hi << ".\n";
    }
}

static bool askYesNo(const std::string& prompt) {
    for (;;) {
        std::string s = lower(ask(prompt + " (y/n): "));
        if (s == "y" || s == "yes") return true;
        if (s == "n" || s == "no") return false;
    }
}

static void line() { std::cout << "------------------------------------------------------------\n"; }

static void printRecord(const HealthRecord& r) {
    std::cout << "  Record #" << r.id << "  " << r.date << "  (doctor " << r.doctorId << ")\n"
              << "    Symptoms : " << r.symptoms << "\n"
              << "    Diagnosis: " << r.diagnosis << "\n"
              << "    Tests    : " << r.tests << "\n"
              << "    Follow-up: " << r.followUp << "\n";
}

static const char* statusText(Status s) {
    return s == Status::Pending ? "Pending" : s == Status::Completed ? "Completed" : "Cancelled";
}

static void printAppointment(CareBridge& sys, const Appointment& a, bool forDoctor) {
    Doctor* d = sys.findDoctor(a.doctorId);
    Patient* p = sys.findPatient(a.patientId);
    std::cout << "  #" << a.id << "  " << a.time << "  "
              << (forDoctor ? (p ? p->name() : a.patientId) : (d ? d->name() : a.doctorId))
              << "  [" << (a.urgent ? "URGENT" : "normal") << ", " << statusText(a.status) << "]"
              << "  symptoms: " << a.symptoms << "\n";
}

static void printDoctors(CareBridge& sys, const std::vector<Doctor*>& docs) {
    if (docs.empty()) { std::cout << "  (no doctors found)\n"; return; }
    for (Doctor* d : docs) {
        Hospital* h = sys.findHospital(d->hospitalId());
        std::cout << "  " << d->id() << "  " << d->name() << " - " << d->specialization()
                  << "  @ " << (h ? h->name : d->hospitalId())
                  << "  (" << d->freeSlots().size() << " free slots)\n";
    }
}

static Hospital* chooseHospital(CareBridge& sys, Patient* p) {
    auto hospitals = sys.nearbyHospitals(p->city());
    if (hospitals.empty()) {
        std::cout << "  No hospital found in " << p->city() << ". Showing all hospitals.\n";
        hospitals = sys.allHospitals();
    } else {
        std::cout << "  Hospitals near " << p->city() << ":\n";
    }
    for (Hospital* h : hospitals) std::cout << "  " << h->id << "  " << h->name << " (" << h->city << ")\n";
    return sys.findHospital(ask("Hospital id: "));
}

// ------------------------------------------------------------ patient menu
static void bookFlow(CareBridge& sys, Patient* p) {
    Hospital* h = chooseHospital(sys, p);
    if (!h) { std::cout << "  Unknown hospital id.\n"; return; }
    auto docs = sys.doctorsAt(h->id);
    printDoctors(sys, docs);
    Doctor* d = sys.findDoctor(ask("Doctor id: "));
    if (!d || d->hospitalId() != h->id) { std::cout << "  Unknown doctor for this hospital.\n"; return; }

    std::string symptoms = ask("Describe your symptoms: ");
    bool urgent = askYesNo("Is this urgent?");
    auto free = d->freeSlots();
    if (free.empty()) {
        std::cout << "  " << d->name() << " has no free slots.\n";
        if (askYesNo("Join the waiting list?") && sys.joinWaitlist(p->id(), d->id(), symptoms, urgent))
            std::cout << "  Added to waiting list. You get the first slot that opens.\n";
        return;
    }
    std::cout << "  Free slots:\n";
    for (std::size_t i = 0; i < free.size(); ++i) std::cout << "   " << i + 1 << ") " << free[i] << "\n";
    int pick = askInt("Choose slot: ", 1, static_cast<int>(free.size()));
    Appointment* a = nullptr;
    if (sys.book(p->id(), d->id(), free[pick - 1], symptoms, urgent, &a) == BookResult::Booked)
        std::cout << "  Booked! Appointment #" << a->id << " with " << d->name() << " at " << a->time << ".\n";
    else
        std::cout << "  Could not book that slot.\n";
}

static void patientMenu(CareBridge& sys, Patient* p) {
    for (;;) {
        line();
        std::cout << "PATIENT MENU - " << p->summary() << "\n"
                  << " 1) Nearby hospitals\n 2) Browse doctors of a hospital\n"
                  << " 3) Search doctors by specialization\n 4) Book appointment\n"
                  << " 5) My appointments\n 6) Cancel appointment\n 7) My health records\n"
                  << " 0) Logout\n";
        switch (askInt("Choice: ", 0, 7)) {
            case 0: return;
            case 1: {
                auto hs = sys.nearbyHospitals(p->city());
                if (hs.empty()) { std::cout << "  None in " << p->city() << ".\n"; hs = sys.allHospitals(); }
                for (Hospital* h : hs) std::cout << "  " << h->id << "  " << h->name << " (" << h->city << ")\n";
                break;
            }
            case 2: {
                for (Hospital* h : sys.allHospitals()) std::cout << "  " << h->id << "  " << h->name << "\n";
                Hospital* h = sys.findHospital(ask("Hospital id: "));
                if (h) printDoctors(sys, sys.doctorsAt(h->id)); else std::cout << "  Unknown hospital id.\n";
                break;
            }
            case 3: printDoctors(sys, sys.searchDoctorsBySpecialization(ask("Specialization: "))); break;
            case 4: bookFlow(sys, p); break;
            case 5: {
                auto v = sys.appointmentsOfPatient(p->id());
                if (v.empty()) std::cout << "  No appointments yet.\n";
                for (Appointment* a : v) printAppointment(sys, *a, false);
                break;
            }
            case 6: {
                int id = askInt("Appointment id to cancel: ", 1, 1000000);
                std::string promoted;
                if (sys.cancel(id, p->id(), &promoted)) {
                    std::cout << "  Appointment cancelled.\n";
                    if (!promoted.empty()) std::cout << "  (Slot given to waiting patient " << promoted << ".)\n";
                } else std::cout << "  Cannot cancel (wrong id or not pending).\n";
                break;
            }
            case 7: {
                auto v = sys.recordsSorted(p->id());
                if (v.empty()) std::cout << "  No health records yet.\n";
                for (HealthRecord* r : v) printRecord(*r);
                break;
            }
        }
    }
}

// ------------------------------------------------------------- doctor menu
static void consultation(CareBridge& sys, Doctor* d) {
    Appointment* a = sys.serveNext(d->id());
    if (!a) { std::cout << "  No pending appointments.\n"; return; }
    Patient* p = sys.findPatient(a->patientId);
    std::cout << "  Now serving: " << (p ? p->summary() : a->patientId)
              << (a->urgent ? "  [URGENT]" : "") << "\n  Symptoms: " << a->symptoms << "\n";
    std::string diag = ask("Diagnosis: ");
    std::string tests = ask("Tests advised: ");
    std::string follow = ask("Follow-up visit: ");
    HealthRecord* r = sys.completeConsultation(a, diag, tests, follow);
    if (r) std::cout << "  Health record #" << r->id << " saved.\n";
}

static void doctorMenu(CareBridge& sys, Doctor* d) {
    for (;;) {
        line();
        std::cout << "DOCTOR MENU - " << d->summary() << "\n"
                  << " 1) Pending appointments (urgent first)\n 2) Serve next patient\n"
                  << " 3) View my slots\n 4) Open a slot\n 5) Close a slot\n"
                  << " 6) Search patient / view records\n 7) Update a health record\n"
                  << " 8) Undo last record update\n 0) Logout\n";
        switch (askInt("Choice: ", 0, 8)) {
            case 0: return;
            case 1: {
                auto v = sys.pendingFor(d->id());
                if (v.empty()) std::cout << "  No pending appointments.\n";
                for (Appointment* a : v) printAppointment(sys, *a, true);
                std::cout << "  Waiting list: " << d->waitlist.size() << " patient(s)\n";
                break;
            }
            case 2: consultation(sys, d); break;
            case 3:
                for (const Slot& s : d->allSlots()) std::cout << "  " << s.time << (s.booked ? "  booked\n" : "  free\n");
                break;
            case 4: {
                std::string t = ask("Time to open (HH:MM): "), promoted;
                if (sys.openSlot(d->id(), t, &promoted)) {
                    std::cout << "  Slot opened.\n";
                    if (!promoted.empty()) std::cout << "  (Given to waiting patient " << promoted << ".)\n";
                } else std::cout << "  Invalid time or slot already exists.\n";
                break;
            }
            case 5:
                std::cout << (sys.closeSlot(d->id(), ask("Time to close (HH:MM): "))
                                  ? "  Slot closed.\n" : "  Cannot close (not found or already booked).\n");
                break;
            case 6: {
                auto v = sys.searchPatients(ask("Patient id or name: "));
                if (v.empty()) std::cout << "  No matching patient.\n";
                for (Patient* p : v) {
                    std::cout << "  " << p->summary() << "\n";
                    for (HealthRecord* r : sys.recordsSorted(p->id())) printRecord(*r);
                }
                break;
            }
            case 7: {
                std::string pid = ask("Patient id: ");
                int rid = askInt("Record id: ", 1, 1000000);
                std::string diag = ask("New diagnosis: "), tests = ask("New tests: "), follow = ask("New follow-up: ");
                std::cout << (sys.updateRecord(pid, rid, diag, tests, follow) ? "  Record updated.\n" : "  Record not found.\n");
                break;
            }
            case 8:
                std::cout << (sys.undoRecordUpdate(ask("Patient id: ")) ? "  Last update undone.\n" : "  Nothing to undo.\n");
                break;
        }
    }
}

// -------------------------------------------------------------------- main
int main() {
    CareBridge sys("data");
    std::cout << "============================================================\n"
              << "  CareBridge - Healthcare Management System (prototype)\n"
              << "  Sample data only. Demo logins: P001/pat123, D001/doc123\n"
              << "============================================================\n";
    try {
        for (;;) {
            line();
            std::cout << "MAIN MENU\n 1) Patient login\n 2) Doctor login\n 3) Register as new patient\n 0) Exit\n";
            int c = askInt("Choice: ", 0, 3);
            if (c == 0) break;
            if (c == 3) {
                std::string name = ask("Full name: ");
                int age = askInt("Age: ", 0, 120);
                std::string city = ask("City: ");
                std::string pw = ask("Choose password: ");
                if (name.empty() || pw.empty()) { std::cout << "  Name and password are required.\n"; continue; }
                Patient* p = sys.registerPatient(name, pw, age, city);
                std::cout << "  Registered. Your patient id is " << p->id() << ".\n";
                continue;
            }
            std::string role = (c == 1) ? "patient" : "doctor";
            std::string id = ask("Id: "), pw = ask("Password: ");
            User* u = sys.login(id, pw, role);
            if (!u) { std::cout << "  Login failed.\n"; continue; }
            if (c == 1) patientMenu(sys, static_cast<Patient*>(u));
            else doctorMenu(sys, static_cast<Doctor*>(u));
        }
    } catch (const InputClosed&) {
        std::cout << "\n";
    }
    sys.save();
    std::cout << "Goodbye.\n";
    return 0;
}
