import type { ModelRoutingConfig, WorkloadType } from "../types.js";

export class ModelRouter {
  selectModel(workloadType: WorkloadType, config: ModelRoutingConfig): string {
    const entry = config.byWorkload[workloadType];
    if (entry?.primary) return entry.primary;
    return config.defaultModel;
  }

  fallbacks(workloadType: WorkloadType, config: ModelRoutingConfig): string[] {
    const entry = config.byWorkload[workloadType];
    return entry?.fallbacks ? [...entry.fallbacks] : [];
  }
}
