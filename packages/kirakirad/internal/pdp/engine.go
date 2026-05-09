package pdp

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/open-policy-agent/opa/v1/ast"
	"github.com/open-policy-agent/opa/v1/bundle"
	"github.com/open-policy-agent/opa/v1/loader"
	"github.com/open-policy-agent/opa/v1/rego"
	"github.com/open-policy-agent/opa/v1/storage"
	"github.com/open-policy-agent/opa/v1/storage/inmem"

	"lukechampine.com/blake3"
)

const decisionQuery = `decision := data.kirakira.authz.main.decision`

// Engine wraps a prepared OPA evaluation for the Kirakira authz decision endpoint.
type Engine struct {
	mu            sync.RWMutex
	query         rego.PreparedEvalQuery
	bundleID      string
	revision      string
	lastEval      time.Time
	store         storage.Store
	bundleAbsPath string
}

// NewEngine loads Rego and JSON data from a directory, or reads a tarball/zip bundle.
func NewEngine(bundlePath string) (*Engine, error) {
	cmp, store, digest, revision, origin, err := loadBundle(bundlePath)
	if err != nil {
		return nil, err
	}

	query, err := rego.New(
		rego.Query(decisionQuery),
		rego.Compiler(cmp),
		rego.Store(store),
	).PrepareForEval(context.Background())
	if err != nil {
		return nil, fmt.Errorf("prepare decision query: %w", err)
	}

	id := hex.EncodeToString(digest[:])
	e := &Engine{
		query:         query,
		bundleID:      id,
		revision:      revision,
		store:         store,
		bundleAbsPath: origin,
	}
	return e, nil
}

// Evaluate executes the compiled decision rule with structured input from the caller.
func (e *Engine) Evaluate(ctx context.Context, input map[string]interface{}) (map[string]interface{}, error) {
	e.mu.RLock()
	q := e.query
	e.mu.RUnlock()

	results, err := q.Eval(ctx, rego.EvalInput(input))
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	e.mu.Lock()
	e.lastEval = now
	e.mu.Unlock()

	if len(results) == 0 || len(results[0].Bindings) == 0 {
		return map[string]interface{}{}, nil
	}

	raw := results[0].Bindings["decision"]
	if raw == nil {
		return map[string]interface{}{}, nil
	}

	decisionMap, ok := unwrapDecision(raw)
	if !ok || decisionMap == nil {
		return map[string]interface{}{}, nil
	}
	return decisionMap, nil
}

func unwrapDecision(v interface{}) (map[string]interface{}, bool) {
	if v == nil {
		return nil, false
	}
	if m, ok := v.(map[string]interface{}); ok {
		return m, true
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, false
	}
	var m map[string]interface{}
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, false
	}
	return m, true
}

// ReloadBundle atomically reloads policy and data from disk.
func (e *Engine) ReloadBundle(bundlePath string) error {
	target := strings.TrimSpace(bundlePath)
	if target == "" {
		e.mu.RLock()
		target = e.bundleAbsPath
		e.mu.RUnlock()
		if target == "" {
			return fmt.Errorf("reload-bundle: no bundle_path and no cached path")
		}
	}

	cmp, store, digest, revision, origin, err := loadBundle(target)
	if err != nil {
		return err
	}

	query, err := rego.New(
		rego.Query(decisionQuery),
		rego.Compiler(cmp),
		rego.Store(store),
	).PrepareForEval(context.Background())
	if err != nil {
		return fmt.Errorf("prepare decision query after reload: %w", err)
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	e.query = query
	e.store = store
	e.bundleID = hex.EncodeToString(digest[:])
	e.revision = revision
	e.bundleAbsPath = origin

	return nil
}

// BundleID returns a stable content hash of the loaded policy bundle.
func (e *Engine) BundleID() string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.bundleID
}

// Revision returns the bundle manifest revision when present, otherwise a load timestamp.
func (e *Engine) Revision() string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.revision
}

// LastEvalTime reports the last PDP evaluation timestamp (UTC).
func (e *Engine) LastEvalTime() time.Time {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.lastEval
}

// Close releases engine resources when the PDP stops.
func (e *Engine) Close() error {
	return nil
}

