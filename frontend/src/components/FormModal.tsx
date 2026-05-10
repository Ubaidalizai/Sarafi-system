import type { ReactNode } from "react";

type Props = {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function FormModal({ title, isOpen, onClose, children }: Props) {
  if (!isOpen) return null;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalGlass" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="heroTitle modalTitle">{title}</div>
          <button className="modalCloseBtn" type="button" onClick={onClose} aria-label="close">
            ×
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}

