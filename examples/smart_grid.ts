import { SignalArbitrator } from '../src/SignalArbitrator';
import { ArbitrationConfig, TelemetrySignal } from '../src/types';

// 1. Configure Arbitration Engine for Smart Grid
const config: ArbitrationConfig = {
    conflict: {
        duplicateWindowSeconds: 2,
        conflictPairs: ['sensor.smart_grid_telemetry'],
        contradictionRules: {
            'sensor.smart_grid_telemetry': {
                attribute: 'voltage_v',
                maxDelta: 50,
                windowSeconds: 5 // 5 seconds conflict evaluation window
            }
        }
    },
    priority: {
        domainWeights: {
            infra: 8.0,
            default: 1.0
        },
        sourceTrustDefaults: {
            RTU_Substation_Primary: 1.0,
            RTU_Substation_Backup: 0.7,
            default: 0.5
        },
        priorityRules: [],
        decayDefaults: {
            defaultLambda: 0.005 // high decay rate for real-time sensors
        }
    },
    aggregation: {
        'grid_node.voltage_v': {
            entity: 'grid_node',
            attribute: 'voltage_v',
            aggregationMethod: 'weighted_average',
            minSources: 1,
            windowDays: 1,
            weightField: 'priorityScore'
        },
        'grid_node.frequency_hz': {
            entity: 'grid_node',
            attribute: 'frequency_hz',
            aggregationMethod: 'weighted_average',
            minSources: 1,
            windowDays: 1,
            weightField: 'priorityScore'
        },
        'grid_node.temperature_c': {
            entity: 'grid_node',
            attribute: 'temperature_c',
            aggregationMethod: 'max',
            minSources: 1,
            windowDays: 1
        },
        'grid_node.status': {
            entity: 'grid_node',
            attribute: 'status',
            aggregationMethod: 'latest_value',
            minSources: 1,
            windowDays: 1
        }
    }
};

const arbitrator = new SignalArbitrator(config);

console.log("=== STARTING SMART GRID TELEMETRY RESOLUTION SIMULATION ===");

const nowISO = new Date().toISOString();

// Signal 1: Backup Sensor reports Nominal Telemetry
const signalBackup: TelemetrySignal = {
    signalId: 'SIG_BACKUP_001',
    signalType: 'sensor.smart_grid_telemetry',
    sourceSystem: 'RTU_Substation_Backup',
    entityId: 'GRID_NODE_ACCRA_01',
    timestamp: nowISO,
    payload: {
        voltage_v: 220.0,
        frequency_hz: 50.1,
        temperature_c: 35.0,
        status: 'nominal'
    },
    confidence: 0.9,
    ttl: 10 // 10 seconds TTL
};

console.log(`\n1. Ingesting Signal from Backup RTU (SIG_BACKUP_001)...`);
const res1 = arbitrator.arbitrate(signalBackup);
console.log(`   Arbitration Status: ${res1.status} (Priority Score: ${res1.priorityScore})`);

let state = arbitrator.getEntityState('GRID_NODE_ACCRA_01');
console.log(`   Accra Grid Node State:`, JSON.stringify(state?.attributes));
console.log(`   State Confidence: ${state?.confidence}`);

// Signal 2: Primary Sensor reports conflicting high-voltage spike 1 second later
const signalPrimary: TelemetrySignal = {
    signalId: 'SIG_PRIMARY_002',
    signalType: 'sensor.smart_grid_telemetry',
    sourceSystem: 'RTU_Substation_Primary',
    entityId: 'GRID_NODE_ACCRA_01',
    timestamp: new Date(Date.now() + 1000).toISOString(),
    payload: {
        voltage_v: 285.0, // delta is 65V > 50V threshold
        frequency_hz: 50.2,
        temperature_c: 42.0,
        status: 'warning'
    },
    confidence: 1.0,
    ttl: 10
};

console.log(`\n2. Ingesting Conflicting Signal from Primary RTU (SIG_PRIMARY_002)...`);
const res2 = arbitrator.arbitrate(signalPrimary, { referenceTime: Date.now() + 1000 });
console.log(`   Arbitration Status: ${res2.status} (Priority Score: ${res2.priorityScore})`);
console.log(`   Conflicts Found:`, res2.conflicts.map(c => `${c.type} on ${c.details.attribute} with delta ${c.details.delta}V`));

state = arbitrator.getEntityState('GRID_NODE_ACCRA_01');
console.log(`   Accra Grid Node State:`, JSON.stringify(state?.attributes));
console.log(`   State Confidence: ${state?.confidence}`);
console.log(`   (Notice voltage updated to 285.0V because Primary has higher priority: 8.0 vs 5.04. Temperature updated to max value 42C)`);

// Signal 3: Backup sensor tries to report lower voltage again (Suppressed/Rejected)
const signalBackupStale: TelemetrySignal = {
    signalId: 'SIG_BACKUP_003',
    signalType: 'sensor.smart_grid_telemetry',
    sourceSystem: 'RTU_Substation_Backup',
    entityId: 'GRID_NODE_ACCRA_01',
    timestamp: new Date(Date.now() + 2000).toISOString(),
    payload: {
        voltage_v: 221.0,
        frequency_hz: 50.1,
        temperature_c: 36.0,
        status: 'nominal'
    },
    confidence: 0.9,
    ttl: 10
};

console.log(`\n3. Ingesting Stale Signal from Backup RTU (SIG_BACKUP_003)...`);
const res3 = arbitrator.arbitrate(signalBackupStale, { referenceTime: Date.now() + 2000 });
console.log(`   Arbitration Status: ${res3.status} (Priority Score: ${res3.priorityScore})`);

state = arbitrator.getEntityState('GRID_NODE_ACCRA_01');
console.log(`   Accra Grid Node State:`, JSON.stringify(state?.attributes));
console.log(`   (Notice backup signal was rejected because new primary signal has higher authority)`);

// 4. Temporal Expiration Sweep: simulate passing of time (15 seconds later)
console.log(`\n4. Simulating time sweep (+15 seconds later)...`);
const swept = arbitrator.sweep(Date.now() + 15000);
console.log(`   Swept/Evicted Signals:`, swept);

state = arbitrator.getEntityState('GRID_NODE_ACCRA_01');
console.log(`   Final Accra Grid Node State:`, JSON.stringify(state?.attributes));
console.log(`=== SIMULATION COMPLETED ===`);
