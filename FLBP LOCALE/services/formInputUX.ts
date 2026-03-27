import type React from 'react';

const isZeroLikeValue = (value: string): boolean => /^0+$/.test((value || '').trim());

const selectWholeValue = (input: HTMLInputElement | HTMLTextAreaElement) => {
  const length = input.value.length;
  if (!length) return;
  try {
    input.setSelectionRange(0, length);
  } catch {
    try {
      input.select();
    } catch {
      // no-op
    }
  }
};

export const handleZeroValueFocus = (
  event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
): void => {
  const input = event.currentTarget;
  if (!isZeroLikeValue(input.value)) return;
  input.dataset.zeroOverwriteReady = 'true';
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => selectWholeValue(input));
    return;
  }
  setTimeout(() => selectWholeValue(input), 0);
};

export const handleZeroValueMouseUp = (
  event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>
): void => {
  const input = event.currentTarget;
  if (input.dataset.zeroOverwriteReady !== 'true') return;
  if (!isZeroLikeValue(input.value)) return;
  event.preventDefault();
  selectWholeValue(input);
};

export const handleZeroValueBlur = (
  event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
): void => {
  delete event.currentTarget.dataset.zeroOverwriteReady;
};
