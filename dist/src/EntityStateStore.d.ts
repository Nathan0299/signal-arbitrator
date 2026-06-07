import { EntityState, TelemetrySignal, ArbitrationResult } from './types';
import { AggregationExecutor } from './AggregationExecutor';
export declare class EntityStateStore {
    private states;
    private activeSignals;
    private aggregator;
    constructor(aggregator: AggregationExecutor);
    /**
     * Retrieves the state for a specific entity.
     */
    getState(entityId: string): EntityState | undefined;
    /**
     * Retrieves the active signals for a specific entity.
     */
    getActiveSignals(entityId: string): Array<{
        signal: TelemetrySignal;
        priorityScore: number;
    }>;
    /**
     * Commits an arbitrated signal to the entity's history and updates its core/derived state.
     *
     * @param entityType The entity type (e.g. "grid_node")
     * @param result The arbitration result
     */
    commit(entityType: string, result: ArbitrationResult): EntityState;
    /**
     * Rebuilds the state of an entity from its active signals.
     */
    rebuildState(entityId: string, entityType: string): EntityState;
    /**
     * Sweeps expired signals (signals whose age exceeds their TTL).
     * If a signal is evicted, the entity state is automatically rebuilt.
     *
     * @param referenceTime The evaluation time (default: Date.now())
     * @returns List of evicted signal IDs
     */
    sweepExpired(referenceTime?: number): string[];
}
