import React from 'react';
import { AlertTriangle, Loader2, Mic, Square, Volume2 } from 'lucide-react';

export type VoiceAssistantState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface VoiceAssistantBubbleProps {
  state: VoiceAssistantState;
  onToggle: () => void;
  nextPrompt?: string;
  errorMsg?: string;
}

const BUTTON_BASE =
  'relative flex items-center justify-center w-[72px] h-[72px] rounded-full shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 focus-visible:ring-slate-900';

const STATE_STYLES: Record<VoiceAssistantState, string> = {
  idle: 'bg-brand-600 text-white ring-4 ring-brand-100 hover:bg-brand-700',
  listening: 'bg-red-500 text-white ring-4 ring-red-200 animate-pulse',
  thinking: 'bg-amber-500 text-white ring-4 ring-amber-200',
  speaking: 'bg-green-600 text-white ring-4 ring-green-200',
  error: 'bg-red-600 text-white ring-4 ring-red-200 hover:bg-red-700',
};

const DEFAULT_STATUS: Record<VoiceAssistantState, string> = {
  idle: 'Tap the microphone for voice help.',
  listening: 'Listening… speak clearly.',
  thinking: 'Thinking… one moment.',
  speaking: 'Speaking… listen, or tap to stop.',
  error: 'Something went wrong. Tap to try again.',
};

export const VoiceAssistantBubble: React.FC<VoiceAssistantBubbleProps> = ({
  state,
  onToggle,
  nextPrompt,
  errorMsg,
}) => {
  const isActive = state === 'listening' || state === 'thinking' || state === 'speaking';
  const label = isActive ? 'Stop listening' : 'Start voice assistant';

  const mainText =
    state === 'error' ? (errorMsg ?? DEFAULT_STATUS.error) : (nextPrompt ?? DEFAULT_STATUS[state]);

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-3">
      <div className="relative">
        {state === 'listening' && (
          <>
            <span
              aria-hidden="true"
              className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-40 animate-ping"
            />
            <span
              aria-hidden="true"
              className="absolute -inset-2 rounded-full border-4 border-red-300 opacity-60 animate-pulse"
            />
          </>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={isActive}
          aria-label={label}
          title={label}
          className={`${BUTTON_BASE} ${STATE_STYLES[state]}`}
        >
          {state === 'idle' && <Mic className="w-8 h-8" aria-hidden="true" />}
          {state === 'listening' && <Square className="w-8 h-8" aria-hidden="true" />}
          {state === 'thinking' && <Loader2 className="w-8 h-8 animate-spin" aria-hidden="true" />}
          {state === 'speaking' && <Volume2 className="w-8 h-8" aria-hidden="true" />}
          {state === 'error' && <AlertTriangle className="w-8 h-8" aria-hidden="true" />}
        </button>
      </div>

      {state === 'listening' && (
        <div aria-hidden="true" className="flex items-end gap-1 h-5">
          <span className="w-1.5 rounded-full bg-red-500 animate-pulse h-3" />
          <span
            className="w-1.5 rounded-full bg-red-500 animate-pulse h-5"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="w-1.5 rounded-full bg-red-500 animate-pulse h-4"
            style={{ animationDelay: '300ms' }}
          />
          <span
            className="w-1.5 rounded-full bg-red-500 animate-pulse h-2"
            style={{ animationDelay: '450ms' }}
          />
        </div>
      )}

      <div
        aria-live="polite"
        role="status"
        className="w-44 rounded-xl border border-slate-300 bg-white px-3 py-2 text-center shadow-md"
      >
        <p className="text-sm font-medium leading-snug text-slate-900">{mainText}</p>
        {isActive && (
          <p className="mt-1 text-sm font-semibold leading-snug text-slate-700">
            Tap to stop anytime
          </p>
        )}
      </div>
    </div>
  );
};

export default VoiceAssistantBubble;
