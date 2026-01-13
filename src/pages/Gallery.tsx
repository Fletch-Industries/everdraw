import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ProjectMetadata } from '@/types/project';
import { getAllProjects, deleteProject, duplicateProject, renameProject } from '@/utils/projectStorage';
import { loadDrawing, clearDrawing, AutoSaveState } from '@/utils/indexedDBStorage';
import { migrateAutoSaveToProject, saveProject } from '@/utils/projectStorage';
import { ProjectCard } from '@/components/ProjectCard';
import { NewProjectButton } from '@/components/NewProjectButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Brush, Globe } from 'lucide-react';
const Gallery = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const loadProjects = useCallback(async () => {
    const allProjects = await getAllProjects();
    setProjects(allProjects);
    setIsLoading(false);
  }, []);

  // Check for legacy auto-save and migrate
  useEffect(() => {
    const checkAndMigrate = async () => {
      try {
        const autoSave = await loadDrawing();
        if (autoSave && autoSave.layers.some(l => l.strokes.length > 0)) {
          // Migrate to a project
          const project = await migrateAutoSaveToProject(autoSave);
          await saveProject(project);
          await clearDrawing();
          toast.success('Recovered previous artwork');
        }
      } catch (error) {
        console.error('Migration failed:', error);
      }
      loadProjects();
    };
    checkAndMigrate();
  }, [loadProjects]);
  const handleOpenProject = (id: string) => {
    navigate(`/draw/${id}`);
  };
  const handleNewProject = () => {
    navigate('/draw/new');
  };
  const handleRename = async (id: string, name: string) => {
    try {
      await renameProject(id, name);
      await loadProjects();
      toast.success('Renamed');
    } catch (error) {
      toast.error('Failed to rename');
    }
  };
  const handleDuplicate = async (id: string) => {
    try {
      const newProject = await duplicateProject(id);
      if (newProject) {
        await loadProjects();
        toast.success('Duplicated');
      }
    } catch (error) {
      toast.error('Failed to duplicate');
    }
  };
  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteProject(pendingDeleteId);
      await loadProjects();
      toast.success('Deleted');
    } catch (error) {
      toast.error('Failed to delete');
    }
    setPendingDeleteId(null);
  };
  return <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="/favicon.png" 
                alt="Everdraw Logo" 
                className="w-10 h-10 rounded-xl"
              />
              <div>
                <h1 className="font-semibold text-lg">Everdraw</h1>
                <p className="text-xs text-muted-foreground">Draw Forever. Own Forever.</p>
              </div>
            </div>
          </div>
          
          {/* Gallery type tabs */}
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" size="sm" className="gap-2">
              <Brush className="w-4 h-4" />
              Local
            </Button>
            <Link to="/gallery/public">
              <Button variant="ghost" size="sm" className="gap-2">
                <Globe className="w-4 h-4" />
                Public
                <Badge variant="outline" className="ml-1 text-xs bg-cyan-500/10 text-cyan-500 border-cyan-500/30">
                  UHRP
                </Badge>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {isLoading ? <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => <div key={i} className="aspect-[4/3] rounded-xl bg-muted animate-pulse" />)}
          </div> : <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <NewProjectButton onClick={handleNewProject} />
            
            {projects.map(project => <ProjectCard key={project.id} project={project} onOpen={handleOpenProject} onRename={handleRename} onDuplicate={handleDuplicate} onDelete={setPendingDeleteId} />)}
          </div>}

        {!isLoading && projects.length === 0 && <div className="text-center py-12">
            <p className="text-muted-foreground">
              No artwork yet. Create your first canvas!
            </p>
          </div>}
      </main>

      {/* Delete Confirmation */}
      <ConfirmDialog open={pendingDeleteId !== null} onOpenChange={open => !open && setPendingDeleteId(null)} title="Delete Artwork?" description="This will permanently delete this artwork. This action cannot be undone." confirmText="Delete" onConfirm={handleDeleteConfirm} variant="destructive" />
    </div>;
};
export default Gallery;