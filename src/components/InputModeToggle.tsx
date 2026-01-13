import { Pencil, Hand } from 'lucide-react';
import { InputMode } from '@/types/drawing';
import { cn } from '@/lib/utils';

interface InputModeToggleProps {
  mode: InputMode;
  onChange: (mode: InputMode) => void;
}

export const InputModeToggle = ({ mode, onChange }: InputModeToggleProps) => {
  return (
    <div className="glass-panel p-1 flex gap-1 animate-fade-in">
      <button
        onClick={() => onChange('pencil_only')}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all',
          mode === 'pencil_only'
            ? 'bg-primary/20 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
        title="Apple Pencil Only"
      >
        <Pencil className="w-4 h-4" />
        <span className="hidden sm:inline">Pencil Only</span>
      </button>
      <button
        onClick={() => onChange('pencil_and_touch')}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all',
          mode === 'pencil_and_touch'
            ? 'bg-primary/20 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
        title="Pencil + Touch"
      >
        <Hand className="w-4 h-4" />
        <span className="hidden sm:inline">Pencil + Touch</span>
      </button>
    </div>
  );
};
