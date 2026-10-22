# Architecture

## Document

Tiptap JSON is the continuous text document. Paragraphs are the only visible writing surface. Ordinary math keys insert `mathGlyph` inline atoms *one symbol at a time* at the same ProseMirror selection used by native text; each stores explicit LaTeX and a visible Unicode glyph. A caret can sit between glyphs and ordinary letters, and Backspace removes the immediately preceding unit regardless of keyboard. The glyph renders in the paragraph font without a separate math block or bidi isolate. On load, old flat math expressions migrate to glyphs in memory; the next autosave persists the new representation. Structured math is still an inline `mathExpression` node with `{id, latex, tree, display}`. Images reference asset IDs; blobs live in a separate IndexedDB store. Marks include bold, italic, underline, font size and final answer.

## Math editing

`math/model.ts` defines sequences and stable-ID nodes: token, fraction, root, parenthesized/square/absolute group, script and box. Cursor is `{seqId,index}`. `SmartNextEngine` is a pure reducer; it owns navigation and semantic escape. Script cycle stores the script node ID and stage, retaining the same base. Structural parents take priority over starting a script. Explicit power opens a cycle even inside a fraction. The reciprocal action consumes the previous operand as a denominator (or opens an empty denominator) beneath a numerator `1`; square brackets are structural groups. Empty scripts serialize to nothing, and inactive empty script slots are absent from rendered math. Required fraction slots remain visible only during editing.

Each transition recomputes context. Manual cursor movement invalidates stale navigation state and reconstructs the relevant script ownership. The visible NEXT subtitle describes the next action. When the pure reducer reaches a document-level dead end, the editor splits the paragraph after the active formula (or at the inline caret) as one undoable transaction; math mode stays available on the new line. A pure preview function changes NEXT's hint and icon to an Enter symbol at that boundary. Arrow keys/gesture actions use the same reducer. Renderer decorations are transient `htmlData`/`htmlClass` commands generated only for MathLive; they never enter saved LaTeX or PDF.

`MathKeyboard` has an invariant core and a contextual suggestion row. `GestureController` treats movement beyond 18px as a gesture and keyboard direction beyond 38px. Keyboard-wide right/left swipes select LOGIC_SET/MATH, up opens the palette, and down has no keyboard-wide action. A key with a down alternate owns the gesture only after an observed downward phase; from there it can commit down or a matching left/right alternate at 28px lateral travel. Direct upward movement still opens the palette, even over a key with alternates. Returning from a chosen side toward the center previews cancellation; crossing 28px into an available opposite side changes the selected alternate. Retreating upward latches cancellation until release and cannot become a keyboard-wide swipe. Diagonal starts do not select side alternates.

ABC keeps the live caret when editing flat glyphs. Math resumes at that same caret, including in the middle of a word. Selecting NEXT or an explicit structure promotes the preceding glyph/ASCII base to a structured math node with an anchored script cycle. Within an active fraction/root/script, ABC focuses a small native IME input proxy attached to the formula view. It sends committed characters as explicit LaTeX tokens to the same structural cursor and routes Backspace to the reducer. Math resumes the same AST/cursor; touching outside the formula returns to the ordinary text editor. The proxy waits for IME composition to finish before committing text. One grapheme per token makes deletion consistent. The document node remains an atom internally for structures, but no block decoration or ellipsis is shown.

`keyboard/flickVariants.ts` maps at most three alternate slots per key: down is a close variation, left is logic/sets, and right is computational/algebraic. Tap is the fourth possible action; empty slots remain empty. Blue and green color the alternate glyphs themselves at rest. The chosen alternate animates into a neutral raised bubble with its category glyph color; `prefers-reduced-motion` disables motion. The fraction key has down `\\div`, left `\\in`, right `\\bmod`; other mappings preserve one-step structural actions like reciprocal and square brackets. Committed variants enter telemetry as INPUT with source `flick`, `flick:down-left` or `flick:down-right`. Whole-keyboard swipes start only if no key owns the gesture.

Inline `mathGlyph` typography is derived from its authoritative LaTeX by `typesetGlyph`. Relations render with one nonbreaking space on either side, selected binary operations use thin spacing, and quantifiers get trailing thin spacing. These characters stay inside the single atom, so cursor movement, deletion and undo stay one action. The editor and PDF renderer call the same function; structured expressions retain MathLive/KaTeX spacing. Unary minus stays tight. Math surfaces use smaller padding so inline fractions align more naturally with text.

`keyboard/symbols.ts` is the categorized palette catalog. Opening it swaps the keyboard grid and suggestion rows for a scrollable palette in the same dock, without covering the document. The selected key inserts its explicit LaTeX command or invokes an existing structure action for root/absolute value. Search matches symbol, Hebrew name and English aliases; recent command values are kept in a small localStorage list, separate from the document model. `keyboard/shortcuts.ts` stores six explicit, stable positions with useful defaults; using a shortcut is one tap and source-tagged in INPUT telemetry. Palette pin-edit mode changes shortcuts without inserting a symbol, and sequence mode allows multiple insertions without reopening the palette. Only one of those modes is active at a time. Neither document LaTeX nor undo history contains palette preferences. Search shrinks the dock to fit the native IME. Palette buttons prevent pointer focus loss before their click. Catalog rendering is checked against both MathLive and KaTeX. Logic classification matches complete LaTeX commands so `\\int`, `\\inf` and `\\infty` do not trigger set mode.

`KeyboardContextEngine` predicts MATH/LOGIC_SET using syntax, not AI. A stable semantic key identifies a logical context. The mode controller stores the previous mode and rejected transition; ordinary navigation/typing does not immediately erase the override.

