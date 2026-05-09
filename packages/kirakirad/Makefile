.PHONY: build test clean install

build:
	go build -o bin/kirakirad ./cmd/kirakirad

test:
	go test ./... -v

clean:
	rm -rf bin/

install: build
	mkdir -p $(HOME)/.kirakira/bin
	cp bin/kirakirad $(HOME)/.kirakira/bin/kirakirad
