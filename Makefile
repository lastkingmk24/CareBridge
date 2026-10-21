CXX      = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -O2
SRC      = src/CareBridge.cpp

all: carebridge carebridge_web tests

carebridge: src/main.cpp $(SRC) src/*.h
	$(CXX) $(CXXFLAGS) -o $@ src/main.cpp $(SRC)

carebridge_web: src/server.cpp $(SRC) src/*.h
	$(CXX) $(CXXFLAGS) -o $@ src/server.cpp $(SRC)

tests: src/tests.cpp $(SRC) src/*.h
	$(CXX) $(CXXFLAGS) -o $@ src/tests.cpp $(SRC)

test: tests
	./tests

run: carebridge
	./carebridge

web: carebridge_web
	./carebridge_web

clean:
	rm -rf carebridge carebridge_web tests data test_data *.exe
