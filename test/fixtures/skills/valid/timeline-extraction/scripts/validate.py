#!/usr/bin/env python3
import json, sys
data = json.load(sys.stdin)
assert "events" in data
print("Validation passed")
