import fs from 'fs';
import path from 'path';

// docs/STATE.json dosyasının tam yolu
const STATE_FILE_PATH = path.join(__dirname, '../../docs/STATE.json');

export type BotState = 'OK' | 'PENDING' | 'RE_ALERT' | 'SERVER_DOWN';

interface StateData {
  currentDomain: string;
  currentState: BotState;
  pendingDomain: string | null;
  blockedAt: string | null;
}

export class DomainService {
  /**
   * STATE.json dosyasını okur
   */
  static getState(): StateData {
    try {
      if (fs.existsSync(STATE_FILE_PATH)) {
        const rawData = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
        return JSON.parse(rawData);
      }
    } catch (error) {
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
  static saveState(state: StateData): void {
    try {
      fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      console.error("STATE.json yazılamadı:", error);
    }
  }

  /**
   * Domain sonundaki numarayı alır ve istenen adım (steps) kadar artırıp yeni domaini döndürür.
   * Lookahead özelliği için steps parametresi eklendi.
   * Örn: (jiletbahis102.com, 5) -> jiletbahis107.com
   */
  static getNextDomain(currentDomain: string, steps: number = 1): string {
    const match = currentDomain.match(/(\d+)(\.[a-z]+)$/i);
    if (match) {
      const currentNumber = parseInt(match[1], 10);
      const nextNumber = currentNumber + steps;
      return currentDomain.replace(match[1], nextNumber.toString());
    }
    return currentDomain;
  }
}
