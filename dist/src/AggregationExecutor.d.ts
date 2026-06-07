import { AggregationConfig, TelemetrySignal } from './types';
export declare class AggregationExecutor {
    private config;
    constructor(config: AggregationConfig);
    /**
     * Aggregates active historical values of an entity's attribute.
     *
     * @param entityType The entity type (e.g. "grid_node")
     * @param attribute The attribute name (e.g. "voltage_v")
     * @param activeSignals Signals currently marked as active (WINNER / COEXIST / uncontested)
     * @returns The aggregated value, or null if no signals or consensus conditions not met
     */
    aggregate(entityType: string, attribute: string, activeSignals: Array<{
        signal: TelemetrySignal;
        priorityScore: number;
    }>): any;
}
