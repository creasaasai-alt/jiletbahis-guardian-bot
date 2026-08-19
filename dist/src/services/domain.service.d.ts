export type BotState = 'OK' | 'PENDING' | 'RE_ALERT';
interface StateData {
    currentDomain: string;
    currentState: BotState;
    pendingDomain: string | null;
    blockedAt: string | null;
}
export declare class DomainService {
    /**
     * STATE.json dosyasını okur
     */
    static getState(): StateData;
    /**
     * STATE.json dosyasına verileri yazar
     */
    static saveState(state: StateData): void;
    /**
     * Domain sonundaki numarayı alır ve istenen adım (steps) kadar artırıp yeni domaini döndürür.
     * Lookahead özelliği için steps parametresi eklendi.
     * Örn: (jiletbahis102.com, 5) -> jiletbahis107.com
     */
    static getNextDomain(currentDomain: string, steps?: number): string;
}
export {};
//# sourceMappingURL=domain.service.d.ts.map