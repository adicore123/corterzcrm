import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Image className={compact ? "wordmark wordmark-compact" : "wordmark"} src="/cortez.png" alt="קורטז"
    width={140} height={53} loading="eager" unoptimized />;
}
