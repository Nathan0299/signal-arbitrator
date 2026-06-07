"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityStateStore = exports.AggregationExecutor = exports.ConflictDetector = exports.PriorityEvaluator = exports.SignalArbitrator = void 0;
const PriorityEvaluator_1 = require("./PriorityEvaluator");
Object.defineProperty(exports, "PriorityEvaluator", { enumerable: true, get: function () { return PriorityEvaluator_1.PriorityEvaluator; } });
const ConflictDetector_1 = require("./ConflictDetector");
Object.defineProperty(exports, "ConflictDetector", { enumerable: true, get: function () { return ConflictDetector_1.ConflictDetector; } });
const AggregationExecutor_1 = require("./AggregationExecutor");
Object.defineProperty(exports, "AggregationExecutor", { enumerable: true, get: function () { return AggregationExecutor_1.AggregationExecutor; } });
const EntityStateStore_1 = require("./EntityStateStore");
Object.defineProperty(exports, "EntityStateStore", { enumerable: true, get: function () { return EntityStateStore_1.EntityStateStore; } });
class SignalArbitrator {
    config;
    priorityEvaluator;
    conflictDetector;
    stateStore;
    constructor(config) {
        this.config = config;
        this.priorityEvaluator = new PriorityEvaluator_1.PriorityEvaluator(config.priority);
        this.conflictDetector = new ConflictDetector_1.ConflictDetector(config.conflict);
        const aggregator = new AggregationExecutor_1.AggregationExecutor(config.aggregation);
        this.stateStore = new EntityStateStore_1.EntityStateStore(aggregator);
    }
    /**
     * Ingests, evaluates, arbitrates, and commits a telemetry signal.
     *
     * @param signal The incoming telemetry signal
     * @param options Optional overrides for evaluation reference time or source reputation score
     */
    arbitrate(signal, options) {
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
        let status = 'uncontested';
        if (conflicts.length > 0) {
            // Check if there is a duplicate first
            const hasDuplicate = conflicts.some(c => c.type === 'duplicate');
            if (hasDuplicate) {
                status = 'duplicate';
            }
            else {
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
                        }
                        else if (score < currentScore) {
                            isWinner = false;
                            break;
                        }
                        else {
                            // score parity
                            isParity = true;
                        }
                    }
                }
                if (isWinner) {
                    status = isParity ? 'COEXIST' : 'WINNER';
                }
                else {
                    status = 'rejected'; // or 'SUPPRESSED'
                }
            }
        }
        const result = {
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
    getEntityState(entityId) {
        return this.stateStore.getState(entityId);
    }
    /**
     * Sweeps expired signals from the active index and triggers state re-evaluation.
     *
     * @param referenceTime The evaluation reference timestamp in ms
     */
    sweep(referenceTime = Date.now()) {
        return this.stateStore.sweepExpired(referenceTime);
    }
}
exports.SignalArbitrator = SignalArbitrator;
