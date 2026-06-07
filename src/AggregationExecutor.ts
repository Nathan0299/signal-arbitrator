import { AggregationConfig, TelemetrySignal, AggregationRule } from './types';

export class AggregationExecutor {
    private config: AggregationConfig;

    constructor(config: AggregationConfig) {
        this.config = config;
    }

    /**
     * Aggregates active historical values of an entity's attribute.
     * 
     * @param entityType The entity type (e.g. "grid_node")
     * @param attribute The attribute name (e.g. "voltage_v")
     * @param activeSignals Signals currently marked as active (WINNER / COEXIST / uncontested)
     * @returns The aggregated value, or null if no signals or consensus conditions not met
     */
    public aggregate(
        entityType: string,
        attribute: string,
        activeSignals: Array<{ signal: TelemetrySignal; priorityScore: number }>
    ): any {
        const attributeKey = `${entityType}.${attribute}`;
        const rule = this.config[attributeKey];

        // If no rule exists, fall back to latest value
        const effectiveRule: AggregationRule = rule || {
            entity: entityType,
            attribute,
            aggregationMethod: 'latest_value',
            minSources: 1,
            windowDays: 30
        };

        // Filter signals within window
        const now = Date.now();
        const windowMs = effectiveRule.windowDays * 24 * 3600 * 1000;
        const validSignals = activeSignals.filter(s => {
            const signalTime = new Date(s.signal.timestamp).getTime();
            return (now - signalTime) <= windowMs;
        });

        // Check Minimum Source Consensus (MSC)
        const uniqueSources = new Set(validSignals.map(s => s.signal.sourceSystem));
        if (uniqueSources.size < effectiveRule.minSources) {
            return null; // consensus threshold not met
        }

        if (validSignals.length === 0) {
            return null;
        }

        const values = validSignals
            .map(s => ({
                val: s.signal.payload[attribute],
                weight: s.priorityScore,
                timestamp: new Date(s.signal.timestamp).getTime()
            }))
            .filter(item => item.val !== undefined && item.val !== null);

        if (values.length === 0) {
            return null;
        }

        switch (effectiveRule.aggregationMethod) {
            case 'sum':
                return values.reduce((sum, item) => sum + Number(item.val), 0);

            case 'max':
                return Math.max(...values.map(item => Number(item.val)));

            case 'latest_value':
                // Sort by timestamp descending
                values.sort((a, b) => b.timestamp - a.timestamp);
                return values[0].val;

            case 'median': {
                const sorted = values.map(item => Number(item.val)).sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                if (sorted.length % 2 !== 0) {
                    return sorted[mid];
                }
                return (sorted[mid - 1] + sorted[mid]) / 2;
            }

            case 'weighted_average':
            default: {
                let weightedSum = 0;
                let totalWeight = 0;
                for (const item of values) {
                    const weight = item.weight > 0 ? item.weight : 0.0001; // prevent division by zero
                    weightedSum += Number(item.val) * weight;
                    totalWeight += weight;
                }
                return totalWeight > 0 ? parseFloat((weightedSum / totalWeight).toFixed(4)) : null;
            }
        }
    }
}
