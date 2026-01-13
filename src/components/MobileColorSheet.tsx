import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ColorPicker } from './ColorPicker';

interface MobileColorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  color: string;
  onColorChange: (color: string) => void;
  recentColors?: string[];
  onColorUsed?: (color: string) => void;
}

export const MobileColorSheet = ({
  open,
  onOpenChange,
  color,
  onColorChange,
  recentColors = [],
  onColorUsed,
}: MobileColorSheetProps) => {
  const handleColorChange = (newColor: string) => {
    onColorChange(newColor);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-center">Pick Color</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 flex justify-center">
          <ColorPicker
            color={color}
            onChange={handleColorChange}
            recentColors={recentColors}
            onColorUsed={onColorUsed}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
};
