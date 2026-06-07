import { PriorityConfig, TelemetrySignal, PriorityRule } from './types';

export class PriorityEvaluator {
    private config: PriorityConfig;

    constructor(config: PriorityConfig) {
        this.config = config;
    }

    /**
     * Evaluates a signal's priority score [0, 10] based on domain weights, source trust,
     * recency decay, and matched priority rules.
     * 
     * @param signal The telemetry signal to evaluate
     * @param referenceTime The reference time for recency decay calculation (default: Date.now())
     * @param reputationScore Optional reputation score multiplier for the source
     */
    public evaluate(
        signal: TelemetrySignal, 
        referenceTime: number = Date.now(),
        reputationScore?: number
    ): { priorityScore: number; metadata: Record<string, any> } {
        const signalTime = new Date(signal.timestamp).getTime();
        const deltaT = Math.max(0, (referenceTime - signalTime) / 1000); // in seconds

        // 1. Find matching priority rule
        const matchedRule = this.findMatchingRule(signal.signalType);

        let result: { priorityScore: number; metadata: Record<string, any> };

        if (matchedRule) {
            result = this.evaluateRule(signal, matchedRule, deltaT);
        } else {
            result = this.evaluateBaseline(signal, deltaT);
        }

        // 2. Apply reputation coefficient if provided
        if (reputationScore !== undefined) {
            let repCoef = 1.0;
            if (reputationScore >= 0.80) repCoef = 1.10;
            else if (reputationScore >= 0.60) repCoef = 1.00;
            else if (reputationScore >= 0.45) repCoef = 0.90;
            else repCoef = 0.00; // Crisis mode / blocked

            result.priorityScore = parseFloat((result.priorityScore * repCoef).toFixed(4));
            result.metadata.reputationScore = reputationScore;
            result.metadata.reputationCoefficient = repCoef;
        }

        // Clip priority score between 0 and 10
        result.priorityScore = Math.max(0, Math.min(10, result.priorityScore));

        return result;
    }

    private findMatchingRule(signalType: string): PriorityRule | null {
        // Return first matching rule by signalType
        for (const rule of this.config.priorityRules) {
            if (rule.signalType === signalType) {
                return rule;
            }
        }
        return null;
    }

    private evaluateRule(
        signal: TelemetrySignal, 
        rule: PriorityRule, 
        deltaT: number
    ): { priorityScore: number; metadata: Record<string, any> } {
        switch (rule.ruleType) {
            case 'authority_override':
                if (rule.trustedSources?.includes(signal.sourceSystem)) {
                    return {
                        priorityScore: 10.0,
                        metadata: {
                            ruleId: rule.ruleId,
                            type: 'authority_override',
                            ageSeconds: deltaT
                        }
                    };
                }
                return this.evaluateBaseline(signal, deltaT);

            case 'source_weight': {
                const weights = rule.weights || {};
                // Determine weight by signal source or payload parameters (e.g. scout_type)
                const sourceWeightKey = signal.payload.scout_type || signal.payload.sensor_type || 'default';
                const weight = weights[sourceWeightKey] || weights['default'] || 0.5;
                const conf = Math.min(1.0, Math.max(0, signal.confidence));
                const score = weight * conf * 10.0;
                return {
                    priorityScore: parseFloat(score.toFixed(4)),
                    metadata: {
                        ruleId: rule.ruleId,
                        type: 'source_weight',
                        weight,
                        confidence: conf,
                        ageSeconds: deltaT
                    }
                };
            }

            case 'recency_weight': {
                const decayHours = rule.decayHours || 24;
                // lambda = -ln(0.5) / half_life_seconds
                const halfLifeSecs = decayHours * 3600;
                const lambda = 0.693147 / halfLifeSecs;
                const df = Math.exp(-lambda * deltaT);
                const score = 10.0 * df;
                return {
                    priorityScore: parseFloat(score.toFixed(4)),
                    metadata: {
                        ruleId: rule.ruleId,
                        type: 'recency_weight',
                        lambda,
                        ageSeconds: deltaT
                    }
                };
            }

            case 'composite': {
                const weights = rule.weights || {};
                let weightedSum = 0;
                let divisor = 0;
                const factors: Record<string, any> = {};

                if (weights.source) {
                    const conf = Math.min(1.0, Math.max(0, signal.confidence));
                    const trust = this.config.sourceTrustDefaults[signal.sourceSystem] || this.config.sourceTrustDefaults.default || 0.5;
                    const fSource = conf * trust;
                    weightedSum += fSource * weights.source;
                    divisor += weights.source;
                    factors.source = { val: parseFloat(fSource.toFixed(4)), weight: weights.source };
                }

                if (weights.recency) {
                    const decayHours = rule.decayHours || 24;
                    const halfLifeSecs = decayHours * 3600;
                    const lambda = 0.693147 / halfLifeSecs;
                    const fRecency = Math.exp(-lambda * deltaT);
                    weightedSum += fRecency * weights.recency;
                    divisor += weights.recency;
                    factors.recency = { val: parseFloat(fRecency.toFixed(4)), weight: weights.recency };
                }

                if (weights.authority_bonus) {
                    const fAuth = rule.trustedSources?.includes(signal.sourceSystem) ? 1.0 : 0.0;
                    weightedSum += fAuth * weights.authority_bonus;
                    divisor += weights.authority_bonus;
                    factors.authority = { val: fAuth, weight: weights.authority_bonus };
                }

                const finalScore = divisor > 0 ? (weightedSum / divisor) * 10.0 : 0.0;
                return {
                    priorityScore: parseFloat(finalScore.toFixed(4)),
                    metadata: {
                        ruleId: rule.ruleId,
                        type: 'composite',
                        factors,
                        divisor,
                        ageSeconds: deltaT
                    }
                };
            }

            default:
                return this.evaluateBaseline(signal, deltaT);
        }
    }

    private evaluateBaseline(
        signal: TelemetrySignal, 
        deltaT: number
    ): { priorityScore: number; metadata: Record<string, any> } {
        // Parse domain from signal type (e.g. "sensor.smart_grid_telemetry" -> "sensor")
        // Check if there is an override in domainWeights
        const parts = signal.signalType.split('.');
        const domain = parts[0] || 'unknown';

        const dw = this.config.domainWeights[domain] || this.config.domainWeights.default || 1.0;
        const st = this.config.sourceTrustDefaults[signal.sourceSystem] || this.config.sourceTrustDefaults.default || 0.5;
        const c = Math.min(1.0, Math.max(0, signal.confidence));
        const l = this.config.decayDefaults.defaultLambda || 0.00005;
        const df = Math.exp(-l * deltaT);
        const bs = dw * c * st * df;

        return {
            priorityScore: parseFloat(bs.toFixed(4)),
            metadata: {
                type: 'baseline',
                factors: {
                    domain: { val: dw, weight: 1.0 },
                    trust: { val: st, weight: 1.0 },
                    confidence: { val: c, weight: 1.0 },
                    decay: { val: parseFloat(df.toFixed(4)), weight: 1.0 }
                },
                ageSeconds: deltaT
            }
        };
    }
}
