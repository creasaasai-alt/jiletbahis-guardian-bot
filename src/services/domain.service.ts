import fs from 'fs';
import path from 'path';

// docs/STATE.json dosyasının tam yolu
const STATE_FILE_PATH = path.join(__dirname, '../../docs/STATE.json');

export type BotState = 'OK' | 'PENDING' | 'RE_ALERT';

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
   * Domain ismindeki sayıyı bulup 1 artırarak yeni domaini hesaplar.
   * Örn: "jiletbahis102.com" -> "jiletbahis103.com"
   */
  static getNextDomain(currentDomain: string): string {
    // Sadece rakamları yakalayan Regex
    const regex = /(\d+)/;
    const match = currentDomain.match(regex);

    if (match && match[0]) {
      const currentNumber = parseInt(match[0], 10);
      const nextNumber = currentNumber + 1;
      
      // Rakamı yeni rakamla değiştir
      return currentDomain.replace(regex, nextNumber.toString());
    }

    // Eğer domainde rakam yoksa, manuel müdahale gerekebilir.
    // Şimdilik aynısını döndürüyoruz.
    return currentDomain;
  }
}
