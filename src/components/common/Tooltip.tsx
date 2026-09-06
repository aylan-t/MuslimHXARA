import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  content: string;
  title?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, title }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center ml-1.5 align-middle">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="text-slate-400 hover:text-brand-600 focus:outline-none p-0.5 rounded-full hover:bg-slate-100 transition-colors"
        aria-label="Aide explicative"
      >
        <HelpCircle className="w-4 h-4 text-brand-600" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-72 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-xl pointer-events-none transition-opacity">
          {title && <div className="font-semibold text-brand-200 mb-1">{title}</div>}
          <div className="leading-relaxed">{content}</div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </span>
  );
};

