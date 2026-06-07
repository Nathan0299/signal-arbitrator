import { EntityState, TelemetrySignal, ArbitrationResult } from './types';
import { AggregationExecutor } from './AggregationExecutor';

export class EntityStateStore {
    private states: Map<string, EntityState>;
    private activeSignals: Map<string, Array<{ signal: TelemetrySignal; priorityScore: number }>>;
    private aggregator: AggregationExecutor;

    constructor(aggregator: AggregationExecutor) {
        this.states = new Map();
        this.activeSignals = new Map();
        this.aggregator = aggregator;
    }

    /**
     * Retrieves the state for a specific entity.
     */
    public getState(entityId: string): EntityState | undefined {
        return this.states.get(entityId);
    }

    /**
     * Retrieves the active signals for a specific entity.
     */
    public getActiveSignals(entityId: string): Array<{ signal: TelemetrySignal; priorityScore: number }> {
        return this.activeSignals.get(entityId) || [];
    }

    /**
     * Commits an arbitrated signal to the entity's history and updates its core/derived state.
     * 
     * @param entityType The entity type (e.g. "grid_node")
     * @param result The arbitration result
     */
    public commit(entityType: string, result: ArbitrationResult): EntityState {
        const signal = result.signal;
        const entityId = signal.entityId;

        // 1. Retrieve or initialize active signals index for this entity
        let entitySignals = this.activeSignals.get(entityId);
        if (!entitySignals) {
            entitySignals = [];
            this.activeSignals.set(entityId, entitySignals);
        }

        // 2. Remove duplicate signal or handle suppressions
        if (result.status === 'duplicate' || result.status === 'rejected') {
            // Do not store duplicate or rejected signals in active state
        } else if (result.status === 'WINNER') {
            // WINNER: suppress all other non-COEXIST signals
            entitySignals = entitySignals.filter(s => s.signal.signalId === signal.signalId);
            entitySignals.push({ signal, priorityScore: result.priorityScore });
            this.activeSignals.set(entityId, entitySignals);
        } else if (result.status === 'COEXIST' || result.status === 'uncontested') {
            // COEXIST / uncontested: keep existing and add new
            // Check if signal already exists (to prevent double-insertion on replay)
            const exists = entitySignals.some(s => s.signal.signalId === signal.signalId);
            if (!exists) {
                entitySignals.push({ signal, priorityScore: result.priorityScore });
            }
        }

        // 3. Build/rebuild state by aggregating active signal payloads
        const state = this.rebuildState(entityId, entityType);
        return state;
    }

    /**
     * Rebuilds the state of an entity from its active signals.
     */
    public rebuildState(entityId: string, entityType: string): EntityState {
        const active = this.activeSignals.get(entityId) || [];

        // 1. Gather all attributes present in active signals
        const allAttributes = new Set<string>();
        for (const s of active) {
            for (const key of Object.keys(s.signal.payload)) {
                allAttributes.add(key);
            }
        }

        // 2. Aggregate each attribute
        const attributes: Record<string, any> = {};
        for (const attr of allAttributes) {
            const aggregatedVal = this.aggregator.aggregate(entityType, attr, active);
            if (aggregatedVal !== null) {
                attributes[attr] = aggregatedVal;
            }
        }

        // 3. Calculate overall confidence (weighted average of active signal confidences)
        let totalConfidence = 0;
        let totalWeight = 0;
        for (const s of active) {
            const weight = s.priorityScore > 0 ? s.priorityScore : 0.0001;
            totalConfidence += s.signal.confidence * weight;
            totalWeight += weight;
        }
        const confidence = totalWeight > 0 ? parseFloat((totalConfidence / totalWeight).toFixed(4)) : 0.0;

        // 4. Construct historical audit list
        const history = active.map(s => ({
            signalId: s.signal.signalId,
            timestamp: s.signal.timestamp,
            payload: s.signal.payload,
            priorityScore: s.priorityScore
        }));

        // Sort history by timestamp descending
        history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const state: EntityState = {
            entityId,
            entityType,
            attributes,
            confidence,
            lastUpdated: new Date().toISOString(),
            history
        };

        this.states.set(entityId, state);
        return state;
    }

    /**
     * Sweeps expired signals (signals whose age exceeds their TTL).
     * If a signal is evicted, the entity state is automatically rebuilt.
     * 
     * @param referenceTime The evaluation time (default: Date.now())
     * @returns List of evicted signal IDs
     */
    public sweepExpired(referenceTime: number = Date.now()): string[] {
        const evictedSignalIds: string[] = [];

        for (const [entityId, entitySignals] of this.activeSignals.entries()) {
            const initialCount = entitySignals.length;
            const remaining = entitySignals.filter(s => {
                const signalTime = new Date(s.signal.timestamp).getTime();
                const ageSecs = (referenceTime - signalTime) / 1000;
                const isExpired = ageSecs > s.signal.ttl;
                if (isExpired) {
                    evictedSignalIds.push(s.signal.signalId);
                }
                return !isExpired;
            });

            if (remaining.length !== initialCount) {
                this.activeSignals.set(entityId, remaining);
                // Rebuild entity state if signals were evicted
                const entityType = this.states.get(entityId)?.entityType || 'unknown';
                this.rebuildState(entityId, entityType);
            }
        }

        return evictedSignalIds;
    }
}
