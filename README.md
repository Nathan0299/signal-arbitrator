# @obsidian-os/signal-arbitrator

**Real-Time High-Density IoT/Sensor Telemetry Conflict Resolution & Signal Arbitration SDK.**

`@obsidian-os/signal-arbitrator` is an embedded Node.js/TypeScript SDK extracted from the Obsidian OS Signal Arbitration Engine (SAE). It resolves contradictory data streams from distributed sensor networks (e.g., smart grids, logistics fleets) in real time to establish a single, coherent operational map.

## The Problem
Distributed IoT and sensor arrays frequently emit contradictory telemetry due to hardware malfunctions, connection latency, environmental noise, or active tampering. Writing raw, un-audited telemetry directly to entity states leads to operational maps plagued by split-brain states and erratic data jumps.

## The Solution
**Signal Arbitrator** operates as a high-performance arbitration layer between raw sensor feeds and your entity state model. Instead of direct writes, telemetry is normalized into canonical events. When sensors conflict, the engine executes a deterministic priority duel using source trust weights, confidence scores, and recency TTL decay to establish a single authoritative winner, updating the entity state model cleanly.

## Installation

```bash
npm install @obsidian-os/signal-arbitrator
```

## Quick Start: Smart Grid Conflict Resolution

Define your arbitration, conflict, and aggregation configurations, then ingest contradictory telemetry streams.

```typescript
import { SignalArbitrator, ArbitrationConfig, TelemetrySignal } from '@obsidian-os/signal-arbitrator';

// 1. Define conflict, priority, and aggregation rules
const config: ArbitrationConfig = {
    conflict: {
        duplicateWindowSeconds: 2,
        conflictPairs: ['sensor.smart_grid_telemetry'],
        contradictionRules: {
            'sensor.smart_grid_telemetry': {
                attribute: 'voltage_v',
                maxDelta: 50,      // Voltage jumps > 50V trigger conflict
                windowSeconds: 5  // Conflict evaluation time window
            }
        }
    },
    priority: {
        domainWeights: { infra: 8.0, default: 1.0 },
        sourceTrustDefaults: {
            RTU_Substation_Primary: 1.0, // Hardware-certified primary sensor
            RTU_Substation_Backup: 0.7,  // Secondary sensor
            default: 0.5
        },
        priorityRules: [],
        decayDefaults: { defaultLambda: 0.005 } // Telemetry decays over time
    },
    aggregation: {
        'grid_node.voltage_v': {
            entity: 'grid_node',
            attribute: 'voltage_v',
            aggregationMethod: 'weighted_average', // priority-weighted mean
            minSources: 1,
            windowDays: 1,
            weightField: 'priorityScore'
        },
        'grid_node.temperature_c': {
            entity: 'grid_node',
            attribute: 'temperature_c',
            aggregationMethod: 'max',              // peak temperature wins
            minSources: 1,
            windowDays: 1
        }
    }
};

// 2. Initialize the Arbitrator
const arbitrator = new SignalArbitrator(config);

// Ingest telemetry
const backupTelemetry: TelemetrySignal = {
    signalId: 'SIG_BACKUP_001',
    signalType: 'sensor.smart_grid_telemetry',
    sourceSystem: 'RTU_Substation_Backup',
    entityId: 'GRID_NODE_01',
    timestamp: new Date().toISOString(),
    payload: { voltage_v: 220.0, temperature_c: 35.0 },
    confidence: 0.9,
    ttl: 10
};

// Ingest conflicting primary telemetry 1 second later
const primaryTelemetry: TelemetrySignal = {
    signalId: 'SIG_PRIMARY_002',
    signalType: 'sensor.smart_grid_telemetry',
    sourceSystem: 'RTU_Substation_Primary',
    entityId: 'GRID_NODE_01',
    timestamp: new Date(Date.now() + 1000).toISOString(),
    payload: { voltage_v: 285.0, temperature_c: 42.0 }, // Delta of 65V > 50V
    confidence: 1.0,
    ttl: 10
};

arbitrator.arbitrate(backupTelemetry);
const result = arbitrator.arbitrate(primaryTelemetry);

console.log(result.status); // 'WINNER' (Primary RTU wins the priority duel over Backup RTU)

const state = arbitrator.getEntityState('GRID_NODE_01');
console.log(state.attributes); // { voltage_v: 285.0, temperature_c: 42.0 }
```

## Features
*   **Duplicate Detection:** Discards duplicate sensor packets received within the duplicate window.
*   **Priority Duels:** Resolves value contradictions by evaluating domain priority, source default trust, and packet confidence.
*   **Recency TTL Decay:** Temporally decays signal weights over time ($\Delta t$), ensuring fresh sensor readings naturally override older data.
*   **Multi-Source Aggregation:** Aggregates winning and coexisting signals using weighted average, max, sum, median, or latest value algorithms.
*   **Consensus Gating:** Enforces Minimum Source Consensus (MSC) limits before values propagate to platform states.

---
*Built with absolute sovereignty by the Obsidian OS Team.*
