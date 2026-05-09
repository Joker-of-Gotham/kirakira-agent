package pdp

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

// DecisionLog appends immutable JSON lines for offline audits.
type DecisionLog struct {
	mu   sync.Mutex
	file *os.File
	path string
}

// DecisionLogEntry is one persisted authorization decision envelope.
type DecisionLogEntry struct {
	Timestamp  string                 `json:"timestamp"`
	DecisionID string                 `json:"decision_id"`
	Input      map[string]interface{} `json:"input"`
	Result     map[string]interface{} `json:"result"`
	BundleID   string                 `json:"bundle_id"`
}

// NewDecisionLog opens (or creates) the decision log sink.
func NewDecisionLog(path string) (*DecisionLog, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return nil, err
	}
	return &DecisionLog{file: f, path: path}, nil
}

// Write appends one JSON-encoded record with a newline.
func (dl *DecisionLog) Write(entry DecisionLogEntry) error {
	if entry.Timestamp == "" {
		entry.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}
	dl.mu.Lock()
	defer dl.mu.Unlock()
	b, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	b = append(b, '\n')
	_, err = dl.file.Write(b)
	return err
}

// Close flushes handles for the backing file.
func (dl *DecisionLog) Close() error {
	dl.mu.Lock()
	defer dl.mu.Unlock()
	if dl.file == nil {
		return nil
	}
	err := dl.file.Close()
	dl.file = nil
	return err
}
