import { createServer, type Server } from "node:http";

const COMPLETION_RESPONSE = {
  id: "chatcmpl-contract-test",
  object: "chat.completion",
  created: Math.floor(Date.now() / 1000),
  model: "gpt-4o-mini",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: "Contract test response.",
      },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 12,
    completion_tokens: 5,
    total_tokens: 17,
  },
};

export function startContractLlmServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.method === "POST" && req.url?.endsWith("/chat/completions")) {
        let body = "";
        req.on("data", (chunk: Buffer) => (body += chunk.toString()));
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(COMPLETION_RESPONSE));
        });
        return;
      }
      res.writeHead(404);
      res.end("Not found");
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        resolve({ server, port: addr.port });
      } else {
        reject(new Error("Failed to bind contract LLM server"));
      }
    });

    server.on("error", reject);
  });
}
