import { useEffect, useRef, useState } from "react";
import {
  EditorContent,
  useEditor,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { TextSelection } from "@tiptap/pm/state";
import { Fragment } from "@tiptap/pm/model";
import { joinBackward } from "@tiptap/pm/commands";
import {
  AlignRight,
  AlignCenter,
  AlignLeft,
  Bold,
  Italic,
  Underline,
  ImagePlus,
  FileDown,
  MoreHorizontal,
  Check,
  X,
  HelpCircle,
  Undo2,
  Redo2,
  Camera,
  Image as ImageIcon,
  FolderOpen,
  RemoveFormatting,
  ChartNoAxesCombined,
  NotebookPen,
} from "lucide-react";
import { FlowContext, type FlowAPI } from "./editor/FlowContext";
import { mathCaretKey, mathCaretPlugin } from "./editor/MathCaret";
import { useDockHeight } from "./editor/useDockHeight";
import { FinalAnswerToggle } from "./editor/FinalAnswerToggle";
import { AnswerRangeSlider } from "./editor/AnswerRangeSlider";
import {
  createAnswerRangeModel,
  answerRangeTransaction,
  type AnswerRangeModel,
  type ElementInterval,
} from "./editor/answerRange";
import {
  currentAnswerMode,
  finalAnswerTransaction,
  nextAnswerMode,
  type FinalAnswerMode,
} from "./editor/finalAnswer";
import {
  MathExpression,
  FinalAnswer,
  FontSize,
  FlowImage,
} from "./editor/extensions";
import {
  MathGlyph,
  glyphForLatex,
  inlineMathState,
  migrateInlineMath,
} from "./editor/inlineMath";
import { popMathUnit } from "./editor/mixedDeletion";
import { nextLineTransaction } from "./editor/nextLine";
import { compressImage } from "./editor/images";
import { GraphDialog } from "./graph/GraphDialog";
import { ExerciseDialog } from "./exercise/ExerciseDialog";
import { type ExerciseProfile } from "./exercise/ExerciseProfile";
import { calculationAtCursor } from "./calculation/ExpressionContext";
import { type ExactResult } from "./calculation/ExactArithmetic";
import { resultNodes, resultSequence } from "./calculation/ResultNodes";
import {
  editableState,
  emptyMath,
  latex,
  locate,
  uid,
  type MathState,
  type Sequence,
} from "./math/model";
import {
  reduceMath,
  roleOf,
  type MathAction,
} from "./navigation/SmartNextEngine";
import { ModeController, predict } from "./context/KeyboardContextEngine";
import { MathKeyboard } from "./keyboard/MathKeyboard";
import type { Direction } from "./keyboard/GestureController";
import {
  PersistenceService,
  signature,
  type FlowDocument,
} from "./persistence/PersistenceService";
import { HistoryService } from "./persistence/HistoryService";
import { InteractionTelemetry } from "./telemetry/InteractionTelemetry";
import { renderPdfDocument } from "./pdf/PdfRenderer";
import { PdfPreview } from "./pdf/PdfPreview";
import { attachVolumeHistory, FlowNative, isAndroid } from "./android/native";
import {
  Camera as NativeCamera,
  CameraResultType,
  CameraSource,
} from "@capacitor/camera";
import { Keyboard as NativeKeyboard } from "@capacitor/keyboard";
const storage = new PersistenceService();
function newDocument(): FlowDocument {
  return {
    schemaVersion: 1,
    id: uid(),
    title: "מחברת חדשה",
    updatedAt: Date.now(),
    content: { type: "doc", content: [{ type: "paragraph" }] },
  };
}
export default function App() {
  const [initial, setInitial] = useState<FlowDocument | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    storage
      .load()
      .then((d) =>
        setInitial(
          d ? { ...d, content: migrateInlineMath(d.content) } : newDocument(),
        ),
      )
      .catch(() => {
        setError("לא ניתן לגשת לשמירה במכשיר. בדקו הרשאות אחסון.");
        setInitial(newDocument());
      });
  }, []);
  return initial ? (
    <Workspace initial={initial} initialError={error} />
  ) : (
    <div className="loading">
      <img className="logo-mark" src="/app-logo.png" alt="" /> MathFlow
    </div>
  );
}
function Workspace({
  initial,
  initialError,
}: {
  initial: FlowDocument;
  initialError: string;
}) {
  const [title, setTitle] = useState(initial.title),
    [saveStatus, setSaveStatus] = useState(initialError ? "error" : "saved"),
    [revision, setRevision] = useState(0),
    [keyboard, setKeyboard] = useState<"text" | "math">("text"),
    [activeId, setActiveId] = useState<string | null>(null),
    [answerSlider, setAnswerSlider] = useState<{
      model: AnswerRangeModel;
      value: ElementInterval;
      visible: boolean;
    } | null>(null),
    [menu, setMenu] = useState(false),
    [help, setHelp] = useState(false),
    [imageMenu, setImageMenu] = useState(false),
    [graphOpen, setGraphOpen] = useState(false),
    [exerciseOpen, setExerciseOpen] = useState(false),
    [exercise, setExercise] = useState<ExerciseProfile | null>(
      initial.exerciseProfile || null,
    ),
    [toast, setToast] = useState(initialError),
    [pdf, setPdf] = useState<string | null>(null),
    [pdfBusy, setPdfBusy] = useState(false),
    [debug, setDebug] = useState(
      new URLSearchParams(location.search).has("debug"),
    );
  const doc = useRef(initial),
    history = useRef(new HistoryService(initial, signature)),
    sessions = useRef(new Map<string, MathState>()),
    mode = useRef(new ModeController()),
    formulaModes = useRef(new Map<string, ModeController>()),
    telemetry = useRef(new InteractionTelemetry()),
    reason = useRef("typing:text"),
    restoring = useRef(false),
    saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    active = useRef<string | null>(null),
    textReturn = useRef<{ id: string; position: number } | null>(null),
    keyMode = useRef<"text" | "math">("text"),
    iframe = useRef<HTMLIFrameElement>(null),
    files = useRef<HTMLInputElement>(null),
    graphPosition = useRef<number>(0),
    camera = useRef<HTMLInputElement>(null),
    exerciseFocus = useRef<HTMLElement | null>(null),
    editorRef = useRef<Editor | null>(null),
    sliderRef = useRef<typeof answerSlider>(null),
    intent = useRef({
      undo: () => {},
      redo: () => {},
      act: (_a: MathAction) => {},
    });
  function notify(message: string) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  }
  function bump() {
    setRevision((v) => v + 1);
  }
  function closeAnswerSlider() {
    if (!sliderRef.current) return;
    sliderRef.current = null;
    history.current.endGesture();
    setAnswerSlider(null);
  }
  function hideAnswerSlider() {
    const slider = sliderRef.current;
    if (!slider) return;
    history.current.endGesture();
    sliderRef.current = { ...slider, visible: false };
    setAnswerSlider(sliderRef.current);
  }
  function changeAnswerRange(value: ElementInterval | null) {
    const slider = sliderRef.current;
    const ed = editorRef.current;
    if (!slider || !ed) return;
    const result = answerRangeTransaction(ed.state, slider.model, value);
    if (!result) {
      closeAnswerSlider();
      return;
    }
    for (const [id, state] of result.mathStates)
      sessions.current.set(id, state);
    reason.current = "format:answer-range";
    ed.view.dispatch(result.transaction);
    if (value) {
      sliderRef.current = { ...slider, value };
      setAnswerSlider(sliderRef.current);
    }
    const state = currentState();
    if (state) recompute(state);
  }
  async function saveNow() {
    clearTimeout(saveTimer.current);
    const stamp = doc.current.updatedAt;
    try {
      await storage.save(doc.current);
      if (stamp === doc.current.updatedAt) setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
      notify("השמירה נכשלה. ייתכן שאין מספיק מקום במכשיר.");
    }
  }
  function updateDocument(content: JSONContent, why = "edit") {
    doc.current = {
      ...doc.current,
      title: doc.current.title,
      content,
      updatedAt: Date.now(),
    };
    if (!restoring.current) history.current.record(doc.current, why);
    setSaveStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveNow(), 280);
    bump();
  }
  function openExercise() {
    const focused = document.activeElement;
    exerciseFocus.current =
      focused instanceof HTMLElement &&
      focused.matches(".document-body, .native-math-input")
        ? focused
        : null;
    if (focused instanceof HTMLElement) focused.blur();
    if (isAndroid()) void NativeKeyboard.hide().catch(() => {});
    setExerciseOpen(true);
  }
  function closeExercise() {
    setExerciseOpen(false);
    if (keyMode.current === "math" && isAndroid())
      void NativeKeyboard.hide().catch(() => {});
    const previous = exerciseFocus.current;
    exerciseFocus.current = null;
    if (previous?.isConnected)
      requestAnimationFrame(() => previous.focus({ preventScroll: true }));
  }
  function changeExercise(profile: ExerciseProfile | null) {
    doc.current = {
      ...doc.current,
      exerciseProfile: profile,
      updatedAt: Date.now(),
    };
    setExercise(profile);
    history.current.record(doc.current, "exercise");
    history.current.breakGroup();
    telemetry.current.emit(
      "EXERCISE_PROFILE_CHANGE",
      "document",
      mode.current.mode,
      "exercise-dialog",
      {
        topic: profile?.topic || "none",
        symbolCount: profile?.symbols.length || 0,
      },
    );
    setSaveStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveNow(), 280);
    closeExercise();
    bump();
  }
  function toggleExercise() {
    if (!exercise) return;
    const next = { ...exercise, enabled: !exercise.enabled };
    doc.current = {
      ...doc.current,
      exerciseProfile: next,
      updatedAt: Date.now(),
    };
    setExercise(next);
    history.current.record(doc.current, "exercise");
    history.current.breakGroup();
    telemetry.current.emit(
      "EXERCISE_TOGGLE",
      "document",
      mode.current.mode,
      "keyboard",
      {
        enabled: next.enabled,
        topic: next.topic,
      },
    );
    setSaveStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveNow(), 280);
    bump();
  }
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: false,
      }),
      TextAlign.configure({ types: ["paragraph"], defaultAlignment: "start" }),
      Placeholder.configure({ placeholder: "התחילו לכתוב כאן…" }),
      MathExpression,
      MathGlyph,
      FinalAnswer,
      FontSize,
      FlowImage.configure({ allowBase64: false }),
    ],
    content: initial.content,
    editorProps: {
      attributes: {
        class: "document-body",
        dir: "auto",
        "aria-label": "דף כתיבה",
        spellcheck: "false",
      },
      handleKeyDown: (_view, event) => {
        if (
          event.key === "Backspace" &&
          keyMode.current === "text" &&
          editorRef.current?.state.selection.empty &&
          ["mathExpression", "mathGlyph"].includes(
            editorRef.current.state.selection.$from.nodeBefore?.type.name || "",
          )
        ) {
          event.preventDefault();
          deleteBackward();
          return true;
        }
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "z"
        ) {
          event.preventDefault();
          event.shiftKey ? intent.current.redo() : intent.current.undo();
          return true;
        }
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "y"
        ) {
          event.preventDefault();
          intent.current.redo();
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        beforeinput: (_view, event) => {
          if (
            (event as InputEvent).inputType !== "deleteContentBackward" ||
            keyMode.current !== "text" ||
            !editorRef.current?.state.selection.empty ||
            !["mathExpression", "mathGlyph"].includes(
              editorRef.current.state.selection.$from.nodeBefore?.type.name ||
                "",
            )
          )
            return false;
          event.preventDefault();
          deleteBackward();
          return true;
        },
      },
      handlePaste: (_view, event) => {
        const image = Array.from(event.clipboardData?.files || []).find((f) =>
          f.type.startsWith("image/"),
        );
        if (image) {
          void addImage(image);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (reason.current !== "format:answer-range") closeAnswerSlider();
      if (
        keyMode.current === "text" &&
        !reason.current.startsWith("typing:math:")
      )
        textReturn.current = null;
      if (!restoring.current) updateDocument(ed.getJSON(), reason.current);
      reason.current = "typing:text";
    },
    onSelectionUpdate: ({ editor: ed }) => {
      closeAnswerSlider();
      const returning = textReturn.current;
      if (
        keyMode.current === "text" &&
        returning &&
        (ed.state.selection.from !== returning.position ||
          ed.state.selection.to !== returning.position)
      ) {
        textReturn.current = null;
        active.current = null;
        setActiveId(null);
      }
      if (keyMode.current === "math" && !active.current)
        recompute(
          inlineMathState(ed.state.doc, ed.state.selection.from),
          "cursor",
        );
      bump();
    },
    onFocus: () => {
      if (document.activeElement?.closest(".native-math-input")) return;
      textReturn.current = null;
      active.current = null;
      setActiveId(null);
      if (keyMode.current === "math" && isAndroid())
        void NativeKeyboard.hide().catch(() => {});
      history.current.breakGroup();
    },
  });
  editorRef.current = editor;
  const { appRef, dockRef } = useDockHeight(!!editor);
  function positionOf(id: string): number | null {
    let pos: number | null = null;
    editor?.state.doc.descendants((node, p) => {
      if (node.type.name === "mathExpression" && node.attrs.id === id) pos = p;
    });
    return pos;
  }
  function session(id: string, tree: Sequence): MathState {
    let state = sessions.current.get(id);
    if (!state) {
      state = editableState(tree);
      sessions.current.set(id, state);
    }
    return state;
  }
  function currentState() {
    if (!active.current) return null;
    const p = positionOf(active.current);
    if (p === null) return null;
    const node = editor?.state.doc.nodeAt(p);
    if (!node) return null;
    return session(active.current, node.attrs.tree);
  }
  function recompute(s: MathState, source = "cursor") {
    const p = predict(s);
    if (mode.current.predict(p))
      telemetry.current.emit(
        "AUTO_MODE_CHANGE",
        p.semanticKey,
        mode.current.mode,
        source,
      );
    bump();
  }
  function activate(id: string, tree: Sequence) {
    closeAnswerSlider();
    textReturn.current = null;
    if (active.current !== id) {
      mode.current = formulaModes.current.get(id) || new ModeController();
      formulaModes.current.set(id, mode.current);
    }
    active.current = id;
    setActiveId(id);
    keyMode.current = "math";
    setKeyboard("math");
    editor?.commands.blur();
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    if (isAndroid()) void NativeKeyboard.hide().catch(() => {});
    const s = session(id, tree);
    recompute(s);
    history.current.breakGroup();
  }
  function commitMath(id: string, state: MathState, why: string) {
    sessions.current.set(id, state);
    const p = positionOf(id);
    if (p !== null && editor) {
      const n = editor.state.doc.nodeAt(p)!;
      reason.current = why;
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(p, undefined, {
          ...n.attrs,
          tree: state.root,
          latex: latex(state.root),
        }),
      );
    }
    recompute(state);
  }
  function enterInlineMath() {
    if (!editor) return;
    textReturn.current = null;
    active.current = null;
    setActiveId(null);
    keyMode.current = "math";
    setKeyboard("math");
    mode.current = new ModeController();
    editor.commands.blur();
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    if (isAndroid()) void NativeKeyboard.hide().catch(() => {});
    recompute(inlineMathState(editor.state.doc, editor.state.selection.from));
    history.current.breakGroup();
  }
  function deleteBackward() {
    const ed = editorRef.current;
    if (!ed) return;
    const { selection } = ed.state;
    if (!selection.empty) {
      reason.current = "typing:mixed";
      ed.view.dispatch(ed.state.tr.deleteSelection());
      return;
    }
    const from = selection.from;
    const before = selection.$from.nodeBefore;
    if (before?.type.name === "mathExpression") {
      const id = String(before.attrs.id);
      const root = popMathUnit(before.attrs.tree);
      reason.current = "typing:math";
      const tr = ed.state.tr;
      if (root.items.length === 0) {
        sessions.current.delete(id);
        tr.delete(from - before.nodeSize, from);
      } else {
        sessions.current.set(id, editableState(root));
        tr.setNodeMarkup(from - before.nodeSize, undefined, {
          ...before.attrs,
          tree: root,
          latex: latex(root),
        });
      }
      ed.view.dispatch(tr);
      return;
    }
    if (before?.isText) {
      const last = Array.from(before.text || "").at(-1);
      if (last) {
        reason.current = "typing:mixed";
        ed.view.dispatch(ed.state.tr.delete(from - last.length, from));
        return;
      }
    }
    if (before) {
      reason.current = "typing:mixed";
      ed.view.dispatch(ed.state.tr.delete(from - before.nodeSize, from));
    } else if (from > 1) {
      reason.current = "typing:mixed";
      joinBackward(ed.state, ed.view.dispatch, ed.view);
    }
    if (keyMode.current === "math" && !active.current)
      recompute(inlineMathState(ed.state.doc, ed.state.selection.from));
  }
  function promoteInlineBase() {
    if (!editor?.state.selection.empty) return false;
    const from = editor.state.selection.from;
    const before = editor.state.selection.$from.nodeBefore;
    const glyph =
      before?.type.name === "mathGlyph"
        ? String(before.attrs.latex)
        : before?.isText
          ? Array.from(before.text || "").at(-1) || ""
          : "";
    if (
      !glyph ||
      roleOf(glyph) !== "operand" ||
      (before?.isText && !/^[A-Za-z0-9]$/.test(glyph))
    )
      return false;
    const math = reduceMath(emptyMath(), { type: "input", latex: glyph }).state;
    const next = reduceMath(math, { type: "next" }).state;
    const id = uid();
    sessions.current.set(id, next);
    reason.current = "structure";
    editor.view.dispatch(
      editor.state.tr.replaceWith(
        from - (before?.isText ? glyph.length : before!.nodeSize),
        from,
        editor.state.schema.nodes.mathExpression.create({
          id,
          tree: next.root,
          latex: latex(next.root),
          display: false,
        }),
      ),
    );
    activate(id, next.root);
    return true;
  }
  function insertNextLine(id: string | null = null): boolean {
    if (!editor || (!id && !editor.state.selection.empty)) return false;
    const formulaPos = id ? positionOf(id) : null;
    if (id && formulaPos === null) return false;
    const position =
      formulaPos !== null
        ? formulaPos + editor.state.doc.nodeAt(formulaPos)!.nodeSize
        : editor.state.selection.from;
    const tr = nextLineTransaction(editor.state, position);
    if (!tr) return false;
    history.current.breakGroup();
    textReturn.current = null;
    active.current = null;
    setActiveId(null);
    reason.current = "navigation:line";
    editor.view.dispatch(tr);
    history.current.breakGroup();
    recompute(inlineMathState(editor.state.doc, editor.state.selection.from));
    return true;
  }
  function actInline(action: MathAction, source: string) {
    if (!editor) return;
    if (action.type === "closeSquare") {
      actInline({ type: "input", latex: "]" }, source);
      return;
    }
    const context = inlineMathState(
      editor.state.doc,
      editor.state.selection.from,
    );
    const p = predict(context);
    if (action.type === "input") {
      telemetry.current.emit(
        "INPUT",
        p.semanticKey,
        mode.current.mode,
        source,
        { category: action.role || "symbol" },
      );
      reason.current = "typing:math:inline";
      editor.view.dispatch(
        editor.state.tr.replaceSelectionWith(
          editor.state.schema.nodes.mathGlyph.create({
            latex: action.latex,
            glyph: glyphForLatex(action.latex),
          }),
        ),
      );
    } else if (action.type === "backspace") deleteBackward();
    else if (action.type === "reciprocal") {
      const { selection } = editor.state;
      const before = selection.empty ? selection.$from.nodeBefore : null;
      const candidate =
        before?.type.name === "mathGlyph"
          ? String(before.attrs.latex)
          : before?.isText
            ? Array.from(before.text || "").at(-1) || ""
            : "";
      const base =
        candidate &&
        roleOf(candidate) === "operand" &&
        (before?.type.name === "mathGlyph" || /^[A-Za-z0-9]$/.test(candidate))
          ? candidate
          : "";
      const initial = base
        ? reduceMath(emptyMath(), { type: "input", latex: base }).state
        : emptyMath();
      const state = reduceMath(initial, { type: "reciprocal" }).state;
      const id = uid();
      sessions.current.set(id, state);
      reason.current = "structure";
      editor.view.dispatch(
        editor.state.tr.replaceWith(
          selection.from -
            (base ? (before?.isText ? base.length : before!.nodeSize) : 0),
          selection.to,
          editor.state.schema.nodes.mathExpression.create({
            id,
            tree: state.root,
            latex: latex(state.root),
            display: false,
          }),
        ),
      );
      telemetry.current.emit(
        "INPUT",
        p.semanticKey,
        mode.current.mode,
        source,
        { category: "reciprocal" },
      );
      activate(id, state.root);
      return;
    } else if (
      action.type === "next" ||
      (action.type === "structure" && action.kind === "power")
    ) {
      if (action.type === "next")
        telemetry.current.emit(
          "SMART_NEXT",
          p.semanticKey,
          mode.current.mode,
          source,
        );
      if (!promoteInlineBase()) {
        if (action.type === "next") insertNextLine();
        else notify("כתבו תחילה בסיס לחזקה");
      }
      return;
    } else if (action.type === "structure") {
      const state = reduceMath(emptyMath(), action).state;
      const id = uid();
      sessions.current.set(id, state);
      reason.current = "structure";
      editor.view.dispatch(
        editor.state.tr.replaceSelectionWith(
          editor.state.schema.nodes.mathExpression.create({
            id,
            tree: state.root,
            latex: latex(state.root),
            display: false,
          }),
        ),
      );
      telemetry.current.emit(
        "INPUT",
        p.semanticKey,
        mode.current.mode,
        source,
        {
          category: "structure",
        },
      );
      activate(id, state.root);
      return;
    } else if (action.type === "previous") {
      const before = editor.state.selection.$from.nodeBefore;
      if (before) {
        const length = before.isText
          ? Array.from(before.text || "").at(-1)?.length || 1
          : before.nodeSize;
        editor.view.dispatch(
          editor.state.tr.setSelection(
            TextSelection.create(
              editor.state.doc,
              editor.state.selection.from - length,
            ),
          ),
        );
      }
    }
    recompute(inlineMathState(editor.state.doc, editor.state.selection.from));
  }
  function act(action: MathAction, source = "key") {
    closeAnswerSlider();
    const id = active.current,
      s = currentState();
    if (!id || !s) {
      if (keyMode.current === "math") actInline(action, source);
      return;
    }
    const p = predict(s);
    const result = reduceMath(s, action);
    if (action.type === "next")
      telemetry.current.emit(
        "SMART_NEXT",
        p.semanticKey,
        mode.current.mode,
        source,
      );
    if (action.type === "input")
      telemetry.current.emit(
        "INPUT",
        p.semanticKey,
        mode.current.mode,
        source,
        { category: action.role || "symbol" },
      );
    if (
      !result.miss &&
      (action.type === "reciprocal" ||
        action.type === "structure" ||
        action.type === "closeSquare")
    )
      telemetry.current.emit(
        "INPUT",
        p.semanticKey,
        mode.current.mode,
        source,
        { category: action.type },
      );
    if (result.escaped)
      telemetry.current.emit(
        "SEMANTIC_ESCAPE",
        p.semanticKey,
        mode.current.mode,
        source,
      );
    if (action.type === "backspace" && result.miss && editor) {
      const pos = positionOf(id);
      if (pos !== null) {
        active.current = null;
        setActiveId(null);
        editor.view.dispatch(
          editor.state.tr.setSelection(
            TextSelection.create(
              editor.state.doc,
              pos + (s.root.items.length ? 0 : 1),
            ),
          ),
        );
        deleteBackward();
        return;
      }
    }
    if (result.miss) {
      if (action.type === "next" && insertNextLine(id)) return;
      telemetry.current.emit(
        "NAVIGATION_MISS",
        p.semanticKey,
        mode.current.mode,
        source,
      );
      if (action.type === "structure") notify("כתבו קודם בסיס לחזקה");
    }
    commitMath(
      id,
      result.state,
      action.type === "input" || action.type === "backspace"
        ? `typing:math:${id}`
        : action.type === "insertResult"
          ? "calculation"
          : action.type === "structure" || action.type === "reciprocal"
            ? "structure"
            : "navigation",
    );
  }
  function acceptCalculation() {
    if (!editor || keyMode.current !== "math") return;
    const id = active.current;
    const position = id ? positionOf(id) : null;
    const state = id ? currentState() : null;
    const result = calculationAtCursor(
      editor.state.doc,
      editor.state.selection.from,
      state && position !== null ? { position, state } : null,
      editor.state.selection.empty,
    );
    if (!result) return;
    history.current.breakGroup();
    const contextKey = predict(
      state || inlineMathState(editor.state.doc, editor.state.selection.from),
    ).semanticKey;
    telemetry.current.emit(
      "CALC_ACCEPT",
      contextKey,
      mode.current.mode,
      "calculation",
      { fractional: result.denominator !== "1" },
    );
    telemetry.current.emit(
      "INPUT",
      contextKey,
      mode.current.mode,
      "calculation",
      { category: "result" },
    );
    if (id && state) {
      act({ type: "insertResult", nodes: resultNodes(result) }, "calculation");
    } else {
      const { from, to } = editor.state.selection;
      const resultTree =
        result.denominator === "1" ? null : resultSequence(result);
      const nodes =
        resultTree === null
          ? [...result.numerator].map((value) =>
              editor.state.schema.nodes.mathGlyph.create({
                latex: value,
                glyph: glyphForLatex(value),
              }),
            )
          : [
              editor.state.schema.nodes.mathExpression.create({
                id: uid(),
                tree: resultTree,
                latex: latex(resultTree),
                display: false,
              }),
            ];
      const fragment = Fragment.fromArray(nodes);
      const tr = editor.state.tr.replaceWith(from, to, fragment);
      tr.setSelection(TextSelection.create(tr.doc, from + fragment.size));
      reason.current = "calculation";
      editor.view.dispatch(tr);
      recompute(inlineMathState(editor.state.doc, editor.state.selection.from));
    }
    history.current.breakGroup();
  }
  function manualCursor(
    id: string,
    tree: Sequence,
    seqId: string,
    index: number,
    extend = false,
    recordTouch = true,
  ) {
    closeAnswerSlider();
    if (active.current !== id) activate(id, tree);
    const s = session(id, tree);
    const p = predict(s);
    if (recordTouch)
      telemetry.current.emit(
        "MANUAL_CURSOR_TOUCH",
        p.semanticKey,
        mode.current.mode,
        "pointer",
      );
    const result = reduceMath(s, { type: "cursor", seqId, index, extend });
    sessions.current.set(id, result.state);
    recompute(result.state);
    history.current.breakGroup();
  }
  function insertMath(display = false) {
    if (!editor) return;
    textReturn.current = null;
    const state = emptyMath(),
      id = uid();
    sessions.current.set(id, state);
    reason.current = "insert-math";
    editor.commands.insertContent({
      type: "mathExpression",
      attrs: { id, tree: state.root, latex: "", display },
    });
    activate(id, state.root);
  }
  function resumeMath() {
    const returning = textReturn.current;
    const selection = editor?.state.selection;
    if (
      returning &&
      selection?.empty &&
      selection.from === returning.position &&
      active.current === returning.id
    ) {
      const s = currentState();
      if (s) {
        activate(returning.id, s.root);
        return;
      }
    }
    enterInlineMath();
  }
  function returnToText() {
    if (!editor) return;
    editor.view.dom.setAttribute("inputmode", "text");
    keyMode.current = "text";
    setKeyboard("text");
    const id = active.current,
      p = id ? positionOf(id) : null;
    if (p !== null) {
      textReturn.current = { id: id!, position: editor.state.selection.from };
      editor.commands.blur();
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLTextAreaElement>(
            `[data-equation="${id}"] .native-math-input`,
          )
          ?.focus(),
      );
    } else {
      textReturn.current = null;
      editor.view.focus();
    }
    history.current.breakGroup();
    if (isAndroid()) void NativeKeyboard.show().catch(() => {});
  }
  function restore(d: FlowDocument | null) {
    if (!d || !editor) return;
    closeAnswerSlider();
    const wasNativeMath = !!textReturn.current;
    const previousState = currentState();
    textReturn.current = null;
    const previousId = active.current;
    const previousKeyboard = keyMode.current;
    const previousTextPosition = editor.state.selection.from;
    restoring.current = true;
    sessions.current.clear();
    active.current = null;
    setActiveId(null);
    keyMode.current = "text";
    setKeyboard("text");
    doc.current = d;
    setExercise(d.exerciseProfile || null);
    setTitle(d.title);
    editor.commands.setContent(d.content, { emitUpdate: false });
    const restoredPosition = previousId ? positionOf(previousId) : null;
    if (
      (previousKeyboard === "math" || wasNativeMath) &&
      previousId &&
      restoredPosition !== null
    ) {
      const restoredNode = editor.state.doc.nodeAt(restoredPosition)!;
      active.current = previousId;
      setActiveId(previousId);
      keyMode.current = wasNativeMath ? "text" : "math";
      setKeyboard(keyMode.current);
      const state = editableState(restoredNode.attrs.tree);
      if (previousState && locate(state.root, previousState.cursor.seqId))
        state.cursor = previousState.cursor;
      sessions.current.set(previousId, state);
      if (wasNativeMath)
        textReturn.current = {
          id: previousId,
          position: editor.state.selection.from,
        };
    } else {
      editor.commands.setTextSelection(
        Math.max(
          1,
          Math.min(previousTextPosition, editor.state.doc.content.size - 1),
        ),
      );
      if (previousKeyboard === "math") {
        keyMode.current = "math";
        setKeyboard("math");
        recompute(
          inlineMathState(editor.state.doc, editor.state.selection.from),
        );
      }
    }
    restoring.current = false;
    bump();
    void saveNow();
  }
  function undo() {
    restore(history.current.undo());
  }
  function redo() {
    restore(history.current.redo());
  }
  intent.current = { undo, redo, act };
  useEffect(() => {
    let detach: undefined | (() => void),
      cancelled = false;
    void attachVolumeHistory(
      () => intent.current.undo(),
      () => intent.current.redo(),
    )
      .then((fn) => {
        if (cancelled) fn();
        else detach = fn;
      })
      .catch(() => notify("מקשי עוצמת הקול אינם זמינים בגרסה זו"));
    return () => {
      cancelled = true;
      detach?.();
    };
  }, []);
  useEffect(() => {
    function hidden() {
      if (document.visibilityState === "hidden") void storage.save(doc.current);
    }
    window.addEventListener("pagehide", hidden);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", hidden);
      document.removeEventListener("visibilitychange", hidden);
      clearTimeout(saveTimer.current);
      clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    const view = window.visualViewport;
    function resize() {
      const inset = view
        ? Math.max(0, window.innerHeight - view.height - view.offsetTop)
        : 0;
      document.documentElement.style.setProperty(
        "--native-inset",
        `${inset}px`,
      );
    }
    view?.addEventListener("resize", resize);
    view?.addEventListener("scroll", resize);
    resize();
    return () => {
      view?.removeEventListener("resize", resize);
      view?.removeEventListener("scroll", resize);
    };
  }, []);
  useEffect(() => {
    function keydown(e: KeyboardEvent) {
      if (pdf || help || imageMenu || graphOpen || exerciseOpen) return;
      // Search, title and native IME fields own their typing and history keys.
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.stopPropagation();
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        e.stopPropagation();
        redo();
        return;
      }
      if (
        keyMode.current === "math" &&
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey
      ) {
        const motion: Record<string, MathAction> = {
          KeyH: { type: "previous" },
          KeyJ: { type: "down" },
          KeyK: { type: "up" },
          KeyL: { type: "next" },
        };
        if (motion[e.code]) {
          e.preventDefault();
          act(motion[e.code], "physical-motion");
          return;
        }
      }
      if (keyMode.current !== "math" || e.ctrlKey || e.metaKey || e.altKey)
        return;
      const map: Record<string, MathAction> = {
        Tab: { type: e.shiftKey ? "previous" : "next" },
        Enter: { type: "next" },
        ArrowRight: { type: "next" },
        ArrowLeft: { type: "previous" },
        ArrowUp: { type: "up" },
        ArrowDown: { type: "down" },
        Backspace: { type: "backspace" },
        "^": { type: "structure", kind: "power" },
        "/": { type: "structure", kind: "fraction" },
        "(": { type: "structure", kind: "group" },
        ")": { type: "up" },
      };
      if (e.key === "Escape") {
        e.preventDefault();
        returnToText();
        return;
      }
      if (map[e.key]) {
        e.preventDefault();
        act(map[e.key], "physical-key");
      } else if (/^[a-zA-Z0-9+\-.,=<>]$/.test(e.key)) {
        e.preventDefault();
        act({ type: "input", latex: e.key }, "physical-key");
      }
    }
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  });
  useEffect(() => {
    if (keyboard === "math")
      requestAnimationFrame(() =>
        document
          .querySelector(".active-math")
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      );
  }, [keyboard, activeId]);
  useEffect(() => {
    if (editor)
      editor.view.dom.setAttribute(
        "inputmode",
        keyboard === "math" ? "none" : "text",
      );
  }, [editor, keyboard]);
  useEffect(() => {
    if (!editor || keyboard !== "math" || activeId) return;
    editor.registerPlugin(mathCaretPlugin());
    return () => {
      editor.unregisterPlugin(mathCaretKey);
    };
  }, [editor, keyboard, activeId]);
  async function insertImageAsset(blob: Blob, alt: string, position?: number) {
    const ed = editorRef.current;
    if (!ed) throw new Error("המסמך אינו זמין כרגע.");
    const id = uid();
    await storage.asset(id, blob);
    reason.current = position === undefined ? "image" : "graph";
    const image = {
      type: "image",
      attrs: {
        assetId: id,
        width: position === undefined ? 70 : 100,
        align: "center",
        alt,
      },
    };
    const chain = ed.chain().focus();
    const done = (
      position === undefined
        ? chain.insertContent(image)
        : chain.insertContentAt(
            Math.min(position, ed.state.doc.content.size),
            image,
          )
    ).run();
    if (!done) throw new Error("לא ניתן להוסיף את התמונה במיקום הזה.");
  }
  async function addImage(file: Blob) {
    try {
      await insertImageAsset(await compressImage(file), "תמונה מצורפת");
      setImageMenu(false);
      notify("התמונה נוספה");
    } catch (e) {
      notify(e instanceof Error ? e.message : "לא ניתן להוסיף את התמונה");
    }
  }
  function openGraph() {
    const mathPos =
      active.current && keyMode.current === "math"
        ? positionOf(active.current)
        : null;
    graphPosition.current =
      mathPos === null ? (editor?.state.selection.to ?? 0) : mathPos + 1;
    setImageMenu(false);
    setGraphOpen(true);
  }
  async function pickImage(source: "camera" | "gallery" | "files") {
    setImageMenu(false);
    if (source === "files") {
      files.current?.click();
      return;
    }
    if (!isAndroid()) {
      (source === "camera" ? camera : files).current?.click();
      return;
    }
    try {
      const result = await NativeCamera.getPhoto({
        quality: 85,
        width: 1600,
        height: 1600,
        resultType: CameraResultType.Uri,
        source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
      });
      if (result.webPath)
        await addImage(await (await fetch(result.webPath)).blob());
    } catch (e) {
      if (!String(e).toLowerCase().includes("cancel"))
        notify("לא ניתן לפתוח תמונה. בדקו הרשאות מצלמה ותמונות.");
    }
  }
  async function previewPdf() {
    setPdfBusy(true);
    try {
      await saveNow();
      const result = await renderPdfDocument(doc.current, storage);
      setPdf(result);
    } catch (e) {
      notify(e instanceof Error ? e.message : "יצירת התצוגה נכשלה");
    } finally {
      setPdfBusy(false);
    }
  }
  async function printPdf() {
    if (!pdf) return;
    try {
      if (isAndroid())
        await FlowNative.print({ html: pdf, title: doc.current.title });
      else {
        const w = iframe.current?.contentWindow;
        if (w) {
          await w.document.fonts.ready;
          await Promise.all(
            Array.from(w.document.images).map((img) =>
              img.decode().catch(() => {}),
            ),
          );
          w.focus();
          w.print();
        }
      }
    } catch {
      notify("ההדפסה נכשלה. נסו שוב דרך תצוגת PDF.");
    }
  }
  function toggleDisplay() {
    const id = active.current,
      p = id ? positionOf(id) : null;
    if (p === null) {
      insertMath(true);
      return;
    }
    if (!editor) return;
    const n = editor.state.doc.nodeAt(p)!;
    reason.current = "format";
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(p, undefined, {
        ...n.attrs,
        display: !n.attrs.display,
      }),
    );
  }
  const structureState = currentState(),
    s =
      structureState ||
      (editor
        ? inlineMathState(editor.state.doc, editor.state.selection.from)
        : null),
    mathSelected =
      !!activeId &&
      !!structureState?.selection &&
      structureState.selection.to > structureState.selection.from,
    textSelected =
      keyboard === "text" &&
      editor &&
      !editor.state.selection.empty &&
      !editor.isActive("image");
  const answerPosition = active.current ? positionOf(active.current) : null;
  const answerContext =
    structureState && answerPosition !== null
      ? { state: structureState, position: answerPosition }
      : null;
  const answerMode = answerSlider
    ? "element"
    : editor
      ? currentAnswerMode(editor.state, answerContext)
      : "off";
  function applyFinalAnswer(next?: FinalAnswerMode) {
    if (!editor) return;
    if (sliderRef.current && (!next || next === "off")) {
      history.current.breakGroup();
      changeAnswerRange(null);
      closeAnswerSlider();
      return;
    }
    const id = active.current,
      state = id ? currentState() : null;
    const position = id ? positionOf(id) : null;
    const context = state && position !== null ? { state, position } : null;
    const targetMode =
      next ?? nextAnswerMode(currentAnswerMode(editor.state, context));
    const result = finalAnswerTransaction(editor.state, targetMode, context);
    if (!result) return;
    if (id && result.mathState) sessions.current.set(id, result.mathState);
    history.current.breakGroup();
    reason.current = "format:final-answer";
    editor.view.dispatch(result.transaction);
    if (result.mathState) recompute(result.mathState);
    history.current.breakGroup();
    if (targetMode === "element") {
      const model = createAnswerRangeModel(
        editor.state,
        result.mathState && position !== null
          ? { state: result.mathState, position }
          : null,
      );
      if (model) {
        sliderRef.current = { model, value: model.initial, visible: true };
        setAnswerSlider(sliderRef.current);
      }
    }
  }
  function finalBox() {
    applyFinalAnswer();
  }
  function clearFormat() {
    if (keyboard === "math" || mathSelected || sliderRef.current)
      applyFinalAnswer("off");
    else {
      reason.current = "format";
      editor?.chain().focus().unsetAllMarks().run();
    }
  }
  function format(fn: () => void) {
    reason.current = "format";
    fn();
    bump();
  }
  function gesture(d: Direction) {
    const st = s;
    if (st)
      telemetry.current.emit(
        "SWIPE",
        predict(st).semanticKey,
        mode.current.mode,
        "gesture",
        { direction: d },
      );
    if (d === "right") setMode("LOGIC_SET", "swipe");
    if (d === "left") setMode("MATH", "swipe");
  }
  function setMode(target: "MATH" | "LOGIC_SET", source: string) {
    if (!s) return;
    if (mode.current.mode === target) return;
    const p = predict(s);
    mode.current.manual(target, p.semanticKey);
    telemetry.current.emit(
      "MANUAL_MODE_CHANGE",
      p.semanticKey,
      mode.current.mode,
      source,
    );
    bump();
  }
  function keyboardBack() {
    if (!s) return;
    const p = predict(s);
    if (mode.current.back(p.semanticKey))
      telemetry.current.emit(
        "KEYBOARD_BACK",
        p.semanticKey,
        mode.current.mode,
        "button",
      );
    bump();
  }
  const api: FlowAPI = {
    activeId,
    keyboard,
    session,
    activate,
    act,
    manualCursor,
    storage,
    revision,
  };
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "read_mathflow_document",
            title: "Read MathFlow document",
            description:
              "Read the current document as structured JSON with explicit LaTeX. Does not change it.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: (input: unknown) => {
              if (
                !input ||
                typeof input !== "object" ||
                Object.keys(input).length
              )
                throw new Error("Expected an empty object");
              return structuredClone(doc.current);
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, []);
  if (!editor) return null;
  const activePos = activeId ? positionOf(activeId) : null;
  const activeNode =
    activePos !== null ? editor.state.doc.nodeAt(activePos) : null;
  const calculation: ExactResult | null =
    keyboard === "math"
      ? calculationAtCursor(
          editor.state.doc,
          editor.state.selection.from,
          structureState && activePos !== null
            ? { position: activePos, state: structureState }
            : null,
          editor.state.selection.empty,
        )
      : null;
  return (
    <FlowContext.Provider value={api}>
      <div
        ref={appRef}
        className={`app ${keyboard === "math" ? "math-open" : ""}`}
      >
        <header className="app-header">
          <div className="brand" aria-label="MathFlow">
            <img className="logo-mark" src="/app-logo.png" alt="" />
            <span>
              Math<span className="brand-light">Flow</span>
            </span>
          </div>
          <div className="header-actions">
            <span className={`save-state ${saveStatus}`} role="status">
              {saveStatus === "saved" ? <Check size={14} /> : null}
              <span className="save-label">
                {saveStatus === "saved"
                  ? "נשמר במכשיר"
                  : saveStatus === "saving"
                    ? "שומר…"
                    : "לא נשמר"}
              </span>
              <span className="save-compact">
                {saveStatus === "saved"
                  ? "נשמר"
                  : saveStatus === "saving"
                    ? "שומר…"
                    : "לא נשמר"}
              </span>
            </span>
            <button
              className="pdf-button"
              onClick={() => void previewPdf()}
              disabled={pdfBusy}
            >
              <FileDown size={17} />
              <span>{pdfBusy ? "מכין…" : "PDF"}</span>
            </button>
            <div className="menu-anchor">
              <button
                className="icon-button"
                aria-label="אפשרויות"
                onClick={() => setMenu(!menu)}
              >
                <MoreHorizontal size={22} />
              </button>
              {menu && (
                <div className="dropdown">
                  <button
                    disabled={!history.current.canUndo}
                    onClick={() => {
                      undo();
                      setMenu(false);
                    }}
                  >
                    <Undo2 size={16} /> ביטול
                  </button>
                  <button
                    disabled={!history.current.canRedo}
                    onClick={() => {
                      redo();
                      setMenu(false);
                    }}
                  >
                    <Redo2 size={16} /> שחזור
                  </button>
                  <button
                    onClick={() => {
                      setHelp(true);
                      setMenu(false);
                    }}
                  >
                    <HelpCircle size={16} /> איך כותבים כאן
                  </button>
                  <button
                    onClick={() => {
                      openExercise();
                      setMenu(false);
                    }}
                  >
                    <NotebookPen size={16} />{" "}
                    {exercise ? "עריכת תרגיל" : "הוספת תרגיל"}
                  </button>
                  <button
                    onClick={() => {
                      setDebug(!debug);
                      setMenu(false);
                    }}
                  >
                    מדדי שימוש מקומיים
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div
          className="format-bar"
          role="toolbar"
          aria-label="עיצוב טקסט"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) e.preventDefault();
          }}
        >
          <div className="format-tools">
            <select
              aria-label="גודל טקסט"
              value={editor.getAttributes("fontSize").size || "18"}
              onChange={(e) =>
                format(() =>
                  editor
                    .chain()
                    .focus()
                    .setMark("fontSize", { size: e.target.value })
                    .run(),
                )
              }
            >
              {[14, 16, 18, 20, 24, 28, 32].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="toolbar-rule" />
            {[
              [
                Bold,
                "מודגש",
                "bold",
                () => editor.chain().focus().toggleBold().run(),
              ],
              [
                Italic,
                "נטוי",
                "italic",
                () => editor.chain().focus().toggleItalic().run(),
              ],
              [
                Underline,
                "קו תחתון",
                "underline",
                () => editor.chain().focus().toggleUnderline().run(),
              ],
            ].map(([Icon, label, mark, fn]) => {
              const I = Icon as typeof Bold;
              return (
                <button
                  key={String(mark)}
                  aria-label={String(label)}
                  aria-pressed={editor.isActive(String(mark))}
                  className={editor.isActive(String(mark)) ? "active" : ""}
                  onClick={() => format(fn as () => void)}
                >
                  <I size={18} />
                </button>
              );
            })}
            <span className="toolbar-rule" />
            {[
              [AlignRight, "ימין", "right"],
              [AlignCenter, "מרכז", "center"],
              [AlignLeft, "שמאל", "left"],
            ].map(([Icon, label, value]) => {
              const I = Icon as typeof AlignRight;
              return (
                <button
                  key={String(value)}
                  aria-label={`יישור ${label}`}
                  className={
                    editor.isActive({ textAlign: value }) ? "active" : ""
                  }
                  onClick={() =>
                    format(() =>
                      editor.chain().focus().setTextAlign(String(value)).run(),
                    )
                  }
                >
                  <I size={18} />
                </button>
              );
            })}
            <span className="toolbar-rule" />
            <button aria-label="הוספת תמונה" onClick={() => setImageMenu(true)}>
              <ImagePlus size={19} />
            </button>
          </div>
        </div>
        <main className="workspace">
          <div className="paper-topline">
            <span>
              <NotebookPen size={14} /> המסמך שלי
            </span>
            <span>
              A4 <span className="tiny-square" />
            </span>
          </div>
          <article className="paper">
            <div className="paper-heading">
              <input
                className="document-title"
                aria-label="שם המסמך"
                dir="auto"
                value={title}
                placeholder="שם המסמך"
                onChange={(e) => {
                  setTitle(e.target.value);
                  doc.current = {
                    ...doc.current,
                    title: e.target.value,
                    updatedAt: Date.now(),
                  };
                  history.current.record(doc.current, "typing:title");
                  setSaveStatus("saving");
                  clearTimeout(saveTimer.current);
                  saveTimer.current = setTimeout(() => void saveNow(), 280);
                }}
              />
              <div className="paper-rule" />
            </div>
            <EditorContent editor={editor} />
            <div className="paper-bottom">
              MathFlow <span>01</span>
            </div>
          </article>
          <p className="workspace-tip">
            <button onClick={() => setHelp(true)}>
              <HelpCircle size={14} /> מדריך כתיבה
            </button>
          </p>
        </main>
        {answerSlider?.visible && editor && (
          <AnswerRangeSlider
            editor={editor}
            model={answerSlider.model}
            value={answerSlider.value}
            revision={revision}
            onChange={changeAnswerRange}
            onBegin={() => history.current.beginGesture("format:answer-range")}
            onEnd={() => history.current.endGesture()}
            onClose={hideAnswerSlider}
          />
        )}
        {(textSelected || mathSelected) && (
          <div
            className="selection-actions"
            onPointerDown={(e) => e.preventDefault()}
          >
            <FinalAnswerToggle mode={answerMode} onClick={finalBox} />
            <button onClick={clearFormat}>
              <RemoveFormatting size={16} /> הסרת עיצוב
            </button>
          </div>
        )}
        <div ref={dockRef} className="input-dock">
          {keyboard === "math" && s ? (
            <MathKeyboard
              state={s}
              mode={mode.current.mode}
              display={!!activeNode?.attrs.display}
              answerMode={answerMode}
              backAvailable={!!mode.current.previous}
              act={act}
              gesture={gesture}
              onText={returnToText}
              onBack={keyboardBack}
              onDisplay={toggleDisplay}
              onBox={finalBox}
              onClose={returnToText}
              exercise={exercise}
              onExerciseEdit={openExercise}
              onExerciseToggle={toggleExercise}
              calculation={calculation}
              onCalculation={acceptCalculation}
              onUndo={undo}
              undoAvailable={history.current.canUndo}
              onRedo={redo}
              redoAvailable={history.current.canRedo}
            />
          ) : (
            <div className="text-dock">
              <button
                className={`exercise-text-button${exercise?.enabled ? " selected" : ""}`}
                onPointerDown={(e) => e.preventDefault()}
                onClick={openExercise}
              >
                <NotebookPen size={16} /> {exercise ? "עריכת תרגיל" : "תרגיל"}
              </button>
              <span className="text-mode-label">
                Aa <small>כתיבה חופשית</small>
              </span>
              <div
                className="history-controls"
                role="group"
                aria-label="היסטוריית עריכה"
              >
                <button
                  className="history-action"
                  data-testid="text-undo"
                  aria-label="בטל פעולה"
                  title="בטל פעולה"
                  disabled={!history.current.canUndo}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={undo}
                >
                  <Undo2 size={20} />
                </button>
                <button
                  className="history-action"
                  data-testid="text-redo"
                  aria-label="בצע שוב"
                  title="בצע שוב"
                  disabled={!history.current.canRedo}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={redo}
                >
                  <Redo2 size={20} />
                </button>
              </div>
              <button
                className="math-toggle"
                data-testid="math-toggle"
                onPointerDown={(e) => e.preventDefault()}
                onClick={resumeMath}
              >
                ∑ <span>Math</span>
              </button>
            </div>
          )}
        </div>
        {debug && (
          <aside className="debug-panel">
            <button className="quiet" onClick={() => setDebug(false)}>
              סגירה ×
            </button>
            <strong>מדדים · במכשיר בלבד</strong>
            {Object.entries(telemetry.current.counters).map(([k, v]) => (
              <div key={k}>
                <code>{k}</code>
                <b>{v}</b>
              </div>
            ))}
            <details>
              <summary>אירועים אחרונים</summary>
              <pre>
                {JSON.stringify(telemetry.current.events.slice(-5), null, 2)}
              </pre>
            </details>
          </aside>
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
        <input
          ref={files}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp,image/heic"
          onChange={(e) => {
            if (e.target.files?.[0]) void addImage(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={camera}
          type="file"
          hidden
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            if (e.target.files?.[0]) void addImage(e.target.files[0]);
            e.target.value = "";
          }}
        />
        {imageMenu && (
          <div className="modal-backdrop" onClick={() => setImageMenu(false)}>
            <section
              className="small-modal"
              role="dialog"
              aria-modal="true"
              aria-label="הוספת תמונה"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="modal-close icon-button"
                aria-label="סגירה"
                onClick={() => setImageMenu(false)}
              >
                <X size={20} />
              </button>
              <h2>הוספת תמונה</h2>
              <p>צילום של השאלה, תרשים או הערה.</p>
              <div className="image-choices">
                <button onClick={() => void pickImage("camera")}>
                  <Camera />
                  מצלמה
                </button>
                <button onClick={() => void pickImage("gallery")}>
                  <ImageIcon />
                  גלריה
                </button>
                <button onClick={() => void pickImage("files")}>
                  <FolderOpen />
                  קבצים
                </button>
              </div>
              <button className="image-graph-choice" onClick={openGraph}>
                <ChartNoAxesCombined size={25} />
                <span>
                  גרף מפונקציה
                  <small>הקלידו פונקציה והוסיפו את הגרף כתמונה</small>
                </span>
              </button>
            </section>
          </div>
        )}
        {exerciseOpen && (
          <ExerciseDialog
            profile={exercise}
            onSave={changeExercise}
            onClose={closeExercise}
          />
        )}
        {graphOpen && (
          <GraphDialog
            onClose={() => setGraphOpen(false)}
            onInsert={async (blob, alt) => {
              await insertImageAsset(blob, alt, graphPosition.current);
              notify("הגרף נוסף למסמך");
            }}
          />
        )}
        {help && (
          <div className="modal-backdrop" onClick={() => setHelp(false)}>
            <section
              className="small-modal help-modal"
              role="dialog"
              aria-modal="true"
              aria-label="איך כותבים כאן"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="modal-close icon-button"
                aria-label="סגירה"
                onClick={() => setHelp(false)}
              >
                <X size={20} />
              </button>
              <span className="help-kicker">WRITE FORWARD</span>
              <h2>כותבים. וממשיכים.</h2>
              <p>
                הקלידו טקסט בדף ועברו ל־<b>∑ Math</b> בכל מקום, גם באמצע מילה.
                אותיות וסימנים משתי המקלדות נכתבים ברצף אחד סביב אותו סמן.
                <b>ABC</b> מחזיר למקלדת המערכת בלי להזיז את הסמן.
              </p>
              <ol>
                <li>
                  <b>NEXT</b> מוביל למקום הבא: מונה ← מכנה ← החוצה.
                </li>
                <li>
                  <b>שתי ההצעות הירוקות בשורה העליונה</b> מתאימות את עצמן למה
                  שכתבתם; שאר המקשים נשארים במקומם.
                </li>
                <li>
                  <b>תרגיל</b> מאפשר להדביק נוסח שאלה. סימנים שזוהו מקבלים
                  עדיפות בשתי ההצעות בלבד. המתג בתחתית המקלדת מכבה ומחזיר את
                  ההתאמה בנגיעה, והעיפרון מאפשר לערוך את הנוסח.
                </li>
                <li>
                  אחרי x: <b>מעריך ← אינדקס ← החוצה.</b>
                  <br />
                  לחיצה נוספת מדלגת על שדה ריק.
                </li>
                <li>
                  החליקו על המקלדת למעבר מצב:{" "}
                  <b>→ לוגיקה · ← מתמטיקה · ↑ סימנים.</b> החלקה למטה על שטח
                  המקלדת אינה עושה דבר; למעבר לטקסט לחצו <b>ABC</b>.
                </li>
                <li>
                  הסימנים הקטנים בפינות המקשים הם קיצורים:{" "}
                  <b>משכו למטה או למעלה</b> לפי הפינה. המקש מתרומם, והסימן הנבחר
                  גדל מעליו. חזרה לנקודת ההתחלה מבטלת; גם מעבר לצד השני אינו
                  מפעיל פעולה נוספת. במקלדת פיזית: <b>Alt+H/J/K/L</b> לתנועה
                  מבנית.
                </li>
                <li>
                  המבנה <b>xⁿ</b>, שבר או שורש נפתח במקום הסמן. בתוך מבנה,
                  <b>NEXT</b> מנהל את המעבר בין השדות.
                </li>
                <li>
                  <b>תשובה סופית</b> עוברת בין שלושה מצבים: כבוי, מסגרת לכל שורת
                  הכתיבה, ומסגרת לאלמנט ליד הסמן או לבחירה הקיימת. שורה מסתיימת
                  ב־Enter; גלישת טקסט במסך צר אינה משנה את המסגרת.
                </li>
              </ol>
              <p className="help-note">
                בתוך שבר NEXT משלים את השבר. לחזקה בתוך מונה או מכנה השתמשו
                ב־xⁿ.
              </p>
              <button className="primary-button" onClick={() => setHelp(false)}>
                אפשר להתחיל
              </button>
            </section>
          </div>
        )}
        {pdf && (
          <PdfPreview
            html={pdf}
            frameRef={iframe}
            onClose={() => setPdf(null)}
            onPrint={() => void printPdf()}
          />
        )}
      </div>
    </FlowContext.Provider>
  );
}
