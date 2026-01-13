import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewProjectButtonProps {
  onClick: () => void;
}

export const NewProjectButton = ({ onClick }: NewProjectButtonProps) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full aspect-[4/3] rounded-xl",
        "border-2 border-dashed border-border",
        "hover:border-primary hover:bg-primary/5",
        "transition-all duration-200",
        "flex flex-col items-center justify-center gap-2",
        "text-muted-foreground hover:text-primary"
      )}
    >
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <Plus className="w-6 h-6" />
      </div>
      <span className="font-medium text-sm">New Canvas</span>
    </button>
  );
};
