import { memo, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Option {
    value: string;
    label: string;
    disabled?: boolean;
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
    // Map empty string values to a unique sentinel value because Radix UI prohibits empty string values for items
    const sentinelValue = value === "" ? "__none__" : value;

    const handleValueChange = useCallback((val: string) => {
        onValueChange(val === "__none__" ? "" : val);
    }, [onValueChange]);

    return (
        <Select value={sentinelValue} onValueChange={handleValueChange}>
            <SelectTrigger className={className || "h-9 text-xs bg-zinc-950 border-white/10"} style={width ? { width } : undefined}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {options.map(option => {
                    const optVal = option.value === "" ? "__none__" : option.value;
                    return (
                        <SelectItem key={optVal} value={optVal} disabled={option.disabled}>
                            {option.label}
                        </SelectItem>
                    );
                })}
            </SelectContent>
        </Select>
    );
});
