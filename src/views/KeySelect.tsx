import { useRef, useState } from 'react';

/**
 * A dropdown made for the keyboard (used beside the node you're editing). Unlike the browser's
 * <select>, it never opens a native menu that swallows keys, so Esc / ← / → always behave.
 *   ↑ / ↓ change the value · type a letter to jump · Space opens the list · Backspace clears
 *   In the open list: ↑ / ↓ move, Enter / Space pick, Esc closes the list only.
 */
export function KeySelect({ value, options, onChange, label }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  label: string;
}) {
  const stray = value !== '' && !options.includes(value);
  const all = ['', ...options, ...(stray ? [value] : [])];
  const index = Math.max(0, all.indexOf(value));
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(index);
  const typed = useRef({ text: '', at: 0 });

  const show = (o: string) => (o === '' ? '—' : o === value && stray ? `${o} (not in list)` : o);
  const openList = () => { setHi(index); setOpen(true); };
  const pick = (o: string) => { onChange(o); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key;
    if (open) {
      // The list owns these keys; nothing leaks to the row (Esc closes only the list).
      if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Escape'].includes(k)) e.stopPropagation(); // Tab still moves to the next field
      if (k === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(all.length - 1, h + 1)); }
      else if (k === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); pick(all[hi]); }
      else if (k === 'Escape') { e.preventDefault(); setOpen(false); }
      else if (k === 'Tab') setOpen(false);
      return;
    }
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      onChange(all[(index + (k === 'ArrowDown' ? 1 : -1) + all.length) % all.length]);
    } else if (k === ' ' || (k === 'ArrowDown' && e.altKey)) {
      e.preventDefault();
      e.stopPropagation();
      openList();
    } else if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault();
      e.stopPropagation();
      onChange('');
    } else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Type-ahead: "d" → Done, "wi" → WIP.
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      const text = (now - typed.current.at < 700 ? typed.current.text : '') + k.toLowerCase();
      typed.current = { text, at: now };
      const match = options.find((o) => o.toLowerCase().startsWith(text)) ?? options.find((o) => o.toLowerCase().startsWith(k.toLowerCase()));
      if (match) onChange(match);
    }
  };

  return (
    <span className="ks">
      <button
        type="button"
        data-field
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        className={`ks-btn${value === '' ? ' unset' : ''}${stray ? ' stray' : ''}`}
        onKeyDown={onKeyDown}
        onClick={() => (open ? setOpen(false) : openList())}
        onBlur={() => setOpen(false)}
      >
        <span>{show(value)}</span>
        <span className="ks-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <ul className="ks-list" role="listbox" aria-label={label}>
          {all.map((o, i) => (
            <li
              key={o || '__none'}
              role="option"
              aria-selected={o === value}
              className={`${i === hi ? 'hi' : ''}${o === value ? ' cur' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setHi(i)}
            >
              {show(o)}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
