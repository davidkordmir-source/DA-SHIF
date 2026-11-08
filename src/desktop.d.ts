export {};
declare global {
  interface Window {
    desktop?: {
      platform: string;
      readData: () => { ok: boolean; data?: string | null; error?: string };
      writeData: (json: string) => { ok: boolean; error?: string };
      ready: () => void;
      branding: () => Promise<{
        custom: boolean;
        fileName: string;
        logo: string;
      }>;
      chooseLogo: () => Promise<{
        ok: boolean;
        cancelled?: boolean;
        error?: string;
      }>;
      openInstallFolder: () => Promise<void>;
      openDataFolder: () => Promise<void>;
    };
  }
}
