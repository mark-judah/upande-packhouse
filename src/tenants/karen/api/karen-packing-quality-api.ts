import { api } from '@/src/core/api/client';

// =====================================================================
// Quality issues found while packing (upande_packhouse.api.packing_quality):
// a bucket issued to a line turns out to have the wrong stem length, a
// disease or a pest. Its bad stems go to Rejects and a replacement is
// allocated -- from the sales farm first, else from a remote farm, ASAP.
// =====================================================================

export type RawQualityDefect = { defect: string; category: string };

export type RawQualityLine = {
  sales_order_item: string;
  item_code: string;
  stem_length?: string | null;
  uom?: string | null;
  buckets: { bucket: string; stems: number; farm?: string | null }[];
};

export type RawQualityIssueLines = {
  opl_name?: string;
  order_name?: string;
  sales_farm?: string | null;
  defects?: RawQualityDefect[];
  categories?: string[];
  lines?: RawQualityLine[];
};

export type RawQualityCandidate = {
  new_bucket: string;
  farm: string;
  shelf?: string | null;
  variety?: string | null;
  stem_length?: string | null;
  available_qty?: number;
  harvest_date?: string | null;
  recommended?: boolean;
};

export type RawQualityOptions = {
  success?: boolean;
  message?: string | null;
  warning?: string | null;
  bucket?: string;
  on_line?: number;
  needed?: number;
  sales_farm?: string | null;
  sales_farm_candidates?: RawQualityCandidate[];
  remote_candidates?: RawQualityCandidate[];
};

export type RawQualityReport = {
  success?: boolean;
  message?: string;
  replacement?: string;
  new_bucket?: string | null;
  source?: 'sales_farm' | 'remote' | null;
  priority?: string | null;
  issued?: boolean;
};

const PACKING_QUALITY = '/api/method/upande_packhouse.api.packing_quality';

export const karenPackingQualityApi = {
  /** The buckets issued to each line of the OPL, and the defects to choose from. */
  async fetchLines(oplName: string): Promise<RawQualityIssueLines> {
    const res = await api<{ message?: RawQualityIssueLines }>({
      method: 'GET',
      url: `${PACKING_QUALITY}.quality_issue_lines`,
      params: { opl_name: oplName },
    });
    return res.message ?? {};
  },

  /** Replacements for `stems` bad stems of the bucket: sales farm first, then remote farms. */
  async fetchOptions(payload: {
    opl_name: string;
    bucket: string;
    sale_order_item: string;
    stems: number;
  }): Promise<RawQualityOptions> {
    const res = await api<{ message?: RawQualityOptions }>({
      method: 'GET',
      url: `${PACKING_QUALITY}.quality_replacement_options`,
      params: payload,
    });
    return res.message ?? {};
  },

  /** Reject the bad stems and allocate the replacement in one go. */
  async report(payload: {
    opl_name: string;
    bucket: string;
    sale_order_item: string;
    defect: string;
    scope: 'bucket' | 'stems';
    stems?: number;
    new_bucket_id?: string;
    notes?: string;
  }): Promise<RawQualityReport> {
    const res = await api<{ message?: RawQualityReport }>({
      method: 'POST',
      url: `${PACKING_QUALITY}.report_packing_quality_issue`,
      data: payload,
      // Posts stock (rejects, the replacement's allocation and issue).
      timeout: 120000,
    });
    return res.message ?? {};
  },
};
