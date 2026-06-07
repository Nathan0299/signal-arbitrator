import { ConflictConfig, TelemetrySignal, ConflictRecord } from './types';
export declare class ConflictDetector {
    private config;
    constructor(config: ConflictConfig);
    /**
     * Checks if the incoming signal conflicts with any historical signals in the relevant window.
     *
     * @param signal The incoming telemetry signal
     * @param history Active historical signals for the same entity
     */
    detect(signal: TelemetrySignal, history: TelemetrySignal[]): ConflictRecord[];
}
