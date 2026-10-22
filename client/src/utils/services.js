// Known SaaS services: their website domain (for the logo) and how to cancel them.
// Matching is by name, so "Netflix Premium" or "netflix" both find Netflix.
const SERVICES = [
  { match: ["netflix"], domain: "netflix.com", cancelUrl: "https://www.netflix.com/cancelplan", steps: ["Open Account", "Click 'Cancel membership'", "Confirm - you keep access until the end of the billing period"] },
  { match: ["spotify"], domain: "spotify.com", cancelUrl: "https://www.spotify.com/account/subscription/", steps: ["Go to Account → Your plan", "Click 'Change plan'", "Choose 'Cancel Premium'"] },
  { match: ["youtube"], domain: "youtube.com", cancelUrl: "https://www.youtube.com/paid_memberships", steps: ["Open Purchases and memberships", "Choose your membership → Deactivate", "Confirm cancellation"] },
  { match: ["amazon prime", "prime video"], domain: "amazon.in", cancelUrl: "https://www.amazon.in/mc", steps: ["Open Your Prime Membership", "Click 'Manage membership' → 'End membership'", "Follow the confirmation steps"] },
  { match: ["hotstar", "disney"], domain: "hotstar.com", cancelUrl: "https://www.hotstar.com/in/subscribe/my-account", steps: ["Open My Account", "Choose 'Cancel subscription'", "Confirm"] },
  { match: ["notion"], domain: "notion.so", cancelUrl: "https://www.notion.so/settings", steps: ["Settings & members → Plans", "Click 'Downgrade' on your current plan", "Confirm the downgrade"] },
  { match: ["slack"], domain: "slack.com", cancelUrl: "https://slack.com/help/articles/203953146", steps: ["Workspace admin: Settings & administration → Billing", "Choose 'Change plan' → Free", "Confirm"] },
  { match: ["figma"], domain: "figma.com", cancelUrl: "https://help.figma.com/hc/en-us/articles/360041064814", steps: ["Open team settings → Billing", "Click 'Downgrade to Starter'", "Confirm"] },
  { match: ["canva"], domain: "canva.com", cancelUrl: "https://www.canva.com/settings/billing-and-teams", steps: ["Settings → Billing & plans", "Click your plan → Cancel subscription", "Confirm"] },
  { match: ["adobe", "creative cloud", "photoshop"], domain: "adobe.com", cancelUrl: "https://account.adobe.com/plans", steps: ["Open Manage plan in your Adobe account", "Choose 'Cancel your plan'", "Note any early-termination fee on annual plans"] },
  { match: ["github", "copilot"], domain: "github.com", cancelUrl: "https://github.com/settings/billing", steps: ["Settings → Billing and plans", "Find the plan or Copilot → Cancel", "Confirm"] },
  { match: ["aws", "amazon web services"], domain: "aws.amazon.com", cancelUrl: "https://console.aws.amazon.com/billing/home", steps: ["Usage-based: delete unused resources first", "Billing → Bills to find what is charging", "Close the account from Account settings if no longer needed"] },
  { match: ["vercel"], domain: "vercel.com", cancelUrl: "https://vercel.com/account/billing", steps: ["Team settings → Billing", "Downgrade to Hobby", "Confirm"] },
  { match: ["digitalocean"], domain: "digitalocean.com", cancelUrl: "https://cloud.digitalocean.com/account/billing", steps: ["Destroy droplets and other resources", "Billing → check no active charges remain", "Deactivate the account if needed"] },
  { match: ["google workspace", "g suite"], domain: "workspace.google.com", cancelUrl: "https://admin.google.com/ac/billing/subscriptions", steps: ["Admin console → Billing → Subscriptions", "Choose the subscription → Cancel", "Export your data first"] },
  { match: ["microsoft 365", "office 365"], domain: "microsoft.com", cancelUrl: "https://account.microsoft.com/services", steps: ["Open Services & subscriptions", "Click 'Manage' → 'Cancel subscription'", "Confirm"] },
  { match: ["zoom"], domain: "zoom.us", cancelUrl: "https://zoom.us/billing", steps: ["Account management → Billing", "Current plans → Cancel subscription", "Confirm"] },
  { match: ["mailchimp"], domain: "mailchimp.com", cancelUrl: "https://mailchimp.com/help/downgrade-or-pause-account/", steps: ["Account → Billing", "Choose 'Downgrade' or 'Pause'", "Confirm"] },
  { match: ["hubspot"], domain: "hubspot.com", cancelUrl: "https://knowledge.hubspot.com/account/cancel-your-hubspot-subscription", steps: ["Account & billing → Products & add-ons", "Click 'Cancel' next to the product", "Complete the cancellation form"] },
  { match: ["linear"], domain: "linear.app", cancelUrl: "https://linear.app/settings/billing", steps: ["Settings → Billing", "Downgrade to Free", "Confirm"] },
  { match: ["loom"], domain: "loom.com", cancelUrl: "https://www.loom.com/settings/billing", steps: ["Settings → Billing", "Downgrade plan", "Confirm before the trial ends to avoid the charge"] },
  { match: ["1password"], domain: "1password.com", cancelUrl: "https://my.1password.com/billing", steps: ["Sign in at 1password.com → Billing", "Cancel subscription", "Export your vault first"] },
  { match: ["chatgpt", "openai"], domain: "openai.com", cancelUrl: "https://chatgpt.com/#settings/Subscription", steps: ["Settings → Subscription", "Manage → Cancel plan", "Confirm"] },
  { match: ["coursera"], domain: "coursera.org", cancelUrl: "https://www.coursera.org/my-purchases", steps: ["My Purchases", "Find Coursera Plus → Cancel", "Confirm"] },
  { match: ["udemy"], domain: "udemy.com", cancelUrl: "https://www.udemy.com/user/edit-subscriptions/", steps: ["Account → Subscriptions", "Cancel subscription", "Confirm"] },
  { match: ["dropbox"], domain: "dropbox.com", cancelUrl: "https://www.dropbox.com/account/plan", steps: ["Settings → Plan", "Cancel plan", "Confirm"] },
  { match: ["jira", "atlassian", "confluence"], domain: "atlassian.com", cancelUrl: "https://admin.atlassian.com", steps: ["admin.atlassian.com → Billing", "Manage subscriptions → Cancel", "Confirm"] },
];

const normalise = (text) => (text || "").toLowerCase();

export const findService = (name) => SERVICES.find((s) => s.match.some((m) => normalise(name).includes(m))) || null;

// Domain used for the logo: the saved website first, then a known service, then a guess.
export const domainFor = (sub) => {
  if (sub.website) {
    try {
      return new URL(sub.website).hostname.replace(/^www\./, "");
    } catch {
      /* invalid URL - fall through */
    }
  }
  return findService(sub.name)?.domain || null;
};

// Google's public favicon service returns the site's icon at the requested size.
export const logoUrl = (domain, size = 64) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;

export const cancelGuideFor = (sub) => {
  const service = findService(sub.name);
  if (service) return { url: service.cancelUrl, steps: service.steps, known: true };
  return {
    url: sub.website || null,
    steps: ["Sign in to the service's website", "Open Account, Billing or Subscription settings", "Choose Cancel or Downgrade, then save the confirmation email"],
    known: false,
  };
};
