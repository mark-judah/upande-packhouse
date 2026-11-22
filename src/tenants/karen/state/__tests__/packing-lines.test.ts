import { stemsInBoxOf, targetPerVariety, type PackingGuide } from '../karen-packing-store';

// XPOL-05209 box 1: Aqua on two lines -- 4 bunches of 5 (straight) and 4 bunches of 20 (mixed), 100 stems.
const row = (variety: string, stemsPerBunch: number, bunches: number) => ({
  variety, itemName: variety, colour: '', length: '42cm', stemsPerBunch, bunches, stems: stemsPerBunch * bunches,
});
const guide = {
  boxes: { 1: [row('Aqua', 5, 4), row('Aqua', 20, 4), row('Fuchsiana', 5, 4)] },
  items: [], plannedBoxes: 3, boxNumbers: [1, 2, 3], packratePerBox: 560, isMixed: true, isMixedBunch: false,
  itemGroup: '', bouquetGuide: [], specImage: '',
} as unknown as PackingGuide;

test('each line of a variety gets its own share of the box', () => {
  expect(targetPerVariety(guide, 'Aqua', 1, 5)).toBe(20);
  expect(targetPerVariety(guide, 'Aqua', 1, 20)).toBe(80);
  expect(targetPerVariety(guide, 'Aqua', 1)).toBe(100);
  expect(targetPerVariety(guide, 'Fuchsiana', 1, 5)).toBe(20);
});

test('stems in the box are counted per line when the variety is on two lines', () => {
  const state = { varietyStemsInBox: { Aqua: { 1: 80 }, Fuchsiana: { 1: 20 } }, lineStemsInBox: { 'Aqua|20': { 1: 80 } } };
  expect(stemsInBoxOf(state, guide, 'Aqua', 1, 5)).toBe(0);
  expect(stemsInBoxOf(state, guide, 'Aqua', 1, 20)).toBe(80);
  expect(stemsInBoxOf(state, guide, 'Fuchsiana', 1, 5)).toBe(20);
});
