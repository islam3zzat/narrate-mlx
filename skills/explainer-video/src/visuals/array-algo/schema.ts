import {ID, displayCells, text, textCharIssues, z} from '../../sdk/pure';
import {ALGO_STATE_TONES} from '../../sdk/algo-math';

export const ARRAY_ALGO_LIMITS = {
  heading: 60,
  caption: 160,
  label: 48,
  note: 48,
  value: 10,
  subLabel: 12,
  pointerName: 12,
  windowLabel: 28,
  auxLabel: 24,
  auxItem: 24,
  maxItems: 16,
  maxSteps: 12,
  maxPointers: 6,
  maxAuxItems: 8,
  maxAbs: 1e9,
} as const;

export const ArrayAlgoItem = z.strictObject({
  id: ID.describe('Stable element ID across steps so swaps and moves animate smoothly'),
  value: z.union([z.number(), text('Short value shown inside the cell')]),
  state: z.enum(ALGO_STATE_TONES).optional().describe('Semantic highlight state for this element'),
  subLabel: text('Optional short sub-label inside cell mode').optional(),
});

export const ArrayAlgoPointer = z.strictObject({
  name: text('Pointer label (e.g. L, R, i, j, pivot)'),
  index: z.number().int().min(0).describe('0-based index into this step items[]'),
  tone: z.enum(ALGO_STATE_TONES).optional(),
});

export const ArrayAlgoWindow = z.strictObject({
  start: z.number().int().min(0).describe('Inclusive start index'),
  end: z.number().int().min(0).describe('Inclusive end index'),
  label: text('Optional window badge (e.g. sum = 14)').optional(),
  tone: z.enum(ALGO_STATE_TONES).optional(),
});

export const ArrayAlgoAux = z.strictObject({
  label: text('Auxiliary strip title (e.g. Stack, Best, Pivot)'),
  items: z
    .array(
      z.strictObject({
        text: text('Auxiliary state chip'),
        tone: z.enum(ALGO_STATE_TONES).optional(),
      }),
    )
    .min(1)
    .max(ARRAY_ALGO_LIMITS.maxAuxItems),
  note: text('Optional short invariant or complexity note').optional(),
});

export const ArrayAlgoStep = z.strictObject({
  id: ID.optional().describe('Optional step ID for `focus`'),
  label: text('Step label spoken in narration (aligns reveal timing)'),
  items: z.array(ArrayAlgoItem).min(1).max(ARRAY_ALGO_LIMITS.maxItems),
  pointers: z.array(ArrayAlgoPointer).max(ARRAY_ALGO_LIMITS.maxPointers).optional(),
  window: ArrayAlgoWindow.optional(),
  aux: ArrayAlgoAux.optional(),
  note: text('Optional short step annotation').optional(),
});

