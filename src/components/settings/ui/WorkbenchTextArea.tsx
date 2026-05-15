import { memo } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface WorkbenchTextAreaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
    onChangeText?: (text: string) => void;
}

export const WorkbenchTextArea = memo(({ onChangeText, ...props }: WorkbenchTextAreaProps) => {
    return (
        <Textarea
            {...props}
            onChange={(event) => onChangeText?.(event.target.value)}
        />
    );
});
