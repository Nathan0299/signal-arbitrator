export interface TelemetrySignal {
    signalId: string;
    signalType: string;
    sourceSystem: string;
    entityId: string;
    timestamp: string; // ISO 8601 UTC
    payload: Record<string, any>;
    confidence: number; // [0, 1]
    ttl: number; // Time-to-live in seconds
}

export interface DomainWeights {
    [domain: string]: number;
}

export interface SourceTrustDefaults {
    [source: string]: number;
}

export interface ContradictionRule {
    attribute: string;
    maxDelta: number;
    windowSeconds: number;
}

export interface ContradictionRules {
    [signalType: string]: ContradictionRule;
}

export interface ConflictConfig {
    duplicateWindowSeconds: number;
    conflictPairs: string[];
    contradictionRules: ContradictionRules;
}

export interface PriorityRule {
    ruleId: string;
    signalType: string;
    ruleType: 'source_weight' | 'recency_weight' | 'composite' | 'authority_override';
    precedence: number;
    weights?: Record<string, number>;
    decayHours?: number;
    trustedSources?: string[];
}

export interface PriorityConfig {
    domainWeights: DomainWeights;
    sourceTrustDefaults: SourceTrustDefaults;
    priorityRules: PriorityRule[];
    decayDefaults: {
        defaultLambda: number;
    };
}

export interface AggregationRule {
    entity: string;
    attribute: string;
    aggregationMethod: 'weighted_average' | 'sum' | 'max' | 'median' | 'latest_value';
    minSources: number;
    windowDays: number;
    weightField?: string;
}

export interface AggregationConfig {
    [attributeKey: string]: AggregationRule; // e.g. "grid_node.voltage_v"
}

export interface ArbitrationConfig {
    conflict: ConflictConfig;
    priority: PriorityConfig;
    aggregation: AggregationConfig;
}

export interface ConflictRecord {
    type: 'contradiction' | 'duplicate';
    reason: string;
    signalA: string;
    signalB: string;
    entityId: string;
    details: {
        attribute: string;
        delta: number;
        threshold: number;
    };
}

export interface ArbitrationResult {
    status: 'WINNER' | 'SUPPRESSED' | 'COEXIST' | 'duplicate' | 'rejected' | 'uncontested';
    priorityScore: number;
    signal: TelemetrySignal;
    conflicts: ConflictRecord[];
    timestamp: string;
}

export interface EntityState {
    entityId: string;
    entityType: string;
    attributes: Record<string, any>;
    confidence: number;
    lastUpdated: string;
    history: {
        signalId: string;
        timestamp: string;
        payload: Record<string, any>;
        priorityScore: number;
    }[];
}
