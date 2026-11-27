import { describe, it, expect } from "vitest";
import { EditableTableSlice } from "./EditableTableSlice.js";

describe("EditableTableSlice.hydrateOverrides", () => {
  it("restores saved overrides of the persisted rows and leaves the others alone", () => {
    const slice = new EditableTableSlice("currentActivesTest");
    const store = slice.createStore();
    store.dispatch(slice.actions.setOverride({ rowKey: "stocks", columnKey: "2026", value: 123 }));
    store.dispatch(slice.actions.setOverride({ rowKey: "cashAndBank", columnKey: "2026", value: 9 }));

    store.dispatch(
      slice.actions.hydrateOverrides({
        rowKeys: ["stocks"],
        rows: [{ rowId: "stocks", values: { 2026: 0 } }],
      }),
    );

    const overrides = slice.selectOverrides(store.getState());
    expect(overrides["stocks:2026"]).toBe(0); // saved value wins over the in-memory one
    expect(overrides["cashAndBank:2026"]).toBe(9); // non-persisted row untouched
  });

  it("a saved 0 overrides the computed default in the total", () => {
    const slice = new EditableTableSlice("currentActivesTest2");
    const store = slice.createStore();
    store.dispatch(
      slice.actions.hydrateOverrides({ rowKeys: ["stocks"], rows: [{ rowId: "stocks", values: { 2026: 0 } }] }),
    );
    const rows = [{ key: "cashAndBank" }, { key: "stocks" }];
    const computed = { cashAndBank: 100, stocks: 2000000 };
    const total = slice.effectiveTotal(
      { overrides: slice.selectOverrides(store.getState()), customRows: [] },
      rows,
      (rowKey) => computed[rowKey],
      2026,
    );
    expect(total).toBe(100);
  });

  it("removes a stale override when the server has none for that row", () => {
    const slice = new EditableTableSlice("currentActivesTest3");
    const store = slice.createStore();
    store.dispatch(slice.actions.setOverride({ rowKey: "stocks", columnKey: "2026", value: 5 }));
    store.dispatch(slice.actions.hydrateOverrides({ rowKeys: ["stocks"], rows: [] }));
    expect("stocks:2026" in slice.selectOverrides(store.getState())).toBe(false);
  });
});