The catalog remains useful for mathematical tokens inside a fraction or script even when the system IME handles ordinary letters around formulas. Its category tabs scroll on one line; Latin is last and also reachable by holding x.

`keyboard/AdaptiveSuggestions.ts` derives a phase from the live AST and cursor (structural owner first, then last semantic atom). Two highlighted slots rank a small phase-specific set; four anchor slots stay fixed within MATH, LOGIC_SET or script mode. The six explicit shortcuts and the five-column core do not move. Pinned symbols are removed from the two ranked slots. Local choice counts can reorder those two slots only after repeated committed selections; an isolated tap does not reshuffle them. Counts are bounded, validated on read and keyed by phase/symbol, never by document text or LaTeX sequence. Manual cursor changes recompute the same pure function. This is conservative local adaptation, not a probability model or claim of measured speed gain.

## History and storage

Every edit updates the document synchronously. `HistoryService` groups ordinary typing within 650ms; structural actions create semantic boundaries. Document history is global (text/math/images). No debounce queue lies between an edit and undo. Selection/cursor movements are not document history. Empty script creation changes transient structure without adding a phantom visible undo step.

Autosave uses a separate 280ms timer and a serialized Promise queue so older disk writes cannot finish after newer saves. Visibility changes trigger a save. Storage errors are shown. Schema version 1 and repository-style boundaries allow future migration, but this release has no cloud service or conflict resolution.

## PDF

`PdfRenderer` walks document JSON, escapes text and sanitizes basic style values, uses the stored LaTeX for structured expressions through KaTeX, renders flat glyphs in the paragraph font from the stored LaTeX token mapping, embeds compressed image data and uses independent 210×297mm CSS. Adjacent `finalAnswer` marked text/glyph/structured nodes form one border in print. Editor state is never cloned. Preview applies screen-only scale; print restores scale 1. Browser print uses the iframe after fonts and images are ready. Android uses an isolated WebView + PrintManager adapter with local assets. Huge formulas are not line-broken. Actual OS-generated pagination still needs device QA.

## Function graphs

`src/graph/expression.ts` is a small recursive-descent parser for a deliberately bounded real-valued language. It accepts arithmetic, implicit multiplication, powers, parentheses, a fixed allowlist of math functions and `x`; it never calls `eval`, `Function`, property lookup or a remote service. `plot.ts` samples adaptively, detects non-finite values and breaks segments around undefined domains. It computes an automatic `y` view from trimmed finite samples or validates a user range. `renderGraph.ts` draws a deterministic 1600×1100 PNG with axes, grid, labels and clipped segments. `GraphDialog` owns preview and range controls; insertion goes through the existing image asset path, so graph files use the same IndexedDB, undo/redo, resize, alignment, PDF and deletion behavior as uploaded images. The document stores the graph as an image with an alt description containing the source function and ranges; the editable expression is not silently reconstructed from pixels.

## Exact arithmetic suggestions

`src/calculation/ExpressionContext.ts` reads only text and math tokens before the live caret in the current paragraph, including the root prefix of an active structural expression. It does not use rendered HTML. `ExactArithmetic.ts` parses a bounded numeric language into normalized BigInt rational values; ambiguous variables, incomplete structures and oversized answers produce no suggestion. Once `=` completes a supported expression, one of the two dynamic suggestion positions shows the answer. Acceptance inserts digit glyphs or a fraction AST in one semantic history action. The answer remains explicit LaTeX in the model and flows through the existing PDF renderer. No calculation is performed remotely.

## Native

Capacitor assets are bundled locally. `MainActivity.dispatchKeyEvent` consumes volume down/up only when the window has focus and the bridge plugin is active. Both key down and key up/repeats are consumed; the initial press dispatches one history action. Outside foreground, ordinary Android behavior resumes. `MathFlowNativePlugin` implements volume event forwarding and a separate print WebView. Java compilation and device integration remain unverified in this environment.

## Telemetry

`InteractionTelemetry` records ordered IDs, timestamps, input source, mode, context and transition references, not math/text content. Events: AUTO_MODE_CHANGE, MANUAL_MODE_CHANGE, KEYBOARD_BACK, SMART_NEXT, SWIPE, SEMANTIC_ESCAPE, INPUT, MANUAL_CURSOR_TOUCH. Counters include manualCursorTouches, smartNextUses, swipes, flicks, keyboardBacks, modeChanges, semanticEscapes and navigationMisses. Navigation alone is not an acceptance/rejection label. Input confirms the current mode; an intervening back without input can remain exploration. This is an attribution foundation, not an ML model or production analytics pipeline.

## Source map

- `src/editor`: Tiptap schema, math/image node views, compression
- `src/math`: typed AST, serializer and MathLive display adapter
- `src/navigation`: structural reducer and anchored script cycle
- `src/context`: context/prediction/override controller
- `src/keyboard`: fixed keyboard and pointer gesture controller
- `src/persistence`: IndexedDB and synchronous snapshot history
- `src/pdf`: independent A4 renderer and preview
- `src/graph`: safe function parser, adaptive sampler, raster renderer and graph dialog
- `src/calculation`: exact bounded rational parser, mixed document prefix reader and semantic result nodes
- `src/telemetry`: ordered events and attribution
- `src/android` + `android/`: Capacitor integration and native project
- `tests`: deterministic engine, service, persistence and graph tests; responsive browser harness

The app composition/controller remains in `App.tsx`; independent stateful services are split by responsibility. MathLive is intentionally a renderer, not the owner of navigation. `mathlive/ssr` avoids importing its editable custom-element bundle.
