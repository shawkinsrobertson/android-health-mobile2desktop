import { LibrarySidebar } from "@/components/library/LibrarySidebar";

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-6">
      <LibrarySidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