export const ArrayAlgoVisual = z
  .strictObject({
    type: z.literal('array-algo'),
    heading: text('Scene heading').max(ARRAY_ALGO_LIMITS.heading),
    mode: z.enum(['cells', 'bars']).optional().describe('"cells" (default) for indexed boxes, "bars" for sorting heights'),
    showIndices: z.boolean().optional().describe('Whether to render 0-based index labels below slots (default true)'),
    steps: z.array(ArrayAlgoStep).min(1).max(ARRAY_ALGO_LIMITS.maxSteps),
    caption: text('Optional bottom takeaway caption').max(ARRAY_ALGO_LIMITS.caption).optional(),
  })
  .superRefine((v, ctx) => {
    const addErr = (path: (string | number)[], message: string) =>
      ctx.addIssue({code: z.ZodIssueCode.custom, path, message});

    const checkTxt = (path: (string | number)[], name: string, s: string | undefined, max: number) => {
      if (s === undefined) return;
      if (displayCells(s) > max) addErr(path, `${name} must be <= ${max} display cells`);
      for (const msg of textCharIssues(name, s)) addErr(path, msg);
    };

    checkTxt(['heading'], 'heading', v.heading, ARRAY_ALGO_LIMITS.heading);
    checkTxt(['caption'], 'caption', v.caption, ARRAY_ALGO_LIMITS.caption);

    const stepIds = new Set<string>();
    const isBars = v.mode === 'bars';

    v.steps.forEach((st, si) => {
      if (st.id) {
        if (stepIds.has(st.id)) addErr(['steps', si, 'id'], `duplicate step id "${st.id}"`);
        stepIds.add(st.id);
      }
      checkTxt(['steps', si, 'label'], `steps[${si}].label`, st.label, ARRAY_ALGO_LIMITS.label);
      checkTxt(['steps', si, 'note'], `steps[${si}].note`, st.note, ARRAY_ALGO_LIMITS.note);

      const itemIds = new Set<string>();
      st.items.forEach((it, ii) => {
        if (itemIds.has(it.id)) addErr(['steps', si, 'items', ii, 'id'], `duplicate item id "${it.id}" in step ${si}`);
        itemIds.add(it.id);
        checkTxt(['steps', si, 'items', ii, 'subLabel'], `steps[${si}].items[${ii}].subLabel`, it.subLabel, ARRAY_ALGO_LIMITS.subLabel);

        if (typeof it.value === 'number') {
          if (!Number.isFinite(it.value) || Math.abs(it.value) > ARRAY_ALGO_LIMITS.maxAbs) {
            addErr(['steps', si, 'items', ii, 'value'], 'numeric value must be finite and within bounds');
          } else if (isBars && it.value < 0) {
            addErr(['steps', si, 'items', ii, 'value'], 'bars mode requires numeric values >= 0');
          }
        } else {
          if (isBars) {
            addErr(['steps', si, 'items', ii, 'value'], 'bars mode requires numeric item values');
          }
          checkTxt(['steps', si, 'items', ii, 'value'], `steps[${si}].items[${ii}].value`, it.value, ARRAY_ALGO_LIMITS.value);
        }
      });

      (st.pointers ?? []).forEach((pt, pi) => {
        checkTxt(['steps', si, 'pointers', pi, 'name'], `steps[${si}].pointers[${pi}].name`, pt.name, ARRAY_ALGO_LIMITS.pointerName);
        if (pt.index >= st.items.length) {
          addErr(['steps', si, 'pointers', pi, 'index'], `pointer index ${pt.index} out of range (items length ${st.items.length})`);
        }
      });

      if (st.window) {
        checkTxt(['steps', si, 'window', 'label'], `steps[${si}].window.label`, st.window.label, ARRAY_ALGO_LIMITS.windowLabel);
        if (st.window.start > st.window.end) {
          addErr(['steps', si, 'window'], `window.start (${st.window.start}) must be <= window.end (${st.window.end})`);
        }
        if (st.window.end >= st.items.length) {
          addErr(['steps', si, 'window', 'end'], `window.end ${st.window.end} out of range (items length ${st.items.length})`);
        }
      }

      if (st.aux) {
        checkTxt(['steps', si, 'aux', 'label'], `steps[${si}].aux.label`, st.aux.label, ARRAY_ALGO_LIMITS.auxLabel);
        checkTxt(['steps', si, 'aux', 'note'], `steps[${si}].aux.note`, st.aux.note, ARRAY_ALGO_LIMITS.note);
        st.aux.items.forEach((ax, ai) => {
          checkTxt(['steps', si, 'aux', 'items', ai, 'text'], `steps[${si}].aux.items[${ai}].text`, ax.text, ARRAY_ALGO_LIMITS.auxItem);
        });
      }
    });
  });

export {ArrayAlgoVisual as schema};
export type ArrayAlgoVisualT = z.infer<typeof ArrayAlgoVisual>;
export type ArrayAlgoStepT = z.infer<typeof ArrayAlgoStep>;
export type ArrayAlgoPointerT = z.infer<typeof ArrayAlgoPointer>;
export type ArrayAlgoWindowT = z.infer<typeof ArrayAlgoWindow>;
