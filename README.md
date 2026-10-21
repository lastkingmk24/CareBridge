# CareBridge - Healthcare Support for Better Diagnosis

Team ID: DSCPP-III-2026-T404 | Section ML4 | Mentor: Mr. Kuldeep Nautiyal
Team: Ring kei Ring (Team Lead, 2029001), Makuei Achol Makuei, Simon (2028173)

A lightweight, menu-driven C++ prototype of a Healthcare Management System that
combines **Data Structures** and **Object-Oriented Programming**.
It is an academic prototype: all data is sample data, hospital "nearby" search uses
predefined cities (no GPS), and passwords are only hashed with a simple
non-cryptographic hash (FNV-1a). Do not store real medical data.

## Features
* Role-based login: patient or doctor (plus patient self-registration)
* Patients: nearby hospitals, browse/search doctors, book / cancel appointments,
  join a waiting list when a doctor is fully booked, view health history
* Doctors: pending appointments (urgent first), serve next patient and write a
  health record, open/close slots, search patients, update records, undo last update
* Persistent storage in plain text files under `data/` (created on first run)

## Quick start (web interface - recommended)
The C++ program is also a small web server. It serves the interface in `web/` and a
JSON API, and opens only on your own computer (127.0.0.1).

| Your system | What to do |
|-------------|-----------|
| **Windows** | Install [MSYS2](https://www.msys2.org) and run `pacman -S mingw-w64-ucrt-x86_64-gcc` (or use any MinGW-w64 g++). Open the *MSYS2 UCRT64* terminal in this folder and double-click / run `run_web.bat`, or: `g++ -std=c++17 -O2 -o carebridge_web.exe src/server.cpp src/CareBridge.cpp -lws2_32` then `carebridge_web.exe` |
| **Windows (WSL)** | In Ubuntu/WSL: `sudo apt install g++ make`, then `./run_web.sh` and open http://localhost:8080 in your Windows browser |
| **Linux** | `sudo apt install g++ make` then `./run_web.sh` |
| **macOS** | `xcode-select --install` then `./run_web.sh` |
| **GitHub Codespaces** | Open the repo in a Codespace, run `./run_web.sh`, click "Open in Browser" on the forwarded port 8080 |

Then open **http://localhost:8080**. Run it from this folder (it reads `web/` and writes `data/` here).
To use another port: `./carebridge_web 9090`.

Demo logins (sample data): patient `P001` / `pat123`, doctor `D001` / `doc123`
(sample doctors D001-D005 all use `doc123`). New patients can register on the login page.

## Console version and tests
    make              # builds carebridge (console), carebridge_web and tests
    make run          # console menus
    make web          # web server
    make test         # 23 automated tests
    make clean

Online compilers (OnlineGDB, etc.) can run only the console version
(`src/main.cpp` + `src/CareBridge.cpp`), not the web interface.

## Web interface
* Login / registration with role tabs (patient, doctor), light and dark theme
* **Patient:** dashboard, find care (hospital filter, search by name/specialization),
  booking with slot picker and urgent switch, waiting list, appointments with
  cancel, health-record timeline
* **Doctor:** dashboard with next patient, priority queue (urgent first), consultation
  form that writes the health record, slot manager (open/close), appointment history,
  patient search, record editing with undo

## Project structure
| File | Purpose |
|------|---------|
| `src/DataStructures.h` | Hand-written `LinkedList`, `Queue`, `Stack`, `PriorityQueue` (binary heap), insertion sort, binary search |
| `src/Models.h` | OOP classes: abstract `User` -> `Patient`, `Doctor`; `Hospital`, `Appointment`, `HealthRecord` |
| `src/Utils.h` | String / date helpers, password hash |
| `src/CareBridge.h/.cpp` | Core logic and file persistence (no console I/O, so it is testable) |
| `src/main.cpp` | Console menus (patient / doctor) |
| `src/server.cpp` | Web server (select-based HTTP, Winsock/POSIX) and JSON API on top of `CareBridge` |
| `web/` | Web interface: `index.html`, `style.css`, `app.js` (no external libraries) |
| `run_web.sh`, `run_web.bat` | One-step build and start |
| `src/tests.cpp` | 23 automated tests |

## Where each concept is used
| Concept | Used for |
|---------|----------|
| Linked list | users, hospitals, appointments, doctor slots, patient health records |
| Priority queue (heap) | each doctor's pending appointments - urgent first, then earliest booking |
| Queue (FIFO) | doctor waiting list; first waiting patient gets a freed slot |
| Stack (LIFO) | undo history for health-record edits |
| Insertion sort | doctors by name, slots by time, records newest-first |
| Binary search | find a doctor by exact name |
| Inheritance / polymorphism | `User` -> `Patient`, `Doctor` (`role()`, `summary()`, `serialize()`) |
| Encapsulation | private/protected data with getters; logic separated from UI |
| File handling | `data/*.txt` save and load (heap is rebuilt on start-up) |

## Data files (pipe-separated)
`hospitals.txt`, `users.txt`, `slots.txt`, `appointments.txt`, `waitlist.txt`, `records.txt`.
Delete the `data/` folder to reset to the sample data.

## Known limitations (future work)
* Nearby hospitals matched by city name only (no GPS)
* Web server is for local/demo use: single-threaded, plain HTTP, session tokens kept in memory
* The Windows (Winsock) build path could not be tested in the authoring environment; the Linux build and the full browser flow were
* Undo history lives only for the current session
* Passwords use a simple hash, not a production-grade scheme
