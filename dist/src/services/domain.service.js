"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// docs/STATE.json dosyasının tam yolu
const STATE_FILE_PATH = path_1.default.join(__dirname, '../../docs/STATE.json');
class DomainService {
    /**
     * STATE.json dosyasını okur
     */
    static getState() {
        try {
            if (fs_1.default.existsSync(STATE_FILE_PATH)) {
                const rawData = fs_1.default.readFileSync(STATE_FILE_PATH, 'utf-8');
                return JSON.parse(rawData);
            }
        }
        catch (error) {
            console.error("STATE.json okunamadı:", error);
        }
        // Varsayılan State
        return {
            currentDomain: 'jiletbahis102.com',
            currentState: 'OK',
            pendingDomain: null,
            blockedAt: null
        };
    }
    /**
     * STATE.json dosyasına verileri yazar
     */
    static saveState(state) {
        try {
            fs_1.default.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
        }
        catch (error) {
            console.error("STATE.json yazılamadı:", error);
        }
    }
    /**
     * Domain sonundaki numarayı alır ve istenen adım (steps) kadar artırıp yeni domaini döndürür.
     * Lookahead özelliği için steps parametresi eklendi.
     * Örn: (jiletbahis102.com, 5) -> jiletbahis107.com
     */
    static getNextDomain(currentDomain, steps = 1) {
        const match = currentDomain.match(/(\d+)(\.[a-z]+)$/i);
        if (match) {
            const currentNumber = parseInt(match[1], 10);
            const nextNumber = currentNumber + steps;
            return currentDomain.replace(match[1], nextNumber.toString());
        }
        return currentDomain;
    }
}
exports.DomainService = DomainService;
//# sourceMappingURL=domain.service.js.map