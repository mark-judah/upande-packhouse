import { api } from '@/src/core/api/client';

/** One Post-Harvest employee (grader or packer). */
export type RawStaff = { name?: string; employee_name?: string };

/** /getPostHarvestStaff → { message: { status, graders[], packers[] } }. */
export type RawStaffResponse = {
  message?: { status?: string; graders?: RawStaff[]; packers?: RawStaff[] };
};

/** /createBunchHandover → { message: { status, name, bunches } | { status:'error', message } }. */
export type RawHandoverResponse = {
  message?:
    | { status?: string; name?: string; bunches?: number; message?: string }
    | string;
};

export const karenBunchHandoverApi = {
  /** Active Post-Harvest graders and packers (Employee, custom_farm "Post Harvest"). */
  fetchStaff(): Promise<RawStaffResponse> {
    return api<RawStaffResponse>({ method: 'GET', url: '/api/method/upande_packhouse.mobile.api.getPostHarvestStaff' });
  },

  /** Record how many bunches a grader handed to a packer (timestamped server-side). */
  createHandover(payload: {
    grader: string;
    packer: string;
    bunches: number;
  }): Promise<RawHandoverResponse> {
    return api<RawHandoverResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.createBunchHandover',
      data: payload,
    });
  },
};
