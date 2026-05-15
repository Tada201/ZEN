import { memo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Option {
    value: string;
    label: string;
}

interface WorkbenchSelectProps {
    value: string;
    onValueChange: (value: string) => void;
    options: Option[];
    placeholder?: string;
    className?: string;
    width?: number;
}

export const WorkbenchSelect = memo(({ value, onValueChange, options, placeholder, className, width }: WorkbenchSelectProps) => {
    return (
        <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger className={className || "h-9 text-xs bg-slate-950 border-white/10"} style={width ? { width } : undefined}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {options.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
});
