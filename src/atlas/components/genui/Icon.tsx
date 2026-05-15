import { LucideIcon } from "lucide-react";

import { 
  Search, Activity, Sun, Moon, Home, Settings, User, Mail, Bell, Heart, Star, Check, X, Plus, Minus, Trash, Edit, Copy, Download, Upload, RefreshCw, Play, Pause, Square, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Menu, XCircle, AlertCircle, Info, HelpCircle, Image, Video, File, Folder, FolderOpen, FolderPlus, Clock, Calendar, Tag, Bookmark, Share, Link, ExternalLink, Lock, Unlock, Eye, EyeOff, Sliders, Filter, SortAsc, SortDesc, MoreHorizontal, MoreVertical, RotateCcw, Zap, Terminal, Code, Code2, Bug, Coffee, Send, Paperclip, CloudDownload, CloudUpload, Loader, Loader2, Table, List, Grid, Layout, LayoutDashboard, Bot, Sparkles, Wand2
} from "lucide-react";

interface IconProps {
  name: string;
  className?: string;
}

// Minimal Lucide icon mapping for the most commonly used icons
const LUCIDE_ICONS: Record<string, LucideIcon> = {
  Search,
  Activity,
  Sun,
  Moon,
  Home,
  Settings,
  User,
  Mail,
  Bell,
  Heart,
  Star,
  Check,
  X,
  Plus,
  Minus,
  Trash,
  Edit,
  Copy,
  Download,
  Upload,
  Refresh: RefreshCw,
  Play,
  Pause,
  Stop: Square,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  XCircle,
  AlertCircle,
  Info,
  HelpCircle,
  Image,
  Video,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  Clock,
  Calendar,
  Tag,
  Bookmark,
  Share,
  Link,
  ExternalLink,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Sliders,
  Filter,
  SortAsc,
  SortDesc,
  MoreHorizontal,
  MoreVertical,
  RefreshCw,
  RotateCcw,
  Zap,
  Terminal,
  Code,
  Code2,
  Bug,
  Coffee,
  Send,
  Paperclip,
  DownloadCloud: CloudDownload,
  UploadCloud: CloudUpload,
  Loader,
  Loader2,
  Table,
  List,
  Grid,
  Layout,
  LayoutDashboard,
  Bot,
  Sparkles,
  Wand2,
};

export function Icon({ name, className = "" }: IconProps) {
  const IconComponent = LUCIDE_ICONS[name];

  if (IconComponent) {
    const SpecificIcon = IconComponent as LucideIcon;
    return <SpecificIcon className={`h-4 w-4 ${className}`} />;
  }

  // Fallback: render a placeholder box with the icon name
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-mono uppercase tracking-tighter bg-muted/50 text-muted-foreground ${className}`}
      title={name}
    >
      {name.slice(0, 6)}
    </span>
  );
}