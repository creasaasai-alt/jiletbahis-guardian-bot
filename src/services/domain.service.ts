import fs from 'fs';
import path from 'path';

// docs/STATE.json her koşulda çalışacak şekilde process.cwd() kullan
const STATE_FILE_PATH = path.resolve(process.cwd(), 'docs/STATE.json');

export type BotState = 'OK' | 'PENDING' | 'RE_ALERT' | 'SERVER_DOWN';

interface StateData {
  currentDomain: string;
  currentState: BotState;
  pendingDomain: string | null;
  blockedAt: string | null;
}

const DEFAULT_STATE: StateData = {
  currentDomain: 'jiletbahis102.com',
  currentState: 'OK',
  pendingDomain: null,
  blockedAt: null,
};

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
      console.error('STATE.json okunamadı:', error);
    }
    return { ...DEFAULT_STATE };
  }

  /**
   * STATE.json dosyasına verileri yazar
   */
  static saveState(state: StateData): void {
    try {
      // Klasörü garantile
      const dir = path.dirname(STATE_FILE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      console.error('STATE.json yazılamadı:', error);
    }
  }

  /**
   * Domain sonundaki numarayı belirtilen adım kadar artırır.
   * Örn: (jiletbahis102.com, 1) -> jiletbahis103.com
   */
  static getNextDomain(currentDomain: string, steps: number = 1): string {
    const match = currentDomain.match(/(\d+)(\.[a-z]+)$/i);
    if (match) {
      const nextNumber = parseInt(match[1], 10) + steps;
      return currentDomain.replace(match[1], nextNumber.toString());
    }
    return currentDomain;
  }

  /**
   * Domain içindeki numarayı döner. Örn: jiletbahis103.com -> 103
   */
  static getDomainNumber(domain: string): number {
    const match = domain.match(/(\d+)\./);
    return match ? parseInt(match[1], 10) : 0;
  }
}
