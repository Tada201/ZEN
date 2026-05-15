import { useEffect, useState } from 'react';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';

type Tag = { id: string; name: string };

const storageKey = (chatId: string) => `zen-tags:${chatId}`;

export function TagManager({ chatId }: { chatId: string }) {
    const [tags, setTags] = useState<Tag[]>([]);
    const [newTag, setNewTag] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(storageKey(chatId));
            setTags(raw ? JSON.parse(raw) : []);
        } catch {
            setTags([]);
        }
    }, [chatId]);

    const persist = (next: Tag[]) => {
        setTags(next);
        localStorage.setItem(storageKey(chatId), JSON.stringify(next));
    };

    const handleAdd = () => {
        const name = newTag.trim();
        if (!name || tags.some(tag => tag.name === name)) return;
        persist([...tags, { id: name.toLowerCase().replace(/\s+/g, '-'), name }]);
        setNewTag('');
        setIsAdding(false);
    };

    const removeTag = (name: string) => {
        persist(tags.filter(tag => tag.name !== name));
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {tags.map(tag => (
                <div key={tag.id} className="flex items-center gap-1 rounded-full border border-brand-purple/20 bg-brand-purple/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-purple">
                    <span>{tag.name}</span>
                    <WorkbenchButton variant="ghost" size="icon" className="h-4 w-4" onClick={() => removeTag(tag.name)}>
                        <WorkbenchIcon name="solar:close-square-bold" size={10} />
                    </WorkbenchButton>
                </div>
            ))}

            {isAdding ? (
                <WorkbenchInput
                    autoFocus
                    value={newTag}
                    onChangeText={setNewTag}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') handleAdd();
                        if (event.key === 'Escape') setIsAdding(false);
                    }}
                    onBlur={() => setIsAdding(false)}
                    placeholder="TAG_NAME..."
                    className="h-7 w-32 text-[10px]"
                />
            ) : (
                <WorkbenchButton variant="secondary" size="sm" className="h-7 gap-1 text-[10px]" onClick={() => setIsAdding(true)}>
                    <WorkbenchIcon name="solar:add-circle-bold" size={10} />
                    Tag
                </WorkbenchButton>
            )}
        </div>
    );
}
