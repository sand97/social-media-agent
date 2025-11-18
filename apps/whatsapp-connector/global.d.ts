// global.d.ts
import * as WPP from '@wppconnect/wa-js'; // Importe les types de wa-js

declare global {
  interface Window {
    WPP: typeof WPP; // Associe WPP aux types exportés par wa-js
  }
}

export {};
