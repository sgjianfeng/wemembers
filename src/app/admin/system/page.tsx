import { EmptyState } from "@/components/ui/EmptyState";

export default function AdminSystemPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <EmptyState
        tone="calm"
        icon="settings"
        title="系统配置"
        description="功能开发中，敬请期待"
      />
    </div>
  );
}
