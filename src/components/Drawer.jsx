import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Drawer({ title, children, onClose }) {
  const panel = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current.querySelector('button')?.focus();
    function handleKey(event) {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const controls = [...panel.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
      previousFocus?.focus();
    };
  }, [onClose]);
  return <div className="drawer-layer">
    <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
    <aside ref={panel} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div className="drawer-header"><h2 id="drawer-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Fechar painel"><X size={21} /></button></div>
      <div className="drawer-content">{children}</div>
    </aside>
  </div>;
}
