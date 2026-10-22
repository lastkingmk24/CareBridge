// DataStructures.h - hand-written data structures used by CareBridge.
// (Data Structures course: linked list, queue, stack, priority queue,
//  insertion sort, binary search.)
#pragma once
#include <cstddef>
#include <string>
#include <vector>

// ---------------------------------------------------------------- LinkedList
template <typename T>
class LinkedList {
    struct Node {
        T data;
        Node* next;
        explicit Node(const T& d) : data(d), next(nullptr) {}
    };
    Node* head_ = nullptr;
    Node* tail_ = nullptr;
    std::size_t size_ = 0;

public:
    LinkedList() = default;
    LinkedList(const LinkedList&) = delete;
    LinkedList& operator=(const LinkedList&) = delete;
    ~LinkedList() { clear(); }

    // Appends a value and returns a stable pointer to the stored copy
    // (nodes never move, so the pointer stays valid until removal).
    T* pushBack(const T& v) {
        Node* n = new Node(v);
        if (!tail_) head_ = tail_ = n;
        else { tail_->next = n; tail_ = n; }
        ++size_;
        return &n->data;
    }

    std::size_t size() const { return size_; }
    bool empty() const { return size_ == 0; }

    template <typename F> void forEach(F f) {
        for (Node* c = head_; c; c = c->next) f(c->data);
    }
    template <typename F> void forEach(F f) const {
        for (const Node* c = head_; c; c = c->next) f(c->data);
    }

    template <typename P> T* find(P pred) {
        for (Node* c = head_; c; c = c->next) if (pred(c->data)) return &c->data;
        return nullptr;
    }
    template <typename P> const T* find(P pred) const {
        for (const Node* c = head_; c; c = c->next) if (pred(c->data)) return &c->data;
        return nullptr;
    }

    // Removes the first element matching pred. Returns true if one was removed.
    template <typename P> bool removeIf(P pred) {
        Node* prev = nullptr;
        for (Node* c = head_; c; prev = c, c = c->next) {
            if (pred(c->data)) {
                if (prev) prev->next = c->next; else head_ = c->next;
                if (c == tail_) tail_ = prev;
                delete c;
                --size_;
                return true;
            }
        }
        return false;
    }

    void clear() {
        while (head_) { Node* n = head_->next; delete head_; head_ = n; }
        tail_ = nullptr;
        size_ = 0;
    }
};

// --------------------------------------------------------------------- Queue
// FIFO queue (linked nodes). Used for each doctor's waiting list.
template <typename T>
class Queue {
    struct Node {
        T data;
        Node* next;
        explicit Node(const T& d) : data(d), next(nullptr) {}
    };
    Node* head_ = nullptr;
    Node* tail_ = nullptr;
    std::size_t size_ = 0;

public:
    Queue() = default;
    Queue(const Queue&) = delete;
    Queue& operator=(const Queue&) = delete;
    ~Queue() { T tmp; while (dequeue(tmp)) {} }

    void enqueue(const T& v) {
        Node* n = new Node(v);
        if (!tail_) head_ = tail_ = n; else { tail_->next = n; tail_ = n; }
        ++size_;
    }
    bool dequeue(T& out) {
        if (!head_) return false;
        Node* n = head_;
        out = n->data;
        head_ = n->next;
        if (!head_) tail_ = nullptr;
        delete n;
        --size_;
        return true;
    }
    bool empty() const { return size_ == 0; }
    std::size_t size() const { return size_; }
    template <typename F> void forEach(F f) const {
        for (const Node* c = head_; c; c = c->next) f(c->data);
    }
};

// --------------------------------------------------------------------- Stack
// LIFO stack (linked nodes). Used as the undo history for record edits.
template <typename T>
class Stack {
    struct Node {
        T data;
        Node* next;
        Node(const T& d, Node* n) : data(d), next(n) {}
    };
    Node* top_ = nullptr;
    std::size_t size_ = 0;

public:
    Stack() = default;
    Stack(const Stack&) = delete;
    Stack& operator=(const Stack&) = delete;
    ~Stack() { T tmp; while (pop(tmp)) {} }

    void push(const T& v) { top_ = new Node(v, top_); ++size_; }
    bool pop(T& out) {
        if (!top_) return false;
        Node* n = top_;
        out = n->data;
        top_ = n->next;
        delete n;
        --size_;
        return true;
    }
    bool empty() const { return size_ == 0; }
    std::size_t size() const { return size_; }
};

// ------------------------------------------------------------- Sorting/search
// Stable insertion sort. `before(a, b)` is true if a must come before b.
template <typename T, typename Before>
void insertionSort(std::vector<T>& v, Before before) {
    for (std::size_t i = 1; i < v.size(); ++i) {
        T key = v[i];
        std::size_t j = i;
        while (j > 0 && before(key, v[j - 1])) { v[j] = v[j - 1]; --j; }
        v[j] = key;
    }
}

// ------------------------------------------------------------ PriorityQueue
// Binary heap stored in a dynamic array. `before(a, b)` is true if a has
// higher priority than b. Used to serve urgent appointments first.
template <typename T, typename Before>
class PriorityQueue {
    T* heap_;
    std::size_t cap_;
    std::size_t size_;
    Before before_;

    void grow() {
        T* bigger = new T[cap_ * 2];
        for (std::size_t i = 0; i < size_; ++i) bigger[i] = heap_[i];
        delete[] heap_;
        heap_ = bigger;
        cap_ *= 2;
    }
    void siftUp(std::size_t i) {
        while (i > 0) {
            std::size_t p = (i - 1) / 2;
            if (!before_(heap_[i], heap_[p])) break;
            T t = heap_[i]; heap_[i] = heap_[p]; heap_[p] = t;
            i = p;
        }
    }
    void siftDown(std::size_t i) {
        for (;;) {
            std::size_t l = 2 * i + 1, r = l + 1, best = i;
            if (l < size_ && before_(heap_[l], heap_[best])) best = l;
            if (r < size_ && before_(heap_[r], heap_[best])) best = r;
            if (best == i) break;
            T t = heap_[i]; heap_[i] = heap_[best]; heap_[best] = t;
            i = best;
        }
    }

public:
    PriorityQueue() : heap_(new T[4]), cap_(4), size_(0), before_() {}
    PriorityQueue(const PriorityQueue&) = delete;
    PriorityQueue& operator=(const PriorityQueue&) = delete;
    ~PriorityQueue() { delete[] heap_; }

    void push(const T& v) {
        if (size_ == cap_) grow();
        heap_[size_] = v;
        siftUp(size_);
        ++size_;
    }
    bool pop(T& out) {
        if (size_ == 0) return false;
        out = heap_[0];
        heap_[0] = heap_[--size_];
        siftDown(0);
        return true;
    }
    bool empty() const { return size_ == 0; }
    std::size_t size() const { return size_; }

    // Non-destructive view of all items in priority order.
    std::vector<T> sorted() const {
        std::vector<T> v(heap_, heap_ + size_);
        insertionSort(v, before_);
        return v;
    }
};

// Binary search over a vector already sorted by the string key keyOf(item).
// Returns the index of an exact match or -1.
template <typename T, typename KeyFn>
int binarySearch(const std::vector<T>& v, const std::string& key, KeyFn keyOf) {
    int lo = 0, hi = static_cast<int>(v.size()) - 1;
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        std::string k = keyOf(v[mid]);
        if (k == key) return mid;
        if (k < key) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
}
