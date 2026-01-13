import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatTimestamp } from '@/utils/indexedDBStorage';
import { History, Trash2 } from 'lucide-react';

interface RecoveryDialogProps {
  open: boolean;
  timestamp: number | null;
  strokeCount: number;
  onRecover: () => void;
  onDiscard: () => void;
}

export const RecoveryDialog = ({
  open,
  timestamp,
  strokeCount,
  onRecover,
  onDiscard,
}: RecoveryDialogProps) => {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Recover Unsaved Work?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              We found unsaved work from your previous session.
            </p>
            {timestamp && (
              <p className="text-sm text-muted-foreground">
                Last edited: {formatTimestamp(timestamp)} • {strokeCount} stroke{strokeCount !== 1 ? 's' : ''}
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDiscard} className="gap-2">
            <Trash2 className="w-4 h-4" />
            Discard
          </AlertDialogCancel>
          <AlertDialogAction onClick={onRecover} className="gap-2">
            <History className="w-4 h-4" />
            Recover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
