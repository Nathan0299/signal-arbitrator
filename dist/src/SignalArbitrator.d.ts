import { ArbitrationConfig, TelemetrySignal, ArbitrationResult, EntityState } from './types';
import { PriorityEvaluator } from './PriorityEvaluator';
import { ConflictDetector } from './ConflictDetector';
import { AggregationExecutor } from './AggregationExecutor';
import { EntityStateStore } from './EntityStateStore';
export declare class SignalArbitrator {
    private config;
    private priorityEvaluator;
    private conflictDetector;
    private stateStore;
    constructor(config: ArbitrationConfig);
    /**
     * Ingests, evaluates, arbitrates, and commits a telemetry signal.
     *
     * @param signal The incoming telemetry signal
     * @param options Optional overrides for evaluation reference time or source reputation score
     */
    arbitrate(signal: TelemetrySignal, options?: {
        referenceTime?: number;
        sourceReputation?: number;
    }): ArbitrationResult;
    /**
     * Gets the current operational map state for an entity.
     */
    getEntityState(entityId: string): EntityState | undefined;
    /**
     * Sweeps expired signals from the active index and triggers state re-evaluation.
     *
     * @param referenceTime The evaluation reference timestamp in ms
     */
    sweep(referenceTime?: number): string[];
}
export { PriorityEvaluator, ConflictDetector, AggregationExecutor, EntityStateStore };
