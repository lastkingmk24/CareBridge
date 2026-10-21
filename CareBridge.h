// CareBridge.h - core system: users, hospitals, appointments, records,
// plus file persistence. No console I/O here (that lives in main.cpp),
// so the logic can be unit-tested.
#pragma once
#include <string>
#include <vector>
#include "Models.h"

enum class BookResult { Booked, SlotTaken, Invalid };

class CareBridge {
    std::string dir_;
    LinkedList<Hospital> hospitals_;
    LinkedList<User*> users_;                 // owns the User objects
    LinkedList<Appointment> appointments_;
    int nextApptId_ = 1;
    int nextRecId_ = 1;
    int nextPatientNo_ = 1;

    void load();
    void seedSampleData();
    void promoteFromWaitlist(Doctor* d, const std::string& time, std::string* promoted);

public:
    explicit CareBridge(const std::string& dataDir = "data");
    ~CareBridge();
    CareBridge(const CareBridge&) = delete;
    CareBridge& operator=(const CareBridge&) = delete;

    void save() const;

    // accounts
    Patient* registerPatient(const std::string& name, const std::string& password,
                             int age, const std::string& city);
    User* login(const std::string& id, const std::string& password, const std::string& role);
    User* findUser(const std::string& id);
    Patient* findPatient(const std::string& id);
    Doctor* findDoctor(const std::string& id);
    Hospital* findHospital(const std::string& id);

    // hospitals & doctors (searching / sorting)
    std::vector<Hospital*> allHospitals();
    std::vector<Hospital*> nearbyHospitals(const std::string& city);
    std::vector<Doctor*> allDoctorsSorted();                       // by name
    std::vector<Doctor*> doctorsAt(const std::string& hospitalId); // by name
    std::vector<Doctor*> searchDoctorsBySpecialization(const std::string& text);
    Doctor* findDoctorByName(const std::string& name);             // binary search

    // appointments
    BookResult book(const std::string& patientId, const std::string& doctorId,
                    const std::string& time, const std::string& symptoms,
                    bool urgent, Appointment** out = nullptr);
    bool joinWaitlist(const std::string& patientId, const std::string& doctorId,
                      const std::string& symptoms, bool urgent);
    bool cancel(int appointmentId, const std::string& patientId,
                std::string* promotedPatient = nullptr);
    std::vector<Appointment*> appointmentsOfPatient(const std::string& patientId);
    std::vector<Appointment*> appointmentsOfDoctor(const std::string& doctorId);
    std::vector<Appointment*> pendingFor(const std::string& doctorId); // priority order
    Appointment* serveNext(const std::string& doctorId);

    // doctor slot management
    bool openSlot(const std::string& doctorId, const std::string& time,
                  std::string* promotedPatient = nullptr);
    bool closeSlot(const std::string& doctorId, const std::string& time);

    // health records
    HealthRecord* completeConsultation(Appointment* a, const std::string& diagnosis,
                                       const std::string& tests, const std::string& followUp,
                                       const std::string& date = "");
    bool updateRecord(const std::string& patientId, int recordId, const std::string& diagnosis,
                      const std::string& tests, const std::string& followUp);
    bool undoRecordUpdate(const std::string& patientId);
    std::vector<HealthRecord*> recordsSorted(const std::string& patientId); // newest first
    std::vector<Patient*> searchPatients(const std::string& query);
};
