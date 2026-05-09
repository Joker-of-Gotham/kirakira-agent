"""OpenTelemetry integration for model gateway with GenAI semantic conventions."""

import logging
from collections.abc import Generator
from contextlib import contextmanager
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

logger = logging.getLogger(__name__)

_tracer: trace.Tracer | None = None


def init_tracer(
    service_name: str = "kirakira-model-gateway",
    otlp_endpoint: str | None = None,
) -> trace.Tracer:
    global _tracer

    resource = Resource.create(
        {
            "service.name": service_name,
            "gen_ai.system": "kirakira-agent",
        }
    )

    provider = TracerProvider(resource=resource)

    if otlp_endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
                OTLPSpanExporter,
            )

            exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
            provider.add_span_processor(BatchSpanProcessor(exporter))
        except ImportError:
            logger.warning(
                "opentelemetry-exporter-otlp-proto-grpc is not installed; "
                "OTLP trace export to %s disabled. Install with: "
                "pip install opentelemetry-exporter-otlp-proto-grpc",
                otlp_endpoint,
            )

    trace.set_tracer_provider(provider)
    _tracer = trace.get_tracer("kirakira.model_gateway")
    return _tracer


def get_tracer() -> trace.Tracer:
    global _tracer
    if _tracer is None:
        _tracer = trace.get_tracer("kirakira.model_gateway")
    return _tracer


@contextmanager
def trace_model_call(
    provider: str,
    model: str,
    operation: str = "chat",
) -> Generator[trace.Span, None, None]:
    tracer = get_tracer()

    with tracer.start_as_current_span(
        f"gen_ai.{operation}",
        kind=trace.SpanKind.CLIENT,
        attributes={
            "gen_ai.operation.name": operation,
            "gen_ai.system": provider,
            "gen_ai.request.model": model,
        },
    ) as span:
        yield span


def record_model_usage(
    span: trace.Span,
    input_tokens: int = 0,
    output_tokens: int = 0,
    finish_reasons: list[str] | None = None,
    response_model: str | None = None,
) -> None:
    span.set_attribute("gen_ai.usage.input_tokens", input_tokens)
    span.set_attribute("gen_ai.usage.output_tokens", output_tokens)
    if finish_reasons:
        span.set_attribute("gen_ai.response.finish_reasons", finish_reasons)
    if response_model:
        span.set_attribute("gen_ai.response.model", response_model)
