import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { SignalArbitrator } from '../src/SignalArbitrator';
import { ArbitrationConfig, TelemetrySignal } from '../src/types';

describe('Signal Arbitrator SDK Test Suite', () => {
    let config: ArbitrationConfig;
    let arbitrator: SignalArbitrator;

    beforeEach(() => {
        config = {
            conflict: {
                duplicateWindowSeconds: 2,
                conflictPairs: ['sensor.telemetry'],
                contradictionRules: {
                    'sensor.telemetry': {
                        attribute: 'value',
                        maxDelta: 10,
                        windowSeconds: 5
                    }
                }
            },
            priority: {
                domainWeights: {
                    infra: 8.0,
                    default: 1.0
                },
                sourceTrustDefaults: {
                    sensor_primary: 1.0,
                    sensor_backup: 0.6,
                    default: 0.5
                },
                priorityRules: [],
                decayDefaults: {
                    defaultLambda: 0.005
                }
            },
            aggregation: {
                'sensor.value': {
                    entity: 'device',
                    attribute: 'value',
                    aggregationMethod: 'weighted_average',
                    minSources: 1,
                    windowDays: 1,
                    weightField: 'priorityScore'
                },
                'sensor.status': {
                    entity: 'device',
                    attribute: 'status',
                    aggregationMethod: 'latest_value',
                    minSources: 1,
                    windowDays: 1
                }
            }
        };
        arbitrator = new SignalArbitrator(config);
    });

    it('should ingest and apply an uncontested signal', () => {
        const signal: TelemetrySignal = {
            signalId: 'SIG_001',
            signalType: 'sensor.telemetry',
            sourceSystem: 'sensor_backup',
            entityId: 'DEVICE_001',
            timestamp: new Date().toISOString(),
            payload: { value: 100, status: 'ok' },
            confidence: 1.0,
            ttl: 30
        };

        const result = arbitrator.arbitrate(signal);
        assert.strictEqual(result.status, 'uncontested');
        
        const state = arbitrator.getEntityState('DEVICE_001');
        assert.ok(state);
        assert.strictEqual(state.attributes.value, 100);
        assert.strictEqual(state.attributes.status, 'ok');
    });

    it('should detect duplicates and discard them', () => {
        const now = new Date().toISOString();
        const signal1: TelemetrySignal = {
            signalId: 'SIG_001',
            signalType: 'sensor.telemetry',
            sourceSystem: 'sensor_backup',
            entityId: 'DEVICE_001',
            timestamp: now,
            payload: { value: 100, status: 'ok' },
            confidence: 1.0,
            ttl: 30
        };

        const signal2: TelemetrySignal = {
            signalId: 'SIG_002',
            signalType: 'sensor.telemetry',
            sourceSystem: 'sensor_backup',
            entityId: 'DEVICE_001',
            timestamp: new Date(Date.now() + 1000).toISOString(),
            payload: { value: 100, status: 'ok' }, // same payload, same source within 2s
            confidence: 1.0,
            ttl: 30
        };

        arbitrator.arbitrate(signal1);
        const result = arbitrator.arbitrate(signal2);
        assert.strictEqual(result.status, 'duplicate');
        assert.strictEqual(result.conflicts.length, 1);
        assert.strictEqual(result.conflicts[0].type, 'duplicate');
    });

    it('should resolve a priority duel on contradiction: higher priority wins', () => {
        const now = new Date().toISOString();
        const signalBackup: TelemetrySignal = {
            signalId: 'SIG_BACKUP',
            signalType: 'sensor.telemetry',
            sourceSystem: 'sensor_backup', // trust = 0.6
            entityId: 'DEVICE_001',
            timestamp: now,
            payload: { value: 100, status: 'ok' },
            confidence: 1.0,
            ttl: 30
        };

        const signalPrimary: TelemetrySignal = {
            signalId: 'SIG_PRIMARY',
            signalType: 'sensor.telemetry',
            sourceSystem: 'sensor_primary', // trust = 1.0
            entityId: 'DEVICE_001',
            timestamp: new Date(Date.now() + 500).toISOString(),
            payload: { value: 120, status: 'warning' }, // delta = 20 > 10
            confidence: 1.0,
            ttl: 30
        };

        arbitrator.arbitrate(signalBackup);
        const result = arbitrator.arbitrate(signalPrimary);

        assert.strictEqual(result.status, 'WINNER');
        const state = arbitrator.getEntityState('DEVICE_001');
        assert.strictEqual(state?.attributes.value, 120);
        assert.strictEqual(state?.attributes.status, 'warning');
    });

    it('should resolve a priority duel on contradiction: lower priority is rejected', () => {
        const now = new Date().toISOString();
        const signalPrimary: TelemetrySignal = {
            signalId: 'SIG_PRIMARY',
            signalType: 'sensor.telemetry',
            sourceSystem: 'sensor_primary', // trust = 1.0
            entityId: 'DEVICE_001',
            timestamp: now,
            payload: { value: 120, status: 'warning' },
            confidence: 1.0,
            ttl: 30
        };

        const signalBackup: TelemetrySignal = {
            signalId: 'SIG_BACKUP',
            signalType: 'sensor.telemetry',
            sourceSystem: 'sensor_backup', // trust = 0.6
            entityId: 'DEVICE_001',
            timestamp: new Date(Date.now() + 500).toISOString(),
            payload: { value: 100, status: 'ok' }, // delta = 20 > 10
            confidence: 1.0,
            ttl: 30
        };

        arbitrator.arbitrate(signalPrimary);
        const result = arbitrator.arbitrate(signalBackup);

        assert.strictEqual(result.status, 'rejected');
        const state = arbitrator.getEntityState('DEVICE_001');
        assert.strictEqual(state?.attributes.value, 120); // still primary value
    });

    it('should sweep expired signals and update state', () => {
        const now = Date.now();
        const signal: TelemetrySignal = {
            signalId: 'SIG_001',
            signalType: 'sensor.telemetry',
            sourceSystem: 'sensor_backup',
            entityId: 'DEVICE_001',
            timestamp: new Date(now).toISOString(),
            payload: { value: 100, status: 'ok' },
            confidence: 1.0,
            ttl: 5 // 5 seconds TTL
        };

        arbitrator.arbitrate(signal, { referenceTime: now });
        
        // 10 seconds later
        const evicted = arbitrator.sweep(now + 10000);
        assert.strictEqual(evicted.length, 1);
        assert.strictEqual(evicted[0], 'SIG_001');

        const state = arbitrator.getEntityState('DEVICE_001');
        assert.strictEqual(state?.attributes.value, undefined); // evicted
    });
});
