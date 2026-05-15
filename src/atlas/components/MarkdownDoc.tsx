import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const FENCE = '`'.repeat(3);

const DEMO_MD = [
  '# Button Component',
  '',
  'A versatile button component with multiple variants.',
  '',
  '## Props',
  '',
  '| Prop | Type | Default | Description |',
  '|------|------|---------|-------------|',
  "| variant | string | 'default' | Visual style |",
  "| size | string | 'default' | Size variant |",
  '| disabled | boolean | false | Disabled state |',
  '',
  '## Usage',
  '',
  FENCE + 'tsx',
  "import { Button } from '@/components/ui/button';",
  '',
  "<Button variant='primary' size='lg'>",
  '  Click me',
  '</Button>',
  FENCE,
  '',
  "> Tip: Use 'outline' for secondary actions.",
].join('\n');

export function MarkdownDoc() {
  return (
    <div className='prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-muted-foreground prose-code:text-primary prose-pre:bg-muted prose-table:text-sm prose-th:text-muted-foreground prose-td:text-foreground'>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{DEMO_MD}</ReactMarkdown>
    </div>
  );
}
