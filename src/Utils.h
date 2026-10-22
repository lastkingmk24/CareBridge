// Utils.h - small string / date helpers.
#pragma once
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <string>
#include <vector>

inline std::string lower(std::string s) {
    for (char& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return s;
}

inline std::string trim(const std::string& s) {
    std::size_t a = 0, b = s.size();
    while (a < b && std::isspace(static_cast<unsigned char>(s[a]))) ++a;
    while (b > a && std::isspace(static_cast<unsigned char>(s[b - 1]))) --b;
    return s.substr(a, b - a);
}

// Field separator in the data files is '|', so it must not appear in values.
inline std::string clean(std::string s) {
    for (char& c : s) if (c == '|' || c == '\n' || c == '\r') c = ' ';
    return trim(s);
}

inline std::vector<std::string> split(const std::string& line, char sep = '|') {
    std::vector<std::string> out;
    std::string cur;
    for (char c : line) {
        if (c == sep) { out.push_back(cur); cur.clear(); }
        else cur += c;
    }
    out.push_back(cur);
    return out;
}

inline int toInt(const std::string& s, int fallback = 0) {
    char* end = nullptr;
    long v = std::strtol(s.c_str(), &end, 10);
    return (end == s.c_str()) ? fallback : static_cast<int>(v);
}

inline bool contains(const std::string& text, const std::string& part) {
    return lower(text).find(lower(part)) != std::string::npos;
}

// Simple, NON-cryptographic password hash (FNV-1a, 64 bit). Good enough to
// avoid plain-text passwords in an academic prototype; not for production.
inline std::string hashPassword(const std::string& p) {
    std::uint64_t h = 1469598103934665603ULL;
    for (unsigned char c : p) { h ^= c; h *= 1099511628211ULL; }
    char buf[17];
    std::snprintf(buf, sizeof buf, "%016llx", static_cast<unsigned long long>(h));
    return buf;
}

// "HH:MM" 24-hour time check.
inline bool isValidTime(const std::string& t) {
    if (t.size() != 5 || t[2] != ':') return false;
    for (int i : {0, 1, 3, 4}) if (!std::isdigit(static_cast<unsigned char>(t[i]))) return false;
    int h = (t[0] - '0') * 10 + (t[1] - '0');
    int m = (t[3] - '0') * 10 + (t[4] - '0');
    return h < 24 && m < 60;
}

inline std::string todayDate() {
    std::time_t now = std::time(nullptr);
    char buf[16];
    std::strftime(buf, sizeof buf, "%Y-%m-%d", std::localtime(&now));
    return buf;
}
