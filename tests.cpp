// tests.cpp - automated tests for the CareBridge logic (no console input).
#include <filesystem>
#include <iostream>
#include "CareBridge.h"

static int passed = 0, failed = 0;
#define CHECK(name, cond)                                                   \
    do {                                                                    \
        if (cond) { ++passed; std::cout << "PASS  " << name << "\n"; }      \
        else      { ++failed; std::cout << "FAIL  " << name << "\n"; }      \
    } while (0)

int main() {
    const std::string dir = "test_data";
    std::filesystem::remove_all(dir);
    {
        CareBridge sys(dir);

        // T1 login
        CHECK("T01 patient login with correct password", sys.login("P001", "pat123", "patient") != nullptr);
        CHECK("T02 login rejected: wrong password",      sys.login("P001", "bad", "patient") == nullptr);
        CHECK("T03 login rejected: wrong role",          sys.login("D001", "doc123", "patient") == nullptr);
        Patient* np = sys.registerPatient("Asha", "pw", 22, "Dehradun");
        CHECK("T04 new patient registered and can log in", np && sys.login(np->id(), "pw", "patient"));

        // search / sort
        CHECK("T05 nearby hospitals filtered by city",
              sys.nearbyHospitals("dehradun").size() == 1 && sys.nearbyHospitals("Mars").empty());
        auto docs = sys.doctorsAt("H1");
        CHECK("T06 doctors sorted by name",
              docs.size() == 2 && docs[0]->name() == "Dr. Anil Rawat" && docs[1]->name() == "Dr. Meera Joshi");
        CHECK("T07 search doctors by specialization", sys.searchDoctorsBySpecialization("cardio").size() == 1);
        Doctor* byName = sys.findDoctorByName("dr. kavita negi");
        CHECK("T08 binary search doctor by name", byName && byName->id() == "D004");

        // booking
        Appointment* a1 = nullptr;
        CHECK("T09 booking succeeds and marks slot booked",
              sys.book("P001", "D001", "09:00", "chest pain", false, &a1) == BookResult::Booked &&
              sys.findDoctor("D001")->freeSlots().size() == 3);
        CHECK("T10 double booking of same slot rejected",
              sys.book(np->id(), "D001", "09:00", "x", false) == BookResult::SlotTaken);

        // priority queue
        Appointment* a2 = nullptr;
        sys.book(np->id(), "D001", "10:00", "fever", true, &a2);
        auto pend = sys.pendingFor("D001");
        CHECK("T11 urgent appointment listed before normal", pend.size() == 2 && pend[0]->id == a2->id);
        Appointment* served = sys.serveNext("D001");
        CHECK("T12 serveNext returns urgent case first", served && served->id == a2->id);

        // health records + persistence
        HealthRecord* r = sys.completeConsultation(served, "Viral fever", "CBC", "after 1 week", "2026-10-01");
        CHECK("T13 consultation creates health record", r && sys.findPatient(np->id())->records.size() == 1);
        CHECK("T14 update record changes diagnosis",
              sys.updateRecord(np->id(), r->id, "Dengue", "NS1", "after 3 days") && r->diagnosis == "Dengue");
        CHECK("T15 undo restores previous record version",
              sys.undoRecordUpdate(np->id()) && r->diagnosis == "Viral fever");

        // slot management
        CHECK("T16 cannot close a booked slot",  !sys.closeSlot("D001", "09:00"));
        CHECK("T17 can close a free slot",        sys.closeSlot("D001", "11:00"));
        CHECK("T18 opening invalid time rejected", !sys.openSlot("D001", "25:99"));

        // waiting list (queue)
        for (const char* t : {"09:00", "10:00", "11:00", "14:00"}) sys.book("P001", "D003", t, "check", false);
        CHECK("T19 fully booked doctor has no free slots", sys.findDoctor("D003")->freeSlots().empty());
        sys.joinWaitlist(np->id(), "D003", "cough", false);
        std::string promoted;
        Appointment* last = sys.appointmentsOfPatient("P001").back();
        CHECK("T20 cancel promotes first waiting patient",
              sys.cancel(last->id, "P001", &promoted) && promoted == np->id());
    }
    {   // new instance reads the files written above
        CareBridge reloaded(dir);
        Patient* p = reloaded.findPatient("P002");
        CHECK("T21 records persist after restart", p && p->records.size() == 1);
        CHECK("T22 priority queue rebuilt from file", reloaded.pendingFor("D001").size() == 1);
        CHECK("T23 login still works after reload", reloaded.login("P002", "pw", "patient") != nullptr);
    }
    std::filesystem::remove_all(dir);
    std::cout << "\n" << passed << " passed, " << failed << " failed\n";
    return failed == 0 ? 0 : 1;
}
