"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SignalArbitrator_1 = require("../src/SignalArbitrator");
// 1. Configure Arbitration Engine for Logistics Fleet
const config = {
    conflict: {
        duplicateWindowSeconds: 5,
        conflictPairs: ['sensor.logistics_fleet_telemetry'],
        contradictionRules: {
            'sensor.logistics_fleet_telemetry': {
                attribute: 'speed_kmh',
                maxDelta: 80,
                windowSeconds: 30 // 30 seconds conflict evaluation window
            }
        }
    },
    priority: {
        domainWeights: {
            platform: 6.0,
            default: 1.0
        },
        sourceTrustDefaults: {
            Fleet_GPS_Telemetry: 0.9,
            Driver_Mobile_App: 0.4,
            default: 0.5
        },
        priorityRules: [],
        decayDefaults: {
            defaultLambda: 0.001
        }
    },
    aggregation: {
        'logistics_vehicle.speed_kmh': {
            entity: 'logistics_vehicle',
            attribute: 'speed_kmh',
            aggregationMethod: 'latest_value',
            minSources: 1,
            windowDays: 1
        },
        'logistics_vehicle.latitude': {
            entity: 'logistics_vehicle',
            attribute: 'latitude',
            aggregationMethod: 'latest_value',
            minSources: 1,
            windowDays: 1
        },
        'logistics_vehicle.longitude': {
            entity: 'logistics_vehicle',
            attribute: 'longitude',
            aggregationMethod: 'latest_value',
            minSources: 1,
            windowDays: 1
        },
        'logistics_vehicle.fuel_level_pct': {
            entity: 'logistics_vehicle',
            attribute: 'fuel_level_pct',
            aggregationMethod: 'latest_value',
            minSources: 1,
            windowDays: 1
        },
        'logistics_vehicle.status': {
            entity: 'logistics_vehicle',
            attribute: 'status',
            aggregationMethod: 'latest_value',
            minSources: 1,
            windowDays: 1
        }
    }
};
const arbitrator = new SignalArbitrator_1.SignalArbitrator(config);
console.log("=== STARTING LOGISTICS FLEET TELEMETRY RESOLUTION SIMULATION ===");
const nowISO = new Date().toISOString();
// Signal 1: Driver Mobile App reports standard travel info
const signalDriver = {
    signalId: 'SIG_DRIVER_001',
    signalType: 'sensor.logistics_fleet_telemetry',
    sourceSystem: 'Driver_Mobile_App',
    entityId: 'VEHICLE_TRUCK_402',
    timestamp: nowISO,
    payload: {
        speed_kmh: 55.0,
        latitude: 5.6037,
        longitude: -0.1870,
        fuel_level_pct: 82.0,
        status: 'in_transit'
    },
    confidence: 0.8,
    ttl: 60
};
console.log(`\n1. Ingesting Signal from Driver Mobile App (SIG_DRIVER_001)...`);
const res1 = arbitrator.arbitrate(signalDriver);
console.log(`   Arbitration Status: ${res1.status} (Priority Score: ${res1.priorityScore})`);
let state = arbitrator.getEntityState('VEHICLE_TRUCK_402');
console.log(`   Vehicle State:`, JSON.stringify(state?.attributes));
// Signal 2: Conflicting GPS telemetry reports vehicle speed anomaly at same time
const signalGPS = {
    signalId: 'SIG_GPS_002',
    signalType: 'sensor.logistics_fleet_telemetry',
    sourceSystem: 'Fleet_GPS_Telemetry',
    entityId: 'VEHICLE_TRUCK_402',
    timestamp: nowISO,
    payload: {
        speed_kmh: 140.0, // delta is 85 kmh > 80 kmh threshold
        latitude: 5.6039,
        longitude: -0.1868,
        fuel_level_pct: 81.8,
        status: 'in_transit'
    },
    confidence: 1.0,
    ttl: 60
};
console.log(`\n2. Ingesting Conflicting Signal from Fleet GPS Telemetry (SIG_GPS_002)...`);
const res2 = arbitrator.arbitrate(signalGPS);
console.log(`   Arbitration Status: ${res2.status} (Priority Score: ${res2.priorityScore})`);
console.log(`   Conflicts Found:`, res2.conflicts.map(c => `${c.type} on ${c.details.attribute} with delta ${c.details.delta} km/h`));
state = arbitrator.getEntityState('VEHICLE_TRUCK_402');
console.log(`   Vehicle State:`, JSON.stringify(state?.attributes));
console.log(`   (Notice speed resolved to 140.0 km/h because GPS has higher priority: 5.4 vs 3.2)`);
// Signal 3: Test Duplicate Detection: Driver App sends identical signal within duplicate window
const signalDriverDup = {
    signalId: 'SIG_DRIVER_002',
    signalType: 'sensor.logistics_fleet_telemetry',
    sourceSystem: 'Driver_Mobile_App',
    entityId: 'VEHICLE_TRUCK_402',
    timestamp: new Date(Date.now() + 1000).toISOString(),
    payload: {
        speed_kmh: 55.0,
        latitude: 5.6037,
        longitude: -0.1870,
        fuel_level_pct: 82.0,
        status: 'in_transit'
    },
    confidence: 0.8,
    ttl: 60
};
console.log(`\n3. Ingesting Duplicate Signal from Driver Mobile App (SIG_DRIVER_002)...`);
const res3 = arbitrator.arbitrate(signalDriverDup, { referenceTime: Date.now() + 1000 });
console.log(`   Arbitration Status: ${res3.status}`);
console.log(`   Conflicts Found:`, res3.conflicts.map(c => `${c.type} reason: ${c.reason}`));
state = arbitrator.getEntityState('VEHICLE_TRUCK_402');
console.log(`   Final Vehicle State:`, JSON.stringify(state?.attributes));
console.log(`=== SIMULATION COMPLETED ===`);
