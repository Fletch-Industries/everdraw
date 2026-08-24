import { X, Hand, ZoomIn, RotateCw, Undo2, Redo2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';

interface GestureGuideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const gestures = [
  {
    icon: Undo2,
    title: 'Undo',
    description: 'Double-tap with 2 fingers',
    fingers: 2,
  },
  {
    icon: Redo2,
    title: 'Redo',
    description: 'Double-tap with 3 fingers',
    fingers: 3,
  },
  {
    icon: ZoomIn,
    title: 'Zoom',
    description: 'Pinch with 2 fingers',
    fingers: 2,
  },
  {
    icon: Hand,
    title: 'Pan',
    description: 'Drag with 2 fingers',
    fingers: 2,
  },
  {
    icon: RotateCw,
    title: 'Rotate',
    description: 'Twist with 2 fingers',
    fingers: 2,
  },
];

export const GestureGuide = ({ open, onOpenChange }: GestureGuideProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium text-foreground">
            Touch Gestures
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3 mt-4">
          {gestures.map((gesture) => (
            <div
              key={gesture.title}
              className="flex items-center gap-4 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <gesture.icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-foreground">{gesture.title}</div>
                <div className="text-sm text-muted-foreground">{gesture.description}</div>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: gesture.fingers }).map((_, i) => (
                  <div
                    key={i}
                    className="w-3 h-5 rounded-full bg-muted-foreground/40"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Tap the zoom indicator to reset view
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
