import pytest
from kirakira_model_gateway.cost import estimate_cost, CostTracker


def test_estimate_cost_gpt4o():
    cost = estimate_cost("gpt-4o", 1000, 500)
    expected = (1000 * 2.50 + 500 * 10.00) / 1_000_000
    assert cost == pytest.approx(expected)
    assert isinstance(cost, float)


def test_estimate_cost_unknown_model():
    cost = estimate_cost("unknown-self-hosted-model", 1000, 500)
    assert cost == 0.0


def test_estimate_cost_zero_tokens():
    cost = estimate_cost("gpt-4o", 0, 0)
    assert cost == 0.0


def test_cost_tracker_record():
    tracker = CostTracker()
    entry = tracker.record("gpt-4o", 1000, 500)
    assert entry.cost_usd > 0
    assert tracker.request_count == 1
    assert tracker.total_cost_usd == entry.cost_usd


def test_cost_tracker_multiple():
    tracker = CostTracker()
    tracker.record("gpt-4o", 1000, 500)
    tracker.record("gpt-4o-mini", 2000, 1000)
    assert tracker.request_count == 2
    assert tracker.total_input_tokens == 3000
    assert tracker.total_output_tokens == 1500


def test_cost_tracker_budget():
    tracker = CostTracker(budget_usd=0.001)
    tracker.record("gpt-4o", 100_000, 50_000)
    assert tracker.is_over_budget()


def test_cost_tracker_no_budget():
    tracker = CostTracker()
    tracker.record("gpt-4o", 100_000, 50_000)
    assert tracker.is_over_budget() is False


def test_cost_tracker_summary():
    tracker = CostTracker(budget_usd=10.0)
    tracker.record("gpt-4o", 1000, 500)
    s = tracker.summary()
    assert "total_cost_usd" in s
    assert "request_count" in s
    assert "budget_usd" in s
    assert s["budget_usd"] == 10.0
    assert s["over_budget"] is False


def test_cost_tracker_reset():
    tracker = CostTracker()
    tracker.record("gpt-4o", 1000, 500)
    tracker.reset()
    assert tracker.request_count == 0
    assert tracker.total_cost_usd == 0.0


def test_cost_tracker_daily_budget():
    tracker = CostTracker(daily_budget_usd=0.001)
    tracker.record("gpt-4o", 100_000, 50_000)
    assert tracker.is_over_daily_budget()


def test_cost_tracker_approaching_budget():
    tracker = CostTracker(budget_usd=1.0, alert_threshold_pct=50.0)
    tracker.record("gpt-4o", 100_000, 50_000)
    assert tracker.is_approaching_budget()


def test_cost_tracker_budget_remaining():
    tracker = CostTracker(budget_usd=10.0)
    tracker.record("gpt-4o", 1000, 500)
    remaining = tracker.budget_remaining_usd()
    assert remaining is not None
    assert remaining < 10.0
    assert remaining > 0


def test_cost_tracker_cost_by_model():
    tracker = CostTracker()
    tracker.record("gpt-4o", 1000, 500)
    tracker.record("gpt-4o-mini", 2000, 1000)
    tracker.record("gpt-4o", 500, 200)
    by_model = tracker.cost_by_model()
    assert "gpt-4o" in by_model
    assert "gpt-4o-mini" in by_model
    assert by_model["gpt-4o"] > by_model["gpt-4o-mini"]


def test_cost_tracker_summary_extended():
    tracker = CostTracker(budget_usd=10.0, daily_budget_usd=5.0, alert_threshold_pct=80.0)
    tracker.record("gpt-4o", 1000, 500)
    s = tracker.summary()
    assert "daily_budget_usd" in s
    assert "over_daily_budget" in s
    assert "approaching_budget" in s
    assert "budget_remaining_usd" in s
    assert "cost_by_model" in s
    assert s["daily_budget_usd"] == 5.0
