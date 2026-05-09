import pytest
from kirakira_model_gateway.capability import ModelCapability, ModelCapabilityRegistry


def test_builtin_gpt4o():
    reg = ModelCapabilityRegistry()
    cap = reg.get("gpt-4o")
    assert cap is not None
    assert cap.supports_function_calling is True
    assert cap.supports_vision is True
    assert cap.max_context_tokens == 128_000


def test_builtin_claude_sonnet():
    reg = ModelCapabilityRegistry()
    cap = reg.get("claude-sonnet-4-20250514")
    assert cap is not None
    assert cap.supports_function_calling is True
    assert cap.price_class == "medium"


def test_register_custom():
    reg = ModelCapabilityRegistry()
    custom = ModelCapability(
        supports_function_calling=True,
        supports_vision=False,
        max_context_tokens=32_000,
        price_class="low",
    )
    reg.register("custom-model", custom)
    assert reg.get("custom-model") is custom


def test_list_models():
    reg = ModelCapabilityRegistry()
    models = reg.list_models()
    assert len(models) > 0
    assert "gpt-4o" in models


def test_supports_feature():
    reg = ModelCapabilityRegistry()
    assert reg.supports_feature("gpt-4o", "supports_function_calling") is True
    assert reg.supports_feature("gpt-4o", "supports_batch") is False


def test_fuzzy_get():
    reg = ModelCapabilityRegistry()
    cap = reg.get("gpt-4o-2024-11-20")
    assert cap is not None, "Fuzzy lookup for 'gpt-4o-2024-11-20' should match 'gpt-4o'"
    assert cap.supports_function_calling is True
    assert cap.max_context_tokens == 128_000


def test_get_unknown_returns_none():
    reg = ModelCapabilityRegistry()
    assert reg.get("completely-unknown-xyz") is None


def test_to_dict():
    reg = ModelCapabilityRegistry()
    d = reg.to_dict()
    assert isinstance(d, dict)
    assert "gpt-4o" in d
    assert d["gpt-4o"]["supports_function_calling"] is True


def test_new_capability_fields_present():
    """Verify doc-specified capability fields have correct types and defaults for gpt-4o."""
    reg = ModelCapabilityRegistry()
    cap = reg.get("gpt-4o")
    assert cap is not None
    assert cap.supports_mcp_tools is True
    assert cap.supports_reasoning is False
    assert cap.supports_memory is False
    assert cap.supports_tool_search is True
    assert cap.supports_long_context is True
    assert isinstance(cap.data_residency, str)
    assert cap.requires_approval is False


def test_gpt4o_mcp_and_tool_search():
    reg = ModelCapabilityRegistry()
    cap = reg.get("gpt-4o")
    assert cap is not None
    assert cap.supports_mcp_tools is True
    assert cap.supports_tool_search is True


def test_o3_supports_reasoning():
    reg = ModelCapabilityRegistry()
    cap = reg.get("o3")
    assert cap is not None
    assert cap.supports_reasoning is True
    assert cap.supports_mcp_tools is True


def test_claude_opus_requires_approval():
    reg = ModelCapabilityRegistry()
    cap = reg.get("claude-opus-4-20250514")
    assert cap is not None
    assert cap.requires_approval is True
    assert cap.supports_memory is True
    assert cap.supports_reasoning is True


def test_local_model_data_residency():
    reg = ModelCapabilityRegistry()
    cap = reg.get("Qwen/Qwen3-32B")
    assert cap is not None
    assert cap.data_residency == "local"


def test_supports_feature_with_new_fields():
    reg = ModelCapabilityRegistry()
    assert reg.supports_feature("gpt-4o", "supports_mcp_tools") is True
    assert reg.supports_feature("gpt-4o", "supports_reasoning") is False
    assert reg.supports_feature("o3", "supports_reasoning") is True
