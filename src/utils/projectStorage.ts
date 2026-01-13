import { Project, ProjectMetadata, SignedProof } from '@/types/project';
import { AutoSaveState } from './indexedDBStorage';

const DB_NAME = 'everdraw-projects';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';

let db: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open projects database'));
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
        const store = database.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
        store.createIndex('modified', 'modified', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }
    };
  });
};

export const generateId = (): string => {
  return crypto.randomUUID();
};

export const saveProject = async (project: Project): Promise<void> => {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PROJECTS_STORE, 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      
      const request = store.put(project);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to save project'));
    });
  } catch (error) {
    console.error('Save project failed:', error);
    throw error;
  }
};

export const loadProject = async (id: string): Promise<Project | null> => {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PROJECTS_STORE, 'readonly');
      const store = transaction.objectStore(PROJECTS_STORE);
      
      const request = store.get(id);
      
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(new Error('Failed to load project'));
    });
  } catch (error) {
    console.error('Load project failed:', error);
    return null;
  }
};

export const getAllProjects = async (): Promise<ProjectMetadata[]> => {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PROJECTS_STORE, 'readonly');
      const store = transaction.objectStore(PROJECTS_STORE);
      const index = store.index('modified');
      
      const request = index.openCursor(null, 'prev'); // Sort by modified descending
      const projects: ProjectMetadata[] = [];
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const project = cursor.value as Project;
          projects.push({
            id: project.id,
            name: project.name,
            thumbnail: project.thumbnail,
            created: project.created,
            modified: project.modified,
            canvasWidth: project.canvas.width,
            canvasHeight: project.canvas.height,
            signedProof: project.signedProof,
          });
          cursor.continue();
        } else {
          resolve(projects);
        }
      };
      request.onerror = () => reject(new Error('Failed to list projects'));
    });
  } catch (error) {
    console.error('List projects failed:', error);
    return [];
  }
};

export const deleteProject = async (id: string): Promise<void> => {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PROJECTS_STORE, 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to delete project'));
    });
  } catch (error) {
    console.error('Delete project failed:', error);
    throw error;
  }
};

export const duplicateProject = async (id: string): Promise<Project | null> => {
  try {
    const original = await loadProject(id);
    if (!original) return null;
    
    const now = Date.now();
    const newProject: Project = {
      ...original,
      id: generateId(),
      name: `${original.name} (Copy)`,
      created: now,
      modified: now,
    };
    
    await saveProject(newProject);
    return newProject;
  } catch (error) {
    console.error('Duplicate project failed:', error);
    return null;
  }
};

export const renameProject = async (id: string, name: string): Promise<void> => {
  try {
    const project = await loadProject(id);
    if (!project) throw new Error('Project not found');
    
    project.name = name;
    project.modified = Date.now();
    
    await saveProject(project);
  } catch (error) {
    console.error('Rename project failed:', error);
    throw error;
  }
};

export const saveSignedProof = async (id: string, proof: SignedProof): Promise<void> => {
  try {
    const project = await loadProject(id);
    if (!project) throw new Error('Project not found');
    
    project.signedProof = proof;
    
    await saveProject(project);
  } catch (error) {
    console.error('Save signed proof failed:', error);
    throw error;
  }
};

// Migration helper: convert old auto-save to a project
export const migrateAutoSaveToProject = async (autoSave: AutoSaveState): Promise<Project> => {
  const now = Date.now();
  const project: Project = {
    id: generateId(),
    name: 'Recovered Artwork',
    thumbnail: '',
    created: autoSave.timestamp || now,
    modified: now,
    canvas: {
      width: autoSave.canvasSize.width,
      height: autoSave.canvasSize.height,
      dpi: autoSave.canvasSize.dpi,
      backgroundColor: autoSave.backgroundColor,
    },
    layers: autoSave.layers,
    customBrushes: [],
    activeLayerId: autoSave.activeLayerId,
    wetMix: autoSave.wetMix,
    referenceImages: autoSave.referenceImages || [],
  };
  
  return project;
};

export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
};
