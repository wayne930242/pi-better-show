import type { Cell, ColumnType, TableData } from "../core/types.ts";
import { define, PbsElement } from "./base.ts";
import { h, plain, uid } from "./dom.ts";

const tableCss = `
.table { padding: 0; overflow: hidden; }
.table .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; padding: var(--_pad-s) var(--_pad); }
.table .bar input { max-width: 20rem; flex: 1 1 10rem; }
.table .scroll { overflow: auto; max-width: 100%; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { padding: var(--_pad-s) 0.8rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--_line); }
tbody tr:last-child td { border-bottom: 0; }
thead th { background: var(--_surface); font-weight: 650; white-space: nowrap; }
[data-align="right"] { text-align: right; }
[data-align="center"] { text-align: center; }
tbody tr:hover td { background: color-mix(in srgb, var(--_accent) 5%, var(--_bg)); }
th .sort { all: unset; display: inline-flex; align-items: baseline; gap: 0.35em; cursor: pointer; font: inherit; color: inherit; border-radius: 4px; }
th .sort:focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; }
th .arrow { color: var(--_muted); font-size: 0.75em; }
th[aria-sort="ascending"] .arrow, th[aria-sort="descending"] .arrow { color: var(--_accent); }
td.empty { text-align: center; color: var(--_muted); }
`;

type Direction = "asc" | "desc";
interface State {
  sort: { column: number; direction: Direction } | undefined;
  filter: string;
}

/** Number-like text ("1,204", "+4%", "$3") as a number, NaN when it is not one. */
const numberOf = (cell: Cell): number => {
  if (typeof cell === "number") return cell;
  const cleaned = String(cell).replace(/[,\s%$€£¥]/g, "");
  return cleaned === "" ? Number.NaN : Number(cleaned);
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Orders two non-empty cells by the column's type; text that does not parse as the type is compared as text. */
function compare(a: Cell, b: Cell, type: ColumnType): number {
  if (type === "number") {
    const [x, y] = [numberOf(a), numberOf(b)];
    if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  } else if (type === "date") {
    const [x, y] = [Date.parse(String(a)), Date.parse(String(b))];
    if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  }
  return collator.compare(String(a), String(b));
}

const empty = (cell: Cell): boolean => cell === null || cell === "";

/** The rows that match the filter, in the author's order or sorted (empty cells last, whichever the direction; ties keep their order). */
export function visibleRows(data: TableData, state: State): Cell[][] {
  const needle = state.filter.trim().toLowerCase();
  const rows = needle
    ? data.rows.filter((row) => row.some((cell) => plain(cell).toLowerCase().includes(needle)))
    : [...data.rows];
  const sort = state.sort;
  if (!sort) return rows;
  const type = (data.columns[sort.column] as { type: ColumnType }).type;
  const sign = sort.direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const [x, y] = [a.row[sort.column] ?? null, b.row[sort.column] ?? null];
      if (empty(x) || empty(y)) return Number(empty(x)) - Number(empty(y)) || a.index - b.index;
      return sign * compare(x, y, type) || a.index - b.index;
    })
    .map(({ row }) => row);
}

/** A table that sorts by a clicked column (ascending, descending, then the author's order) and filters by a text box, locally. */
export class PbsTable extends PbsElement<TableData> {
  static override css = tableCss;
  #state: State | undefined;

  protected override reset(): void {
    this.#state = undefined;
  }

  protected view(data: TableData): Node {
    this.#state ??= { sort: data.sort ? { ...data.sort } : undefined, filter: "" };
    const state = this.#state;
    const count = h("span", { part: "count", class: "status", role: "status", "aria-live": "polite" });
    const body = h("tbody", { part: "body" });
    const heads = data.columns.map((column, index) => {
      const arrow = h("span", { class: "arrow", "aria-hidden": "true" });
      const button = h(
        "button",
        { type: "button", part: "sort", class: "sort", "aria-label": this.t("sortBy", { label: column.label }) },
        column.label,
        arrow,
      );
      const head = h("th", { part: "head", scope: "col", "data-align": column.align }, button);
      button.addEventListener("click", () => {
        const now = state.sort?.column === index ? state.sort.direction : undefined;
        state.sort =
          now === undefined
            ? { column: index, direction: "asc" }
            : now === "asc"
              ? { column: index, direction: "desc" }
              : undefined;
        update();
        button.focus();
      });
      return { head, arrow };
    });

    const update = () => {
      heads.forEach(({ head, arrow }, index) => {
        const direction = state.sort?.column === index ? state.sort.direction : undefined;
        head.setAttribute(
          "aria-sort",
          direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none",
        );
        arrow.textContent = direction === "asc" ? "▲" : direction === "desc" ? "▼" : "↕";
      });
      const rows = visibleRows(data, state);
      body.replaceChildren(
        ...(rows.length === 0
          ? [h("tr", null, h("td", { part: "empty", class: "empty", colspan: data.columns.length }, this.t("noRows")))]
          : rows.map((row) =>
              h(
                "tr",
                { part: "row" },
                data.columns.map((column, index) =>
                  h("td", { part: "cell", "data-align": column.align }, this.cellText(row[index] ?? null)),
                ),
              ),
            )),
      );
      count.textContent = this.t("rowCount", { n: rows.length, total: data.rows.length });
    };

    let filter: HTMLElement | undefined;
    if (data.filter) {
      const box = h("input", {
        type: "search",
        part: "filter",
        id: uid("pbs-filter"),
        "aria-label": this.t("filter"),
        placeholder: this.t("filter"),
        value: state.filter,
      });
      box.addEventListener("input", () => {
        state.filter = box.value;
        update();
      });
      filter = box;
    }
    update();
    const bar = (filter || data.rows.length > 0) && h("div", { part: "bar", class: "bar" }, filter, count);
    return h(
      "section",
      { part: "table", class: "panel table" },
      bar,
      h(
        "div",
        { part: "scroll", class: "scroll", tabindex: "0", role: "region", "aria-label": this.t("table") },
        h(
          "table",
          null,
          h(
            "thead",
            { part: "header" },
            h(
              "tr",
              null,
              heads.map(({ head }) => head),
            ),
          ),
          body,
        ),
      ),
    );
  }

  private cellText(cell: Cell): string {
    return typeof cell === "boolean" ? this.t(cell ? "yes" : "no") : plain(cell);
  }
}

export function defineTable(): void {
  define("pbs-table", PbsTable);
}
