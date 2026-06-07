"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConflictDetector = void 0;
class ConflictDetector {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Checks if the incoming signal conflicts with any historical signals in the relevant window.
     *
     * @param signal The incoming telemetry signal
     * @param history Active historical signals for the same entity
     */
    detect(signal, history) {
        const signalType = signal.signalType;
        // 1. Check if this signal type is registered for conflict detection
        if (!this.config.conflictPairs.includes(signalType)) {
            return [];
        }
        const rule = this.config.contradictionRules[signalType];
        if (!rule) {
            return [];
        }
        const targetTimeMs = new Date(signal.timestamp).getTime();
        const windowMs = rule.windowSeconds * 1000;
        const conflicts = [];
        for (const refSignal of history) {
            // Skip self
            if (refSignal.signalId === signal.signalId) {
                continue;
            }
            // Only check same signal type for contradictions
            if (refSignal.signalType !== signalType) {
                continue;
            }
            // Check if within time window
            const refTimeMs = new Date(refSignal.timestamp).getTime();
            const timeDeltaMs = Math.abs(targetTimeMs - refTimeMs);
            if (timeDeltaMs > windowMs) {
                continue;
            }
            // Check for duplicate signals (same source, same payload, within duplicate window)
            const isDuplicateSource = refSignal.sourceSystem === signal.sourceSystem;
            const duplicateWindowMs = this.config.duplicateWindowSeconds * 1000;
            if (isDuplicateSource && timeDeltaMs <= duplicateWindowMs) {
                const isPayloadEqual = JSON.stringify(refSignal.payload) === JSON.stringify(signal.payload);
                if (isPayloadEqual) {
                    conflicts.push({
                        type: 'duplicate',
                        reason: 'duplicate_signal',
                        signalA: refSignal.signalId,
                        signalB: signal.signalId,
                        entityId: signal.entityId,
                        details: {
                            attribute: 'all',
                            delta: 0,
                            threshold: 0
                        }
                    });
                    continue;
                }
            }
            // Check for value contradiction
            const attr = rule.attribute;
            const newVal = signal.payload[attr];
            const prevVal = refSignal.payload[attr];
            if (newVal !== undefined && prevVal !== undefined) {
                const delta = Math.abs(newVal - prevVal);
                if (delta > rule.maxDelta) {
                    conflicts.push({
                        type: 'contradiction',
                        reason: `${attr}_conflict`,
                        signalA: refSignal.signalId,
                        signalB: signal.signalId,
                        entityId: signal.entityId,
                        details: {
                            attribute: attr,
                            delta,
                            threshold: rule.maxDelta
                        }
                    });
                }
            }
        }
        return conflicts;
    }
}
exports.ConflictDetector = ConflictDetector;
