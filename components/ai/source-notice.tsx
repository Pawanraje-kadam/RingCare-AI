import { Cpu, Sparkles, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AiResponseMeta } from "@/types/ai";
import { SAFE_AI_MESSAGES } from "@/lib/constants/ai";

export function AiSourceNotice({
  meta,
  className,
  showGeneratedAt = true,
}: {
  meta: AiResponseMeta;
  className?: string;
  showGeneratedAt?: boolean;
}) {
  if (meta.mode === "gemini") {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-muted">
          <Badge tone="brand">
            <Sparkles aria-hidden="true" className="size-3" />
            Gemini-generated
          </Badge>
          <span>{meta.model ?? "configured model"}</span>
          {meta.cached ? <span>· served from cache</span> : null}
          {showGeneratedAt ? (
            <span>
              ·{" "}
              {new Intl.DateTimeFormat("en", {
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(meta.generatedAt))}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-muted">
        <Badge tone="neutral">
          {meta.reason === "missing_api_key" || meta.reason === "ai_disabled" ? (
            <TriangleAlert aria-hidden="true" className="size-3" />
          ) : (
            <Cpu aria-hidden="true" className="size-3" />
          )}
          Deterministic fallback
        </Badge>
        <span>
          {meta.message ??
            (meta.reason ? SAFE_AI_MESSAGES[meta.reason] : "Generated locally without AI.")}
        </span>
      </div>
    </div>
  );
}
