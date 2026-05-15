import { memo } from 'react';
import { Slider } from '@/components/ui/slider';

interface WorkbenchSliderProps {
    value: number[];
    onValueChange: (value: number[]) => void;
    min?: number;
    max?: number;
    step?: number;
    className?: string;
    disabled?: boolean;
    width?: number;
}

export const WorkbenchSlider = memo(({ width, className, ...props }: WorkbenchSliderProps) => (
    <div style={width ? { width } : undefined} className={className}>
        <Slider {...props} />
    </div>
));
