import { useKarenPackingStore, type PickListLine } from '@/src/tenants/karen/state/karen-packing-store';
import { karenPackingApi } from '@/src/tenants/karen/api/karen-packing-api';

function line(itemCode: string, qty: number): PickListLine {
  return {
    itemCode,
    itemName: itemCode,
    qty,
    uom: 'Bunch (10)',
    warehouse: 'Kapkolia Available for Sale - KL',
    stemLength: '50cm',
    spec: '',
    itemGroup: 'Standard Roses',
  };
}

/** A mixed box of three varieties: 4 + 4 + 2 bunches per box, two boxes ordered. */
function mixedBox(inBox: Record<string, number> = {}) {
  useKarenPackingStore.setState({
    selectedOpl: 'OPL-TEST',
    saleOrderId: 'SO-TEST',
    customerId: 'CUST',
    currentBoxId: 1,
    submitting: false,
    closedBoxes: {},
    issueCap: null,
    pickListItems: [line('Athena', 8), line('Pink Ice', 8), line('Red Naomi', 4)],
    packedBunchesTally: {},
    varietyStemsInBox: Object.fromEntries(Object.entries(inBox).map(([v, stems]) => [v, { 1: stems }])),
    packingGuide: {
      boxes: {
        1: [
          { variety: 'Athena', stems: 40 },
          { variety: 'Pink Ice', stems: 40 },
          { variety: 'Red Naomi', stems: 20 },
        ],
      },
      itemGroup: 'Standard Roses',
      isMixed: true,
      plannedBoxes: 2,
      packratePerBox: 100,
      items: [],
      isMixedBunch: false,
      bouquetGuide: [],
      specImage: '',
    } as never,
  });
}

describe('mixed box packing counts the box in bunches', () => {
  let saveSpy: jest.SpyInstance;
  beforeEach(() => {
    saveSpy = jest.spyOn(karenPackingApi, 'createOrUpdateFarmPackList').mockResolvedValue({} as never);
    jest.spyOn(karenPackingApi, 'fetchPickListWithFpl').mockResolvedValue({} as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('reports the box as one count, whatever the variety', () => {
    mixedBox({ Athena: 20, 'Red Naomi': 10 });
    const box = useKarenPackingStore.getState().boxFill();
    expect(box.packed).toBe(3);
    expect(box.required).toBe(10);
    expect(box.lines.map((l) => l.bunches)).toEqual([2, 4, 1]);
  });

  it('splits the bunches added across the varieties in the box ratio', async () => {
    mixedBox();
    const out = await useKarenPackingStore.getState().fillBox(5);
    expect(out.kind).toBe('success');
    const items = saveSpy.mock.calls[0][0].items;
    const byVariety = Object.fromEntries(items.map((i: { item_code: string; bunch_qty: number }) => [i.item_code, i.bunch_qty]));
    expect(byVariety).toEqual({ Athena: 2, 'Pink Ice': 2, 'Red Naomi': 1 });
    expect(items.every((i: { box_id: string }) => i.box_id === '1')).toBe(true);
  });

  it('fills the whole box in one entry', async () => {
    mixedBox({ Athena: 10 });
    await useKarenPackingStore.getState().fillBox();
    const items = saveSpy.mock.calls[0][0].items;
    expect(items.reduce((n: number, i: { bunch_qty: number }) => n + i.bunch_qty, 0)).toBe(9);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('never fills past the most bunches the box takes', async () => {
    // A variety already over its share leaves less room for the others.
    mixedBox({ Athena: 60 });
    const box = useKarenPackingStore.getState().boxFill();
    expect(box.packed + box.lines.reduce((n, l) => n + l.bunches, 0)).toBeLessThanOrEqual(box.required);
  });

  it('refuses more than the box has room for', async () => {
    mixedBox();
    const out = await useKarenPackingStore.getState().fillBox(11);
    expect(out.kind).toBe('warning');
    expect(saveSpy).not.toHaveBeenCalled();
  });
});
