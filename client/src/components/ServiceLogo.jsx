import { useState } from "react";
import { domainFor, logoUrl } from "../utils/services.js";

// Brand logo for a subscription (from its website's favicon), or a coloured initial as a fallback.
export default function ServiceLogo({ subscription, size = "size-8" }) {
  const domain = domainFor(subscription);
  const [failed, setFailed] = useState(false);

  if (domain && !failed) {
    return (
      <span className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-white p-1`}>
        <img src={logoUrl(domain)} alt="" loading="lazy" className="size-full object-contain" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-700`}>
      {subscription.name?.charAt(0).toUpperCase() || "?"}
    </span>
  );
}
