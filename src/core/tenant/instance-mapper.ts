export type Tenant = 'Karen' | 'Kikwetu' | 'Xflora' | 'Mona' | 'Tambuzi' | 'Demo';

const URL_TO_TENANT: Record<string, Tenant> = {
  'https://kikwetu.upande.com': 'Kikwetu',
  'https://kikwetu-production.jh.frappe.cloud': 'Kikwetu',
  'https://kaitet-group.upande.com': 'Karen',
  'https://kaitet-group.c.frappe.cloud': 'Karen',
  'http://10.49.59.154:8001': 'Karen',
  'https://upande-kaitet-group-staging.frappe.cloud': 'Karen',
  'https://upande-kaitet2.c.frappe.cloud': 'Karen',
  'https://kaitet-group-staging.upande.com': 'Karen',
  'https://upande-insights.frappe.cloud': 'Demo',
  'http://10.112.207.154:8002': 'Karen',
  'http://10.42.177.154:8001': 'Karen',
  'http://192.168.43.97:8001': 'Karen',
  'http://10.56.207.154:8002': 'Karen',
  'http://10.209.26.154:8002': 'Karen',
  'https://mona-flowers-staging.upande.com': 'Mona',
  'https://mona-flowers.upande.com': 'Mona',
  'https://xflora.fsn.frappe.cloud': 'Xflora',
  'http://10.121.65.154:8002': 'Karen',
  'http://192.168.3.102:8002': 'Karen',
  'http://192.168.2.106:8002': 'Karen',
  'http://192.168.88.244:8002': 'Karen',
  'http://10.230.56.154:8002': 'Karen',
  'http://10.77.222.154:8002': 'Karen',
  'https://draft-unnecessary-trinity-isa.trycloudflare.com': 'Karen'
};

export function getTenantByUrl(url: string | null | undefined): Tenant | null {
  if (!url) return null;
  return URL_TO_TENANT[url] ?? null;
}
