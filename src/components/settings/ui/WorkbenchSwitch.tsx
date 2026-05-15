import { memo } from 'react';
import { Switch } from '@/components/ui/switch';

interface WorkbenchSwitchProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
}

export const WorkbenchSwitch = memo((props: WorkbenchSwitchProps) => <Switch {...props} />);
