import { forwardRef, type InputHTMLAttributes } from 'react';
import type { AttrDef, AttrValue } from '../model/types';

type Props = Omit<InputHTMLAttributes<HTMLInputElement & HTMLSelectElement>, 'value' | 'onChange'> & {
  def: AttrDef;
  value: AttrValue | undefined;
  onValue: (value: string) => void;
};

/**
 * The editor for one attribute value: a dropdown for 'select' attributes, otherwise a text box
 * (numeric keyboard for numbers). A value that is no longer in the dropdown's list is kept and
 * shown as "(not in list)" so it is never silently lost.
 */
export const AttrValueInput = forwardRef<HTMLInputElement | HTMLSelectElement, Props>(function AttrValueInput(
  { def, value, onValue, className, ...rest },
  ref,
) {
  const v = value === undefined ? '' : String(value);
  if (def.type === 'select') {
    const options = def.options ?? [];
    const stray = v !== '' && !options.includes(v);
    return (
      <select
        ref={ref as React.Ref<HTMLSelectElement>}
        className={`${className ?? ''}${stray ? ' stray' : ''}${v === '' ? ' unset' : ''}`}
        value={v}
        onChange={(e) => onValue(e.target.value)}
        {...rest}
      >
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        {stray && <option value={v}>{v} (not in list)</option>}
      </select>
    );
  }
  return (
    <input
      ref={ref as React.Ref<HTMLInputElement>}
      className={className}
      value={v}
      inputMode={def.type === 'number' ? 'decimal' : undefined}
      onChange={(e) => onValue(e.target.value)}
      {...rest}
    />
  );
});
