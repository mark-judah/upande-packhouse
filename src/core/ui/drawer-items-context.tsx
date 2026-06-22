import { createContext, useContext, type ReactNode } from 'react';
import type { DrawerItem } from '@/src/core/tenant/types';

const DrawerItemsContext = createContext<DrawerItem[]>([]);

export function DrawerItemsProvider({
  items,
  children,
}: {
  items: DrawerItem[];
  children: ReactNode;
}) {
  return <DrawerItemsContext.Provider value={items}>{children}</DrawerItemsContext.Provider>;
}

export function useDrawerItems(): DrawerItem[] {
  return useContext(DrawerItemsContext);
}
