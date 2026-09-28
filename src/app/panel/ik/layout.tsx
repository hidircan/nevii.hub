import type { ReactNode } from "react";
import { IkTabs } from "@/components/recruitment/ik-tabs";

export default function IkLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl">
      <IkTabs />
      {children}
    </div>
  );
}
