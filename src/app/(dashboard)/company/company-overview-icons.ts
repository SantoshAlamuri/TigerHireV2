/**
 * Barrel for lucide-react icons used only by the company overview route.
 * Isolates imports so Turbopack HMR / "module factory not available" does not
 * cross-wire this page with other company routes that pull different icon subgraphs.
 */
export {
  Briefcase,
  Users,
  BarChart3,
  Loader2,
  Calendar,
  MessageSquare,
  Activity,
  Inbox,
  Sparkles,
  TriangleAlert,
  Globe,
  MapPin,
} from "lucide-react";
