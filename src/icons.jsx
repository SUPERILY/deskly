import {
  Gamepad2, Code2, Palette, Briefcase, Clapperboard, Globe, MessageCircle,
  Wrench, Folder, FileText, Shapes, Tag, Zap, Activity, Server, GitBranch, History, Clock, LayoutGrid, Sparkles, BatteryLow,
} from 'lucide-react';

const MAP = {
  Gamepad2, Code2, Palette, Briefcase, Clapperboard, Globe, MessageCircle, Wrench, Folder, FileText, Shapes, Tag, Zap,
  Activity, Server, GitBranch, History, Clock, LayoutGrid, Sparkles, BatteryLow,
};

export function CatIcon({ name, ...props }) {
  const Icon = MAP[name] || Shapes;
  return <Icon {...props} />;
}
