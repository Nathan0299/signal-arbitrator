import { PriorityConfig, TelemetrySignal } from './types';
export declare class PriorityEvaluator {
    private config;
    constructor(config: PriorityConfig);
    /**
     * Evaluates a signal's priority score [0, 10] based on domain weights, source trust,
     * recency decay, and matched priority rules.
     *
     * @param signal The telemetry signal to evaluate
     * @param referenceTime The reference time for recency decay calculation (default: Date.now())
     * @param reputationScore Optional reputation score multiplier for the source
     */
    evaluate(signal: TelemetrySignal, referenceTime?: number, reputationScore?: number): {
        priorityScore: number;
        metadata: Record<string, any>;
    };
    private findMatchingRule;
    private evaluateRule;
    private evaluateBaseline;
}
