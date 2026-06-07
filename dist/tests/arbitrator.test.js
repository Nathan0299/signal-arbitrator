"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const SignalArbitrator_1 = require("../src/SignalArbitrator");
(0, node_test_1.describe)('Signal Arbitrator SDK Test Suite', () => {
    let config;
    let arbitrator;
    (0, node_test_1.beforeEach)(() => {
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
        arbitrator = new SignalArbitrator_1.SignalArbitrator(config);
    });
    (0, node_test_1.it)('should ingest and apply an uncontested signal', () => {
        const signal = {
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
        node_assert_1.default.strictEqual(result.status, 'uncontested');
        const state = arbitrator.getEntityState('DEVICE_001');
        node_assert_1.default.ok(state);
        node_assert_1.default.strictEqual(state.attributes.value, 100);
        node_assert_1.default.strictEqual(state.attributes.status, 'ok');
    });
    (0, node_test_1.it)('should detect duplicates and discard them', () => {
        const now = new Date().toISOString();
        const signal1 = {
            signalId: 'SIG_001',
            signalType: 'sensor.telemetry',
            sourceSystem: 'sensor_backup',
            entityId: 'DEVICE_001',
            timestamp: now,
            payload: { value: 100, status: 'ok' },
            confidence: 1.0,
            ttl: 30
        };
        const signal2 = {
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
        node_assert_1.default.strictEqual(result.status, 'duplicate');
        node_assert_1.default.strictEqual(result.conflicts.length, 1);
        node_assert_1.default.strictEqual(result.conflicts[0].type, 'duplicate');
    });
    (0, node_test_1.it)('should resolve a priority duel on contradiction: higher priority wins', () => {
        const now = new Date().toISOString();
        const signalBackup = {
            signalId: 'SIG_BACKUP',
            signalType: 'sensor.telemetry',
            sourceSystem: 'sensor_backup', // trust = 0.6
            entityId: 'DEVICE_001',
            timestamp: now,
            payload: { value: 100, status: 'ok' },
            confidence: 1.0,
            ttl: 30
        };
        const signalPrimary = {
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
        node_assert_1.default.strictEqual(result.status, 'WINNER');
        const state = arbitrator.getEntityState('DEVICE_001');
        node_assert_1.default.strictEqual(state?.attributes.value, 120);
        node_assert_1.default.strictEqual(state?.attributes.status, 'warning');
    });
    (0, node_test_1.it)('should resolve a priority duel on contradiction: lower priority is rejected', () => {
        const now = new Date().toISOString();
        const signalPrimary = {
            signalId: 'SIG_PRIMARY',
            signalType: 'sensor.telemetry',
            sourceSystem: 'sensor_primary', // trust = 1.0
            entityId: 'DEVICE_001',
            timestamp: now,
            payload: { value: 120, status: 'warning' },
            confidence: 1.0,
            ttl: 30
        };
        const signalBackup = {
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
        node_assert_1.default.strictEqual(result.status, 'rejected');
        const state = arbitrator.getEntityState('DEVICE_001');
        node_assert_1.default.strictEqual(state?.attributes.value, 120); // still primary value
    });
    (0, node_test_1.it)('should sweep expired signals and update state', () => {
        const now = Date.now();
        const signal = {
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
        node_assert_1.default.strictEqual(evicted.length, 1);
        node_assert_1.default.strictEqual(evicted[0], 'SIG_001');
        const state = arbitrator.getEntityState('DEVICE_001');
        node_assert_1.default.strictEqual(state?.attributes.value, undefined); // evicted
    });
});
