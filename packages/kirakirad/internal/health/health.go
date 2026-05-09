package health

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// HealthChecker is implemented by PDP health adapters.
type HealthChecker interface {
	Check() HealthStatus
}

// HealthStatus is returned over HTTP probes and JSON-RPC.
type HealthStatus struct {
	Status   string `json:"status"`
	BundleID string `json:"bundle_id,omitempty"`
	Revision string `json:"revision,omitempty"`
	LastEval string `json:"last_eval,omitempty"`
	Uptime   string `json:"uptime"`
}

// EngineHealth wires EngineChecker-derived metadata into probes.
type EngineHealth struct {
	engine    EngineChecker
	startTime time.Time
}

// EngineChecker is satisfied by policy engines exposing bundle lineage.
type EngineChecker interface {
	BundleID() string
	Revision() string
	LastEvalTime() time.Time
}

// New constructs a HealthChecker wrapping the PDP engine adapter.
func New(engine EngineChecker) *EngineHealth {
	return &EngineHealth{engine: engine, startTime: time.Now()}
}

// Check snapshots current engine health markers.
func (h *EngineHealth) Check() HealthStatus {
	ev := h.engine.LastEvalTime()
	st := HealthStatus{
		Status:   "healthy",
		BundleID: h.engine.BundleID(),
		Revision: h.engine.Revision(),
		Uptime:   time.Since(h.startTime).Truncate(time.Millisecond).String(),
	}
	if !ev.IsZero() {
		st.LastEval = ev.UTC().Format(time.RFC3339Nano)
	}
	return st
}

// ServeHTTP exposes JSON health on `:port`/healthz.
// Returns any error from the underlying listener (e.g. port already in use).
func ServeHTTP(port int, checker HealthChecker) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		st := checker.Check()
		_ = json.NewEncoder(w).Encode(st)
	})
	addr := fmt.Sprintf(":%d", port)
	return http.ListenAndServe(addr, mux)
}
