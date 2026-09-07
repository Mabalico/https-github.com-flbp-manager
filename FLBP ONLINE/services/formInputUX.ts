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
  // Keyboard focus can be followed immediately by a keypress. Selecting in a
  // later animation frame created a race where "5" occasionally became "05".
  // Mouse focus is still protected by the mouse-up handler below.
  selectWholeValue(input);
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
