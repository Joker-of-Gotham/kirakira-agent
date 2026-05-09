.PHONY: test build clean

OPA ?= opa

BundleStageDir := .bundle-stage

# OPA decision log masking lives in package system.log (masking.rego); roots must include
# "system" for bundle validation alongside "kirakira".
StagedManifest := $(BundleStageDir)/.manifest

test:
	$(OPA) test ./policy ./tests ./data -v

build:
	rm -rf $(BundleStageDir) bundle.tar.gz
	mkdir -p $(BundleStageDir)/kirakira/policy $(BundleStageDir)/kirakira/data
	cp policy/*.rego $(BundleStageDir)/kirakira/policy/
	cp data/*.json $(BundleStageDir)/kirakira/data/
	@if command -v jq >/dev/null 2>&1; then jq '.roots |= (["kirakira", "system"] | unique)' .manifest > $(StagedManifest); else printf '%s\n' '{"revision":"v0.1.0","roots":["kirakira","system"]}' > $(StagedManifest); fi
	cd $(BundleStageDir) && $(OPA) build . -b -o ../bundle.tar.gz
	rm -rf $(BundleStageDir)

clean:
	rm -rf $(BundleStageDir) bundle.tar.gz
