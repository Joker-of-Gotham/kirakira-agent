import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { Resource } from "@opentelemetry/resources";
import {
  SimpleSpanProcessor,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";

const SERVICE_NAME_KEY = "service.name";

/**
 * Factory for a `NodeTracerProvider` wired with a single simple-span processor.
 */
export function createNodeTracerProvider(
  exporter: SpanExporter,
  serviceName = "kirakira-cli",
): NodeTracerProvider {
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SERVICE_NAME_KEY]: serviceName,
    }),
  });
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  return provider;
}

export { NodeTracerProvider };
