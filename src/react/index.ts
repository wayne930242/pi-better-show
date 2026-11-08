/**
 * Thin React wrappers over the `pbs-*` elements. Each component is a function of the block's data: it sets the
 * element's `data`, `answered`, and `ref` properties and turns `pbs-answer` into `onAnswer`. React is a peer
 * dependency; nothing here renders markup of its own, so the elements' look, parts, and tokens apply unchanged.
 *
 * Importing this module defines the elements. It is safe to import during server rendering: the elements module
 * defines nothing without a DOM, and the wrappers render empty tags that the client fills when it hydrates.
 */
import { createElement, type ReactElement, type Ref, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type {
  AlertData,
  Answer,
  BlockDataMap,
  BlockSegment,
  CardsData,
  ChecklistData,
  DiffData,
  FormData,
  MermaidData,
  MindmapData,
  OptionsData,
  ReviewData,
  StatsData,
  StepsData,
  SuggestData,
  TableData,
  TreeData,
} from "../core/types.ts";
import type { AnsweredFields, BlockRef, Density, PbsElement, Scheme, TAGS } from "../elements/index.ts";
import "../elements/index.ts";

export interface PbsProps<D> {
  /** The block's parsed data. A new object with equal content does not redraw the element or reset what the user typed. */
  data: D;
  /** The submitted fields, once the answer is delivered: locks the element and shows them. */
  answered?: AnsweredFields | undefined;
  /** Called with the answer the user submitted. Return `false` to refuse it: the element then stays open. */
  onAnswer?: (answer: Answer, event: CustomEvent<Answer>) => boolean | undefined;
  /** The block's address, copied into the answer's `ref`. */
  blockRef?: BlockRef | undefined;
  density?: Density;
  scheme?: Scheme;
  lang?: string;
  className?: string;
  id?: string;
  /** The element itself, for `refresh()` and the like. */
  ref?: Ref<PbsElement<D>>;
}

interface BlockComponentProps<D> extends PbsProps<D> {
  tag: string;
}

function BlockComponent<D>({
  tag,
  data,
  answered,
  onAnswer,
  blockRef,
  density,
  scheme,
  lang,
  className,
  id,
  ref,
}: BlockComponentProps<D>): ReactElement {
  const element = useRef<PbsElement<D> | null>(null);
  const handler = useRef(onAnswer);
  handler.current = onAnswer;

  // Content, not identity, decides a redraw: an inline `data={{...}}` must not wipe the user's typing on every parent render.
  const dataKey = JSON.stringify(data);
  const answeredKey = answered === undefined ? undefined : JSON.stringify(answered);
  useLayoutEffect(() => {
    if (element.current) element.current.data = JSON.parse(dataKey) as D;
  }, [dataKey]);
  useLayoutEffect(() => {
    const target = element.current;
    if (target) target.answered = answeredKey === undefined ? undefined : (JSON.parse(answeredKey) as AnsweredFields);
  }, [answeredKey]);
  const doc = blockRef?.doc;
  const block = blockRef?.block;
  useLayoutEffect(() => {
    if (element.current)
      element.current.ref = block === undefined ? undefined : doc === undefined ? { block } : { doc, block };
  }, [doc, block]);

  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const listener = (event: Event) => {
      const answer = event as CustomEvent<Answer>;
      if (handler.current?.(answer.detail, answer) === false) answer.preventDefault();
    };
    target.addEventListener("pbs-answer", listener);
    return () => target.removeEventListener("pbs-answer", listener);
  }, []);

  const setRef = useCallback(
    (node: PbsElement<D> | null) => {
      element.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as { current: PbsElement<D> | null }).current = node;
    },
    [ref],
  );
  return createElement(tag, { ref: setRef, className, id, density, scheme, lang });
}

const component =
  <D>(tag: string) =>
  (props: PbsProps<D>): ReactElement =>
    createElement(BlockComponent<D>, { ...props, tag });

export const PbsCallout = component<AlertData>("pbs-callout");
export const PbsCards = component<CardsData>("pbs-cards");
export const PbsOptions = component<OptionsData>("pbs-options");
export const PbsForm = component<FormData>("pbs-form");
export const PbsReview = component<ReviewData>("pbs-review");
export const PbsMindmap = component<MindmapData>("pbs-mindmap");
export const PbsSuggest = component<SuggestData>("pbs-suggest");
export const PbsChecklist = component<ChecklistData>("pbs-checklist");
export const PbsTable = component<TableData>("pbs-table");
export const PbsSteps = component<StepsData>("pbs-steps");
export const PbsStats = component<StatsData>("pbs-stats");
export const PbsDiff = component<DiffData>("pbs-diff");
export const PbsDiagram = component<MermaidData>("pbs-diagram");
export const PbsTree = component<TreeData>("pbs-tree");

const BY_KIND: { [K in keyof typeof TAGS]: (props: PbsProps<BlockDataMap[K]>) => ReactElement } = {
  alert: PbsCallout,
  cards: PbsCards,
  options: PbsOptions,
  form: PbsForm,
  review: PbsReview,
  mindmap: PbsMindmap,
  suggest: PbsSuggest,
  checklist: PbsChecklist,
  table: PbsTable,
  steps: PbsSteps,
  stats: PbsStats,
  diff: PbsDiff,
  mermaid: PbsDiagram,
  tree: PbsTree,
};

export interface PbsBlockProps extends Omit<PbsProps<never>, "data" | "blockRef" | "ref"> {
  /** A block segment from core's `parse`. */
  segment: BlockSegment;
  /** The document the segment came from; with the segment's `index` it addresses the block in every answer. */
  doc?: string;
}

/** Draws any parsed block with the element for its kind: `<PbsBlock segment={segment} onAnswer={send} />`. */
export function PbsBlock({ segment, doc, ...rest }: PbsBlockProps): ReactElement {
  const Component = BY_KIND[segment.kind] as (props: PbsProps<unknown>) => ReactElement;
  const blockRef: BlockRef = doc === undefined ? { block: segment.index } : { doc, block: segment.index };
  return createElement(Component, { ...rest, data: segment.data, blockRef });
}
