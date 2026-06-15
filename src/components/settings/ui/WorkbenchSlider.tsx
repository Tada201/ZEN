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
    'aria-label'?: string;
}

export const WorkbenchSlider = memo(({ width, className, ...props }: WorkbenchSliderProps) => (
    <div style={width ? { width } : undefined} className={className ?? "w-full min-w-32 sm:w-40"}>
        <Slider {...props} />
    </div>
));
