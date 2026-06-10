from kirakira_model_gateway.model_metadata_catalog import (
    get_model_metadata,
    load_model_metadata_catalog,
    resolve_model_alias,
)


def test_loads_shared_model_metadata_catalog():
    catalog = load_model_metadata_catalog()
    assert catalog.schema_version == 1
    assert "https://developers.openai.com/api/docs/pricing" in catalog.sources
    assert catalog.get_model("gpt-4o") is not None


def test_resolves_aliases_from_shared_catalog():
    assert resolve_model_alias("gpt-4o-2024-11-20") == "gpt-4o"
    assert resolve_model_alias("claude-opus") == "claude-opus-4-8"


def test_model_metadata_contains_capability_pricing_and_embedding_support():
    gpt4o = get_model_metadata("gpt-4o")
    assert gpt4o is not None
    assert gpt4o.context_window == 128_000
    assert gpt4o.capabilities.function_calling is True
    assert gpt4o.capabilities.mcp_tools is True
    assert gpt4o.pricing is not None
    assert gpt4o.pricing.input_per_million_usd == 2.5

    embedding = get_model_metadata("text-embedding-3-small")
    assert embedding is not None
    assert embedding.capabilities.embedding is True
    assert embedding.capabilities.function_calling is False
