import { ArbitrationConfig, TelemetrySignal, ArbitrationResult, EntityState, ConflictRecord } from './types';
import { PriorityEvaluator } from './PriorityEvaluator';
import { ConflictDetector } from './ConflictDetector';
import { AggregationExecutor } from './AggregationExecutor';
import { EntityStateStore } from './EntityStateStore';

export class SignalArbitrator {
    private config: ArbitrationConfig;
    private priorityEvaluator: PriorityEvaluator;
    private conflictDetector: ConflictDetector;
    private stateStore: EntityStateStore;

    constructor(config: ArbitrationConfig) {
        this.config = config;
        this.priorityEvaluator = new PriorityEvaluator(config.priority);
        this.conflictDetector = new ConflictDetector(config.conflict);
        const aggregator = new AggregationExecutor(config.aggregation);
        this.stateStore = new EntityStateStore(aggregator);
    }

    /**
     * Ingests, evaluates, arbitrates, and commits a telemetry signal.
     * 
     * @param signal The incoming telemetry signal
     * @param options Optional overrides for evaluation reference time or source reputation score
     */
    public arbitrate(
        signal: TelemetrySignal,
        options?: { referenceTime?: number; sourceReputation?: number }
    ): ArbitrationResult {
        const referenceTime = options?.referenceTime || Date.now();
        const reputation = options?.sourceReputation;

        // 1. Calculate Priority Score
        const priorityResult = this.priorityEvaluator.evaluate(signal, referenceTime, reputation);
        const score = priorityResult.priorityScore;

        // 2. Fetch history of active signals for this entity
        const history = this.stateStore.getActiveSignals(signal.entityId).map(h => h.signal);

        // 3. Detect Conflicts (Duplicates or Contradictions)
        const conflicts = this.conflictDetector.detect(signal, history);

        // 4. Resolve Conflict / Duel
        let status: ArbitrationResult['status'] = 'uncontested';

        if (conflicts.length > 0) {
            // Check if there is a duplicate first
            const hasDuplicate = conflicts.some(c => c.type === 'duplicate');
            if (hasDuplicate) {
                status = 'duplicate';
            } else {
                // contradiction conflict: execute priority duel
                let isWinner = true;
                let isParity = false;

                // Compare score against all conflicting historical signals
                const activeSignals = this.stateStore.getActiveSignals(signal.entityId);
                for (const conflictRecord of conflicts) {
                    const conflictingSignalId = conflictRecord.signalA;
                    const match = activeSignals.find(s => s.signal.signalId === conflictingSignalId);
                    if (match) {
                        const currentScore = match.priorityScore;
                        if (score > currentScore) {
                            // new signal wins this duel
                        } else if (score < currentScore) {
                            isWinner = false;
                            break;
                        } else {
                            // score parity
                            isParity = true;
                        }
                    }
                }

                if (isWinner) {
                    status = isParity ? 'COEXIST' : 'WINNER';
                } else {
                    status = 'rejected'; // or 'SUPPRESSED'
                }
            }
        }

        const result: ArbitrationResult = {
            status,
            priorityScore: score,
            signal,
            conflicts,
            timestamp: new Date(referenceTime).toISOString()
        };

        // 5. Commit to State Store
        const parts = signal.signalType.split('.');
        const category = parts[0] || 'unknown'; // entityType mapping (e.g. grid_node or logistics_vehicle)
        const entityType = this.config.aggregation[`${category}.${Object.keys(signal.payload)[0]}`]?.entity || category;
        
        this.stateStore.commit(entityType, result);

        return result;
    }

    /**
     * Gets the current operational map state for an entity.
     */
    public getEntityState(entityId: string): EntityState | undefined {
        return this.stateStore.getState(entityId);
    }

    /**
     * Sweeps expired signals from the active index and triggers state re-evaluation.
     * 
     * @param referenceTime The evaluation reference timestamp in ms
     */
    public sweep(referenceTime: number = Date.now()): string[] {
        return this.stateStore.sweepExpired(referenceTime);
    }
}
export { PriorityEvaluator, ConflictDetector, AggregationExecutor, EntityStateStore };
