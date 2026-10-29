import { karenBoxLabelsApi } from '@/src/tenants/karen/api/karen-box-labels-api';
import { useKarenBoxLabelsStore } from '@/src/tenants/karen/state/karen-box-labels-store';

afterEach(() => {
  jest.restoreAllMocks();
  useKarenBoxLabelsStore.getState().reset();
});

describe('karen box labels store', () => {
  it('maps the order list for the selected delivery date', async () => {
    const list = jest.spyOn(karenBoxLabelsApi, 'listOrders').mockResolvedValue({
      message: {
        date: '2026-10-08',
        orders: [{ opl_name: 'OPL-1', order_name: 'UK -3', customer: 'UK Flora', boxes: 4, printed: 1 }],
      },
    });
    await useKarenBoxLabelsStore.getState().setDate('2026-10-08');
    expect(list).toHaveBeenCalledWith('2026-10-08');
    expect(useKarenBoxLabelsStore.getState().orders).toEqual([
      { oplName: 'OPL-1', orderName: 'UK -3', customer: 'UK Flora', boxes: 4, printed: 1 },
    ]);
  });

  it('ignores a slow response for a date the user has since moved off', async () => {
    let resolveFirst!: (v: Awaited<ReturnType<typeof karenBoxLabelsApi.listOrders>>) => void;
    jest
      .spyOn(karenBoxLabelsApi, 'listOrders')
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce({ message: { orders: [{ opl_name: 'NEW', boxes: 1 }] } });
    const first = useKarenBoxLabelsStore.getState().setDate('2026-10-01');
    await useKarenBoxLabelsStore.getState().setDate('2026-10-02');
    resolveFirst({ message: { orders: [{ opl_name: 'STALE', boxes: 9 }] } });
    await first;
    expect(useKarenBoxLabelsStore.getState().orders.map((o) => o.oplName)).toEqual(['NEW']);
  });

  it('sends the chosen print format and preview flag, and returns the PDF', async () => {
    const gen = jest
      .spyOn(karenBoxLabelsApi, 'generatePdf')
      .mockResolvedValue({ message: { pdf_base64: 'QUJD', filename: 'x.pdf', count: 1 } });
    const out = await useKarenBoxLabelsStore
      .getState()
      .generate('OPL-1', { printFormat: 'Box Label - Bold Shipping', preview: true });
    expect(gen).toHaveBeenCalledWith({
      order_pick_list: 'OPL-1',
      print_format: 'Box Label - Bold Shipping',
      preview: true,
    });
    expect(out).toEqual({ success: true, base64: 'QUJD', filename: 'x.pdf', count: 1 });
  });

  it('reports a missing PDF and a failed request without throwing', async () => {
    const gen = jest.spyOn(karenBoxLabelsApi, 'generatePdf').mockResolvedValueOnce({ message: {} });
    expect(await useKarenBoxLabelsStore.getState().generate('OPL-1')).toEqual({
      success: false,
      message: 'The server did not return a PDF.',
    });
    gen.mockRejectedValueOnce(new Error('boom'));
    const out = await useKarenBoxLabelsStore.getState().generate('OPL-1');
    expect(out.success).toBe(false);
    expect(useKarenBoxLabelsStore.getState().generating).toBe(false);
  });

  it('keeps the format list and a readable error when formats cannot load', async () => {
    jest.spyOn(karenBoxLabelsApi, 'getPrintFormats').mockRejectedValue(new Error('Network Error'));
    await useKarenBoxLabelsStore.getState().loadFormats();
    const st = useKarenBoxLabelsStore.getState();
    expect(st.formats).toEqual([]);
    expect(st.formatsError).toBeTruthy();
    expect(st.formatsLoading).toBe(false);
  });
});