func loadBundle(bundlePath string) (*ast.Compiler, storage.Store, [32]byte, string, string, error) {
	path, err := filepath.Abs(bundlePath)
	if err != nil {
		return nil, nil, [32]byte{}, "", "", fmt.Errorf("abs bundle path: %w", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, nil, [32]byte{}, "", "", fmt.Errorf("stat bundle: %w", err)
	}

	if info.IsDir() {
		return loadDirectoryBundle(path)
	}
	ext := strings.ToLower(filepath.Ext(path))
	if strings.HasSuffix(strings.ToLower(path), ".tar.gz") || strings.HasSuffix(strings.ToLower(path), ".tgz") || ext == ".tar" || ext == ".gz" || ext == ".bundle" {
		return loadTarballBundle(path)
	}

	return loadDirectoryBundle(path)
}

func loadDirectoryBundle(abs string) (*ast.Compiler, storage.Store, [32]byte, string, string, error) {
	fl := loader.NewFileLoader().WithFollowSymlinks(true)
	res, err := fl.Filtered([]string{abs}, nil)
	if err != nil {
		return nil, nil, [32]byte{}, "", "", fmt.Errorf("load policy bundle: %w", err)
	}

	cmp, err := res.Compiler()
	if err != nil {
		return nil, nil, [32]byte{}, "", "", fmt.Errorf("compile bundle: %w", err)
	}
	st, err := res.Store()
	if err != nil {
		return nil, nil, [32]byte{}, "", "", fmt.Errorf("init store: %w", err)
	}

	sum := digestLoaderResult(abs, res)

	rev := time.Now().UTC().Format(time.RFC3339Nano)
	if mr, ok := res.Documents["manifest"].(map[string]interface{}); ok {
		if rs, ok := mr["revision"].(string); ok && rs != "" {
			rev = rs
		}
	}

	return cmp, st, sum, rev, abs, nil
}

func digestLoaderResult(root string, res *loader.Result) [32]byte {
	var chunks []string
	for name, mf := range res.Modules {
		pathKey := mf.Name
		if pathKey == "" {
			pathKey = name
		}
		pathKey = strings.TrimPrefix(pathKey, root)
		pathKey = strings.TrimPrefix(pathKey, string(filepath.Separator))
		chunks = append(chunks, filepath.ToSlash(pathKey)+"\x00"+string(mf.Raw))
	}
	docJSON, _ := json.Marshal(res.Documents)
	if len(docJSON) > 0 && string(docJSON) != "null" {
		chunks = append(chunks, "data:"+string(docJSON))
	}
	sort.Strings(chunks)
	return blake3.Sum256([]byte(strings.Join(chunks, "\n")))
}

func loadTarballBundle(abs string) (*ast.Compiler, storage.Store, [32]byte, string, string, error) {
	b, err := loader.NewFileLoader().WithFollowSymlinks(true).AsBundle(abs)
	if err != nil {
		return nil, nil, [32]byte{}, "", "", fmt.Errorf("read tarball bundle %s: %w", abs, err)
	}
	name := filepath.Base(abs)
	cmp := ast.NewCompiler()
	cmp.Compile(b.ParsedModules(name))
	if cmp.Failed() {
		return nil, nil, [32]byte{}, "", "", cmp.Errors
	}
	st := inmem.NewFromObject(b.Data)
	sum := digestBundleTarball(abs, b)
	rev := b.Manifest.Revision
	if rev == "" {
		rev = time.Now().UTC().Format(time.RFC3339Nano)
	}
	return cmp, st, sum, rev, abs, nil
}

func digestBundleTarball(_ string, b *bundle.Bundle) [32]byte {
	var chunks []string
	for _, mf := range b.Modules {
		pathKey := mf.RelativePath
		if pathKey == "" {
			pathKey = mf.Path
		}
		chunks = append(chunks, filepath.ToSlash(pathKey)+"\x00"+string(mf.Raw))
	}
	docJSON, _ := json.Marshal(b.Data)
	if len(docJSON) > 0 && string(docJSON) != "null" {
		chunks = append(chunks, "data:"+string(docJSON))
	}
	if b.Manifest.Revision != "" {
		chunks = append(chunks, "revision:"+b.Manifest.Revision)
	}
	sort.Strings(chunks)
	return blake3.Sum256([]byte(strings.Join(chunks, "\n")))
}
