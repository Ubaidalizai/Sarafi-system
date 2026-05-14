import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  /** Shown in hover preview and kept as native title for accessibility */
  tooltip: string;
  children: ReactNode;
};

export function IconTooltipButton({ tooltip, children, className, disabled, onMouseEnter, onMouseLeave, onFocus, onBlur, ...rest }: Props) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ top: r.bottom + 8, left: r.left + r.width / 2 });
  }, []);

  const show = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const hide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  return (
    <span
      ref={anchorRef}
      className="iconTooltipAnchor"
      onMouseEnter={(e) => {
        show();
        onMouseEnter?.(e as never);
      }}
      onMouseLeave={(e) => {
        hide();
        onMouseLeave?.(e as never);
      }}
    >
      <button
        {...rest}
        type="button"
        className={className}
        disabled={disabled}
        title={tooltip}
        aria-label={tooltip}
        onFocus={(e) => {
          show();
          onFocus?.(e);
        }}
        onBlur={(e) => {
          hide();
          onBlur?.(e);
        }}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div className="iconTooltipBubble" role="tooltip" style={{ top: coords.top, left: coords.left }}>
            {tooltip}
          </div>,
          document.body
        )}
    </span>
  );
}
