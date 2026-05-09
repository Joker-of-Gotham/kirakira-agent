from kirakira_model_gateway.mirror import MirrorSelector, is_transient_error
from kirakira_model_gateway.types import MirrorConfig


def test_is_transient_error_heuristic():
    assert is_transient_error(RuntimeError("connection error")) is True
    assert is_transient_error(ValueError("nope")) is False


def test_mirror_rotates_after_threshold():
    cfg = MirrorConfig(
        base_urls=["http://primary/v1", "http://mirror/v1"],
        switch_on_error_count=2,
        switch_cooldown_sec=0.0,
        active_idx=0,
    )
    sel = MirrorSelector(cfg)
    assert sel.current_base_url() == "http://primary/v1"
    assert sel.record_transient_failure("timeout") is False
    switched = sel.record_transient_failure("timeout")
    assert switched is True
    assert sel.current_base_url() == "http://mirror/v1"


def test_record_success_reduces_counter():
    cfg = MirrorConfig(
        base_urls=["http://a/v1", "http://b/v1"],
        switch_on_error_count=5,
        switch_cooldown_sec=0.0,
        active_idx=0,
    )
    sel = MirrorSelector(cfg)
    sel.record_transient_failure("x")
    sel.record_success()
    snap = sel.snapshot_config()
    assert snap.active_idx == 0
