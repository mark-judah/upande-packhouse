import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { storage, StorageKeys } from '@/src/core/storage';
import { useServerFeatures } from '@/src/core/api/server-features';

type TenantContextValue = {
  instanceUrl: string | null;
  setInstanceUrl: (url: string | null) => Promise<void>;
  hydrated: boolean;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [instanceUrl, setUrlState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await storage.get(StorageKeys.instanceUrl);
      setUrlState(stored);
      setHydrated(true);
    })();
  }, []);

  const setInstanceUrl = async (url: string | null) => {
    if (url) await storage.set(StorageKeys.instanceUrl, url);
    else await storage.remove(StorageKeys.instanceUrl);
    // Another site may have the methods this one lacked.
    if (url !== instanceUrl) useServerFeatures.getState().reset();
    setUrlState(url);
  };

  return (
    <TenantContext.Provider value={{ instanceUrl, setInstanceUrl, hydrated }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside <TenantProvider>');
  return ctx;
}
