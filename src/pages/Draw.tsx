import { useParams } from 'react-router-dom';
import { DrawingApp } from '@/components/DrawingApp';

const Draw = () => {
  const { projectId } = useParams<{ projectId: string }>();
  
  return <DrawingApp projectId={projectId} />;
};

export default Draw;
