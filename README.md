# CareBridge - Healthcare Support for Better Diagnosis

Team ID: DSCPP-III-2026-T404 | Section ML4 | Mentor: Mr. Kuldeep Nautiyal
Team: Ring kei Ring (Team Lead, 2029001), Makuei Achol Makuei, Simon (2028173)

A lightweight Healthcare Management System that combines **Data Structures** and
**Object-Oriented Programming** in C++17, with a browser interface served by a
small built-in HTTP server.

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

| Your system | What to do |
|-------------|-----------|
| **Windows** | Install [MSYS2](https://www.msys2.org) and run `pacman -S mingw-w64-ucrt-x86_64-gcc`. Open the *MSYS2 UCRT64* terminal in this folder and run `run_web.bat` (or: `g++ -std=c++17 -O2 -o carebridge_web.exe src/server.cpp src/CareBridge.cpp -lws2_32` then `carebridge_web.exe`) |
| **Windows (WSL)** | `sudo apt install g++ make`, then `./run_web.sh` and open http://localhost:8080 |
| **Linux** | `sudo apt install g++ make`, then `./run_web.sh` |
| **macOS** | `xcode-select --install`, then `./run_web.sh` |
| **GitHub Codespaces / container** | `CAREBRIDGE_HOST=0.0.0.0 ./run_web.sh 8080` and open the forwarded port |

Run it from the repository root: the server reads `web/` and writes `data/` there.
To use another port: `./carebridge_web 9090`.

Demo logins (sample data): patient `P001` / `pat123`, doctor `D001` / `doc123`
(sample doctors D001-D005 all use `doc123`). New patients can register on the login page.

## Live demo (GitHub Pages)

The interface is also published as a static site:
**https://lastkingmk24.github.io/CareBridge/**

GitHub Pages can only serve files, not run a C++ program, so on Pages the
interface automatically switches to a **browser-only demo engine**
(`web/demo-api.js`). It implements the same API and the same sample data, with
everything stored in your browser's `localStorage` - handy for a quick look at
the UI, but not shared between visitors. The deployed page shows a small
"Static demo mode" banner and a button to reset the data.

When the page is served by the real C++ server it uses the server instead
(detected through `GET /api/health`), so bookings and records are written to
`data/*.txt` on the machine running the server.

### Two entry points, one interface
| Served by | Entry file | Assets |
|-----------|-----------|--------|
| C++ web server (local / container) | `web/index.html` served at `/` | `web/style.css`, `web/app.js` |
| GitHub Pages (repository root) | `index.html` served at `/CareBridge/` | `web/style.css`, `web/app.js` |

Pages publishes the repository root, so the root `index.html` exists to boot the
same interface from `web/`; without it, Jekyll turns `README.md` into the
homepage. A `.nojekyll` file keeps Jekyll from processing the rest of the repo,
and the CI workflow deploys `web/` directly as well - whichever deployment is
live, the site shows the application.

## Console version and tests
    make              # builds carebridge (console), carebridge_web and tests
    make run          # console menus
    make web          # web server (loopback only)
    make test         # 23 automated tests
    make clean

Online compilers (OnlineGDB, etc.) can run only the console version
(`src/main.cpp` + `src/CareBridge.cpp` and `src/*.h`), not the web interface.

## Web interface
* Login / registration with role tabs (patient, doctor), light and dark theme
* **Patient:** dashboard, find care (hospital filter, search by name/specialization),
  booking with slot picker and urgent switch, waiting list, appointments with
  cancel, health-record timeline
* **Doctor:** dashboard with next patient, priority queue (urgent first), consultation
  form that writes the health record, slot manager (open/close), appointment history,
  patient search, record editing with undo
* No external libraries and no build step: `web/app.js` talks to the JSON API and
  falls back to the demo engine when the API is not reachable

## Project structure
| File | Purpose |
|------|---------|
| `src/DataStructures.h` | Hand-written `LinkedList`, `Queue`, `Stack`, `PriorityQueue` (binary heap), insertion sort, binary search |
| `src/Models.h` | OOP classes: abstract `User` -> `Patient`, `Doctor`; `Hospital`, `Appointment`, `HealthRecord` |
| `src/Utils.h` | String / date helpers, password hash |
| `src/CareBridge.h/.cpp` | Core logic and file persistence (no console I/O, so it is testable) |
| `src/main.cpp` | Console menus (patient / doctor) |
| `src/server.cpp` | Web server (select-based HTTP, Winsock/POSIX) and JSON API on top of `CareBridge` |
| `src/tests.cpp` | 23 automated tests |
| `web/` | Web interface: `index.html`, `style.css`, `app.js` (no external libraries) |
| `index.html` | Entry point for GitHub Pages, which publishes the repository root; loads the app from `web/` |
| `web/demo-api.js` | Browser-only API used by the static GitHub Pages deployment |
| `run_web.sh`, `run_web.bat` | One-step build and start |
| `.github/workflows/static.yml` | CI: builds, runs the tests, deploys `web/` to GitHub Pages |
| `.nojekyll` | Tells GitHub Pages to publish the files as-is (no Jekyll processing) |

### Server options
The server listens on `127.0.0.1` by default (safe for local use). To expose the
demo on a container or hosting sandbox, set the host to all interfaces:

    CAREBRIDGE_HOST=0.0.0.0 ./carebridge_web 8080

Equivalent: `./carebridge_web 8080 0.0.0.0`. Optional environment variables:
`CAREBRIDGE_WEB` (folder served as the UI, default `web`).

### API overview
`POST /api/login`, `POST /api/register`, `GET /api/me`, `GET /api/hospitals`,
`GET /api/doctors`, `POST /api/book`, `POST /api/waitlist`, `POST /api/cancel`,
`GET /api/appointments`, `GET /api/records`, `GET /api/queue`, `GET /api/slots`,
`POST /api/slot/open`, `POST /api/slot/close`, `POST /api/consult`,
`GET /api/patients`, `POST /api/record/update`, `POST /api/record/undo`,
and `GET /api/health`.

Sessions are bearer tokens sent in the `x-token` header. Form bodies are
`application/x-www-form-urlencoded`.

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
Delete the `data/` folder to reset to the sample data. `data/` is git-ignored.

## Known limitations (future work)
* Nearby hospitals matched by city name only (no GPS)
* Web server is for local/demo use: single-threaded, plain HTTP, sessions kept in
  memory, and it must be exposed deliberately with `CAREBRIDGE_HOST=0.0.0.0`
* The Windows (Winsock) build path was not tested in the authoring environment;
  the Linux build and the full browser flow were
* The GitHub Pages deployment is a static demo: data lives in the visitor's browser
  and is not shared with other users
* Undo history lives only for the current session
* Passwords use a simple hash, not a production-grade scheme
