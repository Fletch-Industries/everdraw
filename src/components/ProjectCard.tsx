import { useState } from 'react';
import { MoreVertical, Copy, Trash2, Pencil, ShieldCheck } from 'lucide-react';
import { ProjectMetadata } from '@/types/project';
import { formatTimestamp } from '@/utils/projectStorage';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface ProjectCardProps {
  project: ProjectMetadata;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ProjectCard = ({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: ProjectCardProps) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(project.name);

  const handleRenameSubmit = () => {
    if (newName.trim() && newName !== project.name) {
      onRename(project.id, newName.trim());
    }
    setIsRenaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setNewName(project.name);
      setIsRenaming(false);
    }
  };

  return (
    <div
      className={cn(
        "group relative rounded-xl overflow-hidden",
        "bg-card border border-border",
        "hover:border-primary/50 hover:shadow-lg",
        "transition-all duration-200"
      )}
    >
      {/* Thumbnail */}
      <button
        onClick={() => onOpen(project.id)}
        className="w-full aspect-[4/3] bg-muted relative overflow-hidden"
      >
        {project.thumbnail ? (
          <img
            src={project.thumbnail}
            alt={project.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <span className="text-4xl">🎨</span>
          </div>
        )}
        
        {/* Signed badge */}
        {project.signedProof && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="absolute top-2 right-2 bg-green-500/90 text-white p-1.5 rounded-full shadow-lg">
                  <ShieldCheck className="w-4 h-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p className="text-xs">Signed on-chain</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 text-white bg-black/50 px-3 py-1.5 rounded-full text-sm font-medium transition-opacity">
            Open
          </span>
        </div>
      </button>

      {/* Info */}
      <div className="p-3">
        {isRenaming ? (
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleKeyDown}
            autoFocus
            className="h-7 text-sm"
          />
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm truncate">{project.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatTimestamp(project.modified)}
              </p>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setNewName(project.name);
                  setIsRenaming(true);
                }}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(project.id)}>
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onDelete(project.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );
};
