import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/** A textarea that grows with its content (no scrollbar, no manual resize). Shift+Enter adds a line. */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function AutoTextarea(props, ref) {
    const inner = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => inner.current!);
    useLayoutEffect(() => {
      const el = inner.current!;
      el.style.height = '0px';
      el.style.height = `${el.scrollHeight}px`;
    }, [props.value]);
    return <textarea ref={inner} rows={1} {...props} />;
  },
);

/** True when the caret is on the first (or last) line, so ↑/↓ should move between items instead of lines. */
export const caretOnFirstLine = (el: HTMLTextAreaElement) => el.value.lastIndexOf('\n', el.selectionStart - 1) === -1;
export const caretOnLastLine = (el: HTMLTextAreaElement) => el.value.indexOf('\n', el.selectionEnd) === -1;
