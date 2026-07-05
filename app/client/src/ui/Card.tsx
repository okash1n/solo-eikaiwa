import type { ReactNode } from "react";
import { Card as ShadcnCard, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * 共有カード。shadcn/ui の Card 系コンポーネントを薄くラップし、
 * 旧来のプロップ API（header, children, className）を維持する。
 */
export function Card({ header, children, className }: { header?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <ShadcnCard className={className}>
      {header && (
        <CardHeader>
          <CardTitle>{header}</CardTitle>
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </ShadcnCard>
  );
}
