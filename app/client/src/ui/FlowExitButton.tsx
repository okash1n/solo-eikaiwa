import type { ReactNode } from "react";
import { Button } from "./Button";

/** 深い学習フローから離れる操作を、コンテンツ先頭に同じ見た目で置く。 */
export function FlowExitButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <div className="flow-exit">
      <Button variant="secondary" onClick={onClick}>{children}</Button>
    </div>
  );
}
