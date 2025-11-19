/**
 * Définitions de types pour les scripts exécutés dans la page WhatsApp Web
 * Ces types permettent l'auto-complétion et la vérification de types dans les scripts
 */

declare global {
  interface Window {
    WPP: {
      conn: {
        getMyUserId(): { _serialized: string } | undefined;
        isAuthenticated(): boolean;
      };
      catalog: {
        getProducts(userId: string, quantity: number): Promise<any[]>;
        getCollections(
          userId: string,
          qnt?: number,
          productsCount?: number,
        ): Promise<any[]>;
        getMyCatalog(): Promise<any | undefined>;
        getProductById(chatId: string, productId: number): Promise<any>;
      };
      contact: {
        getBusinessProfile(userId: string): Promise<any>;
      };
      isReady: boolean;
    };
  }

  // Fonctions disponibles dans le navigateur
  function fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
  const FormData: {
    new (): FormData;
  };
  const navigator: Navigator;
  const console: Console;
}

export {};
