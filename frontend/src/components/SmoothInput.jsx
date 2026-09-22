import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

// A drop-in replacement for `<input className="field-input">` with a caret
// that glides smoothly between characters instead of snapping — the native
// caret is hidden (caretColor: transparent) and this renders its own,
// tracked via a hidden measuring span so it lines up with the real text.
const SPRING = { stiffness: 500, damping: 30, mass: 0.5 };

const PASSWORD_CHAR = typeof navigator !== 'undefined' && navigator.userAgent.match(/firefox|fxios/i)
  ? '●'
  : '•';

export default function SmoothInput({ className = '', style, value, defaultValue, onChange, onBlur, type = 'text', ...props }) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const caretX = useMotionValue(0);
  const caretOpacity = useMotionValue(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const measureRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  const isControlled = value !== undefined;
  const inputValue = isControlled ? String(value) : internalValue;

  const springCaretX = useSpring(
    caretX,
    prefersReducedMotion ? { stiffness: 10000, damping: 100, mass: 0.1 } : SPRING,
  );

  function syncMeasureSpan() {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return;

    const styles = window.getComputedStyle(input);
    const isPassword = input.type === 'password';

    let fontSize = styles.fontSize;
    if (PASSWORD_CHAR === '•' && isPassword && !navigator.userAgent.match(/chrome|chromium|crios/i)) {
      fontSize = `${parseFloat(fontSize) + 6.25}px`;
    }

    measureSpan.style.font = `${styles.fontStyle} ${styles.fontWeight} ${fontSize} ${styles.fontFamily}`;
    measureSpan.style.letterSpacing = styles.letterSpacing;
    measureSpan.style.fontFeatureSettings = styles.fontFeatureSettings;
    measureSpan.style.fontVariationSettings = styles.fontVariationSettings;
  }

  function measurePrefixWidth(text) {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return null;

    syncMeasureSpan();
    measureSpan.textContent = text;

    const paddingLeft = parseFloat(window.getComputedStyle(input).paddingLeft) || 0;

    return text.length > 0 ? measureSpan.offsetWidth + paddingLeft : paddingLeft - 1;
  }

  function scrollCaretIntoView(target, absoluteWidth) {
    const styles = window.getComputedStyle(target);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const maxScroll = Math.max(0, target.scrollWidth - target.clientWidth);
    const visibleRight = target.scrollLeft + target.clientWidth - paddingRight;
    const visibleLeft = target.scrollLeft + paddingLeft;

    if (absoluteWidth > visibleRight) {
      target.scrollLeft = Math.min(absoluteWidth - target.clientWidth + paddingRight, maxScroll);
      return;
    }

    if (absoluteWidth < visibleLeft) {
      target.scrollLeft = Math.max(0, absoluteWidth - paddingLeft);
    }
  }

  function getCaretIndex(target) {
    const selectionStart = target.selectionStart ?? 0;
    const selectionEnd = target.selectionEnd ?? 0;

    if (selectionStart === selectionEnd) return selectionStart;

    return target.selectionDirection === 'backward' ? selectionStart : selectionEnd;
  }

  function updateCaretFromInput(target) {
    const selectionStart = target.selectionStart ?? 0;
    const selectionEnd = target.selectionEnd ?? 0;
    const hasSelection = selectionStart !== selectionEnd;
    const caretIndex = getCaretIndex(target);
    const isPassword = target.type === 'password';
    const textBeforeCaret = isPassword ? PASSWORD_CHAR.repeat(caretIndex) : target.value.slice(0, caretIndex);

    const absoluteWidth = measurePrefixWidth(textBeforeCaret);
    if (absoluteWidth === null) return;

    scrollCaretIntoView(target, absoluteWidth);

    const styles = window.getComputedStyle(target);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const caretPosition = absoluteWidth - target.scrollLeft;
    const minX = paddingLeft - 1;
    const maxX = target.clientWidth - paddingRight;
    const isCaretVisible = caretPosition >= minX && caretPosition <= maxX + 1;

    caretX.set(Math.min(caretPosition, maxX));

    if (!isCaretVisible || hasSelection) {
      caretOpacity.set(0);
      return;
    }

    caretOpacity.set(1);
  }

  const updateCaretRef = useRef(updateCaretFromInput);
  updateCaretRef.current = updateCaretFromInput;
  const caretOpacityRef = useRef(caretOpacity);
  caretOpacityRef.current = caretOpacity;

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) updateCaretRef.current(input);
  }, [inputValue]);

  useEffect(() => {
    const input = inputRef.current;
    const container = containerRef.current;
    if (!input || !container) return;

    const updateCaretIfFocused = () => {
      if (document.activeElement === input) updateCaretRef.current(input);
    };

    const handleSelectionChange = () => {
      if (document.activeElement !== input) return;
      requestAnimationFrame(() => {
        if (document.activeElement === input) updateCaretRef.current(input);
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    document.fonts.addEventListener('loadingdone', updateCaretIfFocused);
    void document.fonts.ready.then(updateCaretIfFocused);
    input.addEventListener('scroll', updateCaretIfFocused);

    const resizeObserver = new ResizeObserver(updateCaretIfFocused);
    resizeObserver.observe(container);

    updateCaretIfFocused();

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.fonts.removeEventListener('loadingdone', updateCaretIfFocused);
      input.removeEventListener('scroll', updateCaretIfFocused);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative grid w-full grid-cols-1"
      style={{ caretColor: 'transparent' }}
    >
      <input
        {...props}
        ref={inputRef}
        type={type}
        className={`field-input col-start-1 col-end-2 row-start-1 row-end-2 ${className}`}
        style={style}
        value={inputValue}
        onChange={(e) => {
          if (!isControlled) setInternalValue(e.target.value);
          onChange?.(e);
          requestAnimationFrame(() => updateCaretRef.current(e.target));
        }}
        onBlur={(e) => {
          caretOpacityRef.current.set(0);
          onBlur?.(e);
        }}
      />
      <span ref={measureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre" />
      <motion.div
        aria-hidden
        className="pointer-events-none col-start-1 col-end-2 row-start-1 row-end-2 h-[1.1em] w-0.5 self-center justify-self-start"
        style={{ x: springCaretX, opacity: caretOpacity, background: 'var(--color-crimson)' }}
      />
    </div>
  );
}
