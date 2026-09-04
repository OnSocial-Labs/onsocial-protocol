'use client';

import {
  useEffect,
  useRef,
  type FocusEvent,
  type FocusEventHandler,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  profileBioHtmlToMarkdown,
  profileBioMarkdownToHtml,
} from '@onsocial/sdk';

export type OsRichTextTool = 'bold' | 'italic' | 'list' | 'heading';

const DEFAULT_TOOLS: readonly OsRichTextTool[] = [
  'bold',
  'italic',
  'list',
  'heading',
];

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else ref.current = node;
    }
  };
}

function htmlToMarkdown(html: string): string {
  if (typeof document === 'undefined') return '';
  const root = document.createElement('div');
  root.innerHTML = html;
  return profileBioHtmlToMarkdown(root);
}

function markdownToEditorHtml(markdown: string): string {
  const hasContent =
    markdown.replace(/\s/g, '').length > 0 || markdown.includes('\n');
  return hasContent ? profileBioMarkdownToHtml(markdown) : '';
}

/**
 * TipTap (ProseMirror) rich text field. Stores profile-bio markdown
 * (`**bold**`, `*italic*`, `# heading`, `• list`). Same props API as before.
 */
export function OsRichTextField({
  value,
  onChange,
  onFocus,
  onBlur,
  id,
  placeholder,
  maxLength,
  editorRef,
  tools = DEFAULT_TOOLS,
  /**
   * Mount B / I / list / heading chrome into another node (e.g. sheet header
   * toolbar) so formatting stays reachable while the body scrolls.
   * `undefined` = inline chrome; `null` = waiting for host; element = portal.
   */
  chromePortal,
  rows = 1,
  className,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  id?: string;
  placeholder?: string;
  maxLength?: number;
  editorRef?: Ref<HTMLDivElement>;
  tools?: readonly OsRichTextTool[];
  chromePortal?: HTMLElement | null;
  rows?: number;
  className?: string;
  disabled?: boolean;
}) {
  const lastEmittedRef = useRef(value);
  const shellRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onFocusRef = useRef(onFocus);
  const onBlurRef = useRef(onBlur);
  const maxLengthRef = useRef(maxLength);
  onChangeRef.current = onChange;
  onFocusRef.current = onFocus;
  onBlurRef.current = onBlur;
  maxLengthRef.current = maxLength;

  const showBold = tools.includes('bold');
  const showItalic = tools.includes('italic');
  const showList = tools.includes('list');
  const showHeading = tools.includes('heading');
  const showChrome = showBold || showItalic || showList || showHeading;

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: showHeading ? { levels: [3] } : false,
        bulletList: showList ? undefined : false,
        orderedList: false,
        listItem: showList ? undefined : false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        // Marks stay on for paste / shortcuts even when the toolbar is hidden
        // (face bio is plain field + marks, no chrome).
        bold: undefined,
        italic: undefined,
      }),
    ],
    content: markdownToEditorHtml(value),
    editorProps: {
      attributes: {
        id: id ?? '',
        class: 'account-editor-bio account-editor-bio--wysiwyg',
        role: 'textbox',
        'aria-multiline': 'true',
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        style: `min-height: calc(0.84rem * 1.45 * ${Math.max(1, rows)})`,
      },
      transformPastedHTML: (html) =>
        html
          .replace(/^(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+/i, '')
          .replace(/(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/i, '')
          .replace(
            /(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*){2,}/gi,
            '<p><br></p>'
          ),
      handleDOMEvents: {
        focus: (_view, event) => {
          onFocusRef.current?.(event as unknown as FocusEvent<HTMLDivElement>);
          return false;
        },
        blur: (_view, event) => {
          onBlurRef.current?.(event as unknown as FocusEvent<HTMLDivElement>);
          return false;
        },
      },
    },
    onUpdate: ({ editor: current }) => {
      let md = htmlToMarkdown(current.getHTML());
      const limit = maxLengthRef.current;
      if (limit != null && md.length > limit) {
        // Undo is unreliable (IME / history) — hard truncate and resync.
        md = md.slice(0, limit);
        current.commands.setContent(markdownToEditorHtml(md), {
          emitUpdate: false,
        });
      }
      lastEmittedRef.current = md;
      onChangeRef.current(md);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // External value only (parent reset / spill) — never fight the live doc.
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    editor.commands.setContent(markdownToEditorHtml(value), {
      emitUpdate: false,
    });
  }, [editor, value]);

  useEffect(() => {
    if (!editor || !editorRef) return;
    const dom = editor.view.dom as HTMLDivElement;
    mergeRefs(editorRef)(dom);
    return () => mergeRefs(editorRef)(null);
  }, [editor, editorRef]);

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: Boolean(current?.isActive('bold')),
      italic: Boolean(current?.isActive('italic')),
      list: Boolean(current?.isActive('bulletList')),
      heading: Boolean(current?.isActive('heading', { level: 3 })),
    }),
  });

  const runTool = (action: () => void) => {
    if (!editor || disabled) return;
    action();
    editor.view.focus();
  };

  const chrome = showChrome ? (
    <div
      className={`account-editor-bio-chrome${
        chromePortal ? ' account-editor-bio-chrome--portal' : ''
      }`}
    >
      {showBold ? (
        <button
          type="button"
          className={`account-editor-bio-tool account-editor-bio-bold${active?.bold ? ' is-active' : ''}`}
          aria-label="Bold"
          aria-pressed={Boolean(active?.bold)}
          disabled={disabled || !editor}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            runTool(() => editor!.chain().focus().toggleBold().run())
          }
        >
          B
        </button>
      ) : null}
      {showItalic ? (
        <button
          type="button"
          className={`account-editor-bio-tool account-editor-bio-italic${active?.italic ? ' is-active' : ''}`}
          aria-label="Italic"
          aria-pressed={Boolean(active?.italic)}
          disabled={disabled || !editor}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            runTool(() => editor!.chain().focus().toggleItalic().run())
          }
        >
          <em>I</em>
        </button>
      ) : null}
      {showList ? (
        <button
          type="button"
          className={`account-editor-bio-tool account-editor-bio-list${active?.list ? ' is-active' : ''}`}
          aria-label="List"
          aria-pressed={Boolean(active?.list)}
          disabled={disabled || !editor}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            runTool(() => editor!.chain().focus().toggleBulletList().run())
          }
        >
          •
        </button>
      ) : null}
      {showHeading ? (
        <button
          type="button"
          className={`account-editor-bio-tool${active?.heading ? ' is-active' : ''}`}
          aria-label="Heading"
          aria-pressed={Boolean(active?.heading)}
          disabled={disabled || !editor}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            runTool(() =>
              editor!.chain().focus().toggleHeading({ level: 3 }).run()
            )
          }
        >
          H
        </button>
      ) : null}
    </div>
  ) : null;

  // `undefined` = inline chrome; `null` = waiting for portal host; element = portal.
  const usePortalChrome = chromePortal !== undefined;
  const portalHost = chromePortal ?? null;

  return (
    <div
      ref={shellRef}
      className={
        className
          ? `account-editor-bio-shell ${className}`
          : 'account-editor-bio-shell'
      }
      data-chrome={showChrome && !usePortalChrome ? 'true' : 'false'}
    >
      {chrome
        ? usePortalChrome
          ? portalHost
            ? createPortal(chrome, portalHost)
            : null
          : chrome
        : null}
      <EditorContent editor={editor} />
    </div>
  );
}
