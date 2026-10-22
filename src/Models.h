// Models.h - OOP classes: User (abstract) -> Patient, Doctor; plus plain
// record types Hospital, Appointment, HealthRecord.
#pragma once
#include <string>
#include <vector>
#include "DataStructures.h"
#include "Utils.h"

enum class Status { Pending = 0, Completed = 1, Cancelled = 2 };

struct Slot        { std::string time; bool booked; };
struct Hospital    { std::string id, name, city; };
struct WaitEntry   { std::string patientId; bool urgent; std::string symptoms; };

struct Appointment {
    int id;
    std::string patientId, doctorId, time;
    bool urgent;
    std::string symptoms;
    Status status;
};

struct HealthRecord {
    int id;
    std::string patientId, doctorId, date;
    std::string symptoms, diagnosis, tests, followUp;
};

// Urgent appointments first; within the same urgency, earlier booking first.
struct AppointmentBefore {
    bool operator()(const Appointment* a, const Appointment* b) const {
        if (a->urgent != b->urgent) return a->urgent;
        return a->id < b->id;
    }
};

// ---------------------------------------------------------------------- User
class User {
protected:
    std::string id_, name_, passHash_;

public:
    User(const std::string& id, const std::string& name, const std::string& hash)
        : id_(id), name_(name), passHash_(hash) {}
    virtual ~User() = default;

    const std::string& id() const { return id_; }
    const std::string& name() const { return name_; }
    bool checkPassword(const std::string& p) const { return passHash_ == hashPassword(p); }

    // Polymorphic interface.
    virtual std::string role() const = 0;
    virtual std::string summary() const = 0;
    virtual std::string serialize() const = 0;
};

// ------------------------------------------------------------------- Patient
class Patient : public User {
    int age_;
    std::string city_;

public:
    LinkedList<HealthRecord> records;   // the patient's medical history
    Stack<HealthRecord> undoStack;      // previous versions, for undo (per session)

    Patient(const std::string& id, const std::string& name, const std::string& hash,
            int age, const std::string& city)
        : User(id, name, hash), age_(age), city_(city) {}

    int age() const { return age_; }
    const std::string& city() const { return city_; }

    std::string role() const override { return "patient"; }
    std::string summary() const override {
        return id_ + "  " + name_ + " (age " + std::to_string(age_) + ", " + city_ + ")";
    }
    std::string serialize() const override {
        return "P|" + id_ + "|" + name_ + "|" + passHash_ + "|" + std::to_string(age_) + "|" + city_;
    }
};

// -------------------------------------------------------------------- Doctor
class Doctor : public User {
    std::string specialization_, hospitalId_;

public:
    LinkedList<Slot> slots;                                  // availability
    PriorityQueue<Appointment*, AppointmentBefore> pending;  // urgent first
    Queue<WaitEntry> waitlist;                               // FIFO when fully booked

    Doctor(const std::string& id, const std::string& name, const std::string& hash,
           const std::string& spec, const std::string& hospitalId)
        : User(id, name, hash), specialization_(spec), hospitalId_(hospitalId) {}

    const std::string& specialization() const { return specialization_; }
    const std::string& hospitalId() const { return hospitalId_; }

    std::string role() const override { return "doctor"; }
    std::string summary() const override { return name_ + " - " + specialization_; }
    std::string serialize() const override {
        return "D|" + id_ + "|" + name_ + "|" + passHash_ + "|" + specialization_ + "|" + hospitalId_;
    }

    // Open a new time slot. False if it already exists.
    bool addSlot(const std::string& time) {
        if (slots.find([&](const Slot& s) { return s.time == time; })) return false;
        slots.pushBack({time, false});
        return true;
    }
    // Close (remove) a slot. Only allowed while it is still free.
    bool closeSlot(const std::string& time) {
        Slot* s = slots.find([&](const Slot& x) { return x.time == time; });
        if (!s || s->booked) return false;
        return slots.removeIf([&](const Slot& x) { return x.time == time; });
    }
    bool bookSlot(const std::string& time) {
        Slot* s = slots.find([&](const Slot& x) { return x.time == time; });
        if (!s || s->booked) return false;
        s->booked = true;
        return true;
    }
    void releaseSlot(const std::string& time) {
        Slot* s = slots.find([&](const Slot& x) { return x.time == time; });
        if (s) s->booked = false;
    }
    // All slots (free and booked), sorted by time.
    std::vector<Slot> allSlots() const {
        std::vector<Slot> v;
        slots.forEach([&](const Slot& s) { v.push_back(s); });
        insertionSort(v, [](const Slot& a, const Slot& b) { return a.time < b.time; });
        return v;
    }
    std::vector<std::string> freeSlots() const {
        std::vector<std::string> v;
        for (const Slot& s : allSlots()) if (!s.booked) v.push_back(s.time);
        return v;
    }
};
