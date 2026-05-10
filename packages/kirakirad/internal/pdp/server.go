package pdp

import (
	"bufio"
	"context"
	"encoding/json"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"sync"

	"github.com/kirakira-agent/kirakirad/internal/health"
)

const jsonrpcVersion = "2.0"

// JsonRpcRequest models a newline-delimited JSON-RPC 2.0 request envelope.
type JsonRpcRequest struct {
	Jsonrpc string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
	ID      interface{}     `json:"id"`
}

// JsonRpcResponse models a compact JSON-RPC 2.0 response.
type JsonRpcResponse struct {
	Jsonrpc string      `json:"jsonrpc"`
	Result  interface{} `json:"result,omitempty"`
	Error   *RpcError   `json:"error,omitempty"`
	ID      interface{} `json:"id"`
}

// RpcError conveys JSON-RPC error objects.
type RpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Server serves JSON-RPC 2.0 over a UNIX domain socket.
type Server struct {
	network     string
	address     string
	socketPath  string
	listener    net.Listener
	engine      *Engine
	health      health.HealthChecker
	decisionLog *DecisionLog
	done        chan struct{}
	closedOnce  sync.Once
}

// NewServer binds either a TCP listener or a UNIX listener and prepares the PDP server.
func NewServer(socketPath string, listenAddr string, engine *Engine, healthSvc health.HealthChecker) (*Server, error) {
	network := "unix"
	address := socketPath
	logDir := filepath.Dir(socketPath)

	if listenAddr != "" {
		network = "tcp"
		address = listenAddr
	} else {
		if err := os.MkdirAll(filepath.Dir(socketPath), 0o755); err != nil {
			return nil, err
		}
		_ = os.Remove(socketPath)
	}

	ln, err := net.Listen(network, address)
	if err != nil {
		return nil, err
	}
	if network == "unix" {
		if err := os.Chmod(socketPath, 0o600); err != nil {
			_ = ln.Close()
			_ = os.Remove(socketPath)
			return nil, err
		}
	}

	if err := os.MkdirAll(logDir, 0o755); err != nil {
		_ = ln.Close()
		if network == "unix" {
			_ = os.Remove(socketPath)
		}
		return nil, err
	}
	logPath := filepath.Join(logDir, "decision-log.jsonl")
	dl, logErr := NewDecisionLog(logPath)
	if logErr != nil {
		slog.Warn("decision log unavailable, continuing without", "error", logErr)
	}

	return &Server{
		network:     network,
		address:     address,
		socketPath:  socketPath,
		listener:    ln,
		engine:      engine,
		health:      healthSvc,
		decisionLog: dl,
		done:        make(chan struct{}),
	}, nil
}

// Serve accepts client connections until Close is called.
func (s *Server) Serve() error {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			select {
			case <-s.done:
				return nil
			default:
				if s.listener != nil {
					slog.Warn("pdp accept failed", "network", s.network, "error", err)
				}
				return err
			}
		}
		go s.handleConn(conn)
	}
}

// Close shuts down listeners and deletes the UNIX socket path.
func (s *Server) Close() error {
	var errOut error
	s.closedOnce.Do(func() {
		close(s.done)
		if s.listener != nil {
			if err := s.listener.Close(); err != nil {
				errOut = err
			}
		}
		if s.network == "unix" {
			_ = os.Remove(s.socketPath)
		}
	})
	return errOut
}

func (s *Server) handleConn(conn net.Conn) {
	defer conn.Close()
	scanner := bufio.NewScanner(conn)
	initBuf := make([]byte, 0, 64*1024)
	scanner.Buffer(initBuf, 4*1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var req JsonRpcRequest
		if err := json.Unmarshal(line, &req); err != nil {
			s.write(conn, rpcErr(nil, ParseError.Code, ParseError.Message))
			continue
		}
		resp := s.dispatch(&req)
		s.write(conn, resp)
	}
	if err := scanner.Err(); err != nil {
		slog.Debug("scanner done", "error", err)
	}
}

func (s *Server) dispatch(req *JsonRpcRequest) JsonRpcResponse {
	if req.Jsonrpc != jsonrpcVersion {
		return rpcErr(req.ID, InvalidRequest.Code, InvalidRequest.Message)
	}
	switch req.Method {
	case "evaluate":
		return s.methodEvaluate(req)
	case "health":
		return s.methodHealth(req)
	case "reload-bundle":
		return s.methodReload(req)
	default:
		return rpcErr(req.ID, MethodNotFound.Code, MethodNotFound.Message)
	}
}

func (s *Server) methodEvaluate(req *JsonRpcRequest) JsonRpcResponse {
	var p struct {
		Input map[string]interface{} `json:"input"`
	}
	if len(req.Params) > 0 {
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return rpcErr(req.ID, InvalidParams.Code, "invalid evaluate params")
		}
		if p.Input == nil {
			var direct map[string]interface{}
			if err := json.Unmarshal(req.Params, &direct); err == nil {
				p.Input = direct
			}
		}
	}
	ctx := context.Background()
	out, err := s.engine.Evaluate(ctx, p.Input)
	if err != nil {
		slog.Error("evaluate failed", "error", err)
		return rpcErr(req.ID, InternalError.Code, InternalError.Message)
	}

	if s.decisionLog != nil {
		decisionID, _ := out["decision_id"].(string)
		_ = s.decisionLog.Write(DecisionLogEntry{
			DecisionID: decisionID,
			Input:      p.Input,
			Result:     out,
			BundleID:   s.engine.BundleID(),
		})
	}

	return JsonRpcResponse{Jsonrpc: jsonrpcVersion, Result: map[string]interface{}{"decision": out}, ID: req.ID}
}

func (s *Server) methodHealth(req *JsonRpcRequest) JsonRpcResponse {
	st := s.health.Check()
	mode := "ipc"
	if s.network == "tcp" {
		mode = "tcp"
	}
	return JsonRpcResponse{
		Jsonrpc: jsonrpcVersion,
		Result: map[string]interface{}{
			"status":         st.Status,
			"bundleId":       st.BundleID,
			"bundleRevision": st.Revision,
			"lastDecisionAt": st.LastEval,
			"mode":           mode,
		},
		ID: req.ID,
	}
}

func (s *Server) methodReload(req *JsonRpcRequest) JsonRpcResponse {
	var p struct {
		Path string `json:"bundle_path"`
	}
	if len(req.Params) > 0 {
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return rpcErr(req.ID, InvalidParams.Code, "invalid reload-bundle params")
		}
	}
	if err := s.engine.ReloadBundle(p.Path); err != nil {
		slog.Error("reload-bundle failed", "error", err)
		return rpcErr(req.ID, InternalError.Code, err.Error())
	}
	return JsonRpcResponse{Jsonrpc: jsonrpcVersion, Result: map[string]interface{}{"ok": true}, ID: req.ID}
}

func (s *Server) write(conn net.Conn, v JsonRpcResponse) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	b = append(b, '\n')
	_, _ = conn.Write(b)
}

func rpcErr(id interface{}, code int, msg string) JsonRpcResponse {
	return JsonRpcResponse{
		Jsonrpc: jsonrpcVersion,
		Error:   &RpcError{Code: code, Message: msg},
		ID:      id,
	}
}

// Common JSON-RPC 2.0 error codes reused by tooling.
var (
	MethodNotFound = RpcError{-32601, "Method not found"}
	InvalidParams  = RpcError{-32602, "Invalid params"}
	InvalidRequest = RpcError{-32600, "Invalid Request"}
	InternalError  = RpcError{-32603, "Internal error"}
	ParseError     = RpcError{-32700, "Parse error"}
)
