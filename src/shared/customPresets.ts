export interface CustomPreset {
  id: string;
  label: string;
  shortLabel: string;
  iconName: string;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
  scope?: "all" | "selection" | "thread";
  isBuiltIn?: boolean;
}

export const AVAILABLE_PRESET_ICONS = [
  { key: "Briefcase", text: "Briefcase (Executive)" },
  { key: "Shield", text: "Shield (Diplomatic / Decline)" },
  { key: "CheckList", text: "CheckList (Tasks / Action Items)" },
  { key: "Code", text: "Code (Technical / Review)" },
  { key: "LightningBolt", text: "Lightning (Speed / Direct)" },
  { key: "Chat", text: "Chat (Conversation / Casual)" },
  { key: "Heart", text: "Heart (Warm / Empathetic)" },
  { key: "Lightbulb", text: "Lightbulb (Creative / Brainstorm)" },
  { key: "DocumentReply", text: "DocumentReply (Formal Response)" },
  { key: "Starburst", text: "Star (Highlight / Summary)" },
  { key: "Education", text: "Education (Explain / Clarify)" },
  { key: "Bullseye", text: "Bullseye (Key Objectives)" },
];

export const DEFAULT_CUSTOM_PRESETS: CustomPreset[] = [
  {
    id: "executive-brief",
    label: "Executive Brief",
    shortLabel: "Exec Brief",
    iconName: "Suitcase",
    description:
      "Ultra-concise bulleted briefing for leadership highlighting decision impact, risks, and next steps.",
    systemPrompt:
      "You are a chief of staff for executive leadership. Provide high-density, low-fluff executive briefings. " +
      "Focus exclusively on strategic impact, required decisions, key numbers, deadlines, and operational blockers. " +
      "Format as clean markdown bullets.",
    userPromptTemplate:
      "Create an executive briefing for this email/thread in {{output_language}}.\n\n" +
      "Structure:\n" +
      "- **Bottom Line / Decision Needed**: 1-2 sentences on what requires immediate attention\n" +
      "- **Key Facts & Metrics**: Bullet points with dates, figures, and deliverables\n" +
      "- **Risks & Blockers**: Any concerns, dependencies, or unaddressed questions\n" +
      "- **Recommended Action**: Suggested next steps or decision options\n\n" +
      "Email Content:\n{{source}}\n\n" +
      "{{thread_context}}",
    scope: "all",
    isBuiltIn: true,
  },
  {
    id: "decline-politely",
    label: "Decline with Alternative",
    shortLabel: "Decline Polite",
    iconName: "Shield",
    description:
      "Courteously declines an invitation or request while providing a constructive alternative or later follow-up.",
    systemPrompt:
      "You are a diplomatic business communication specialist. Write courteous, professional declines that protect time " +
      "while maintaining excellent stakeholder relationships. Propose constructive alternatives or future check-ins where suitable. " +
      "Output only the final email reply body as plain text.",
    userPromptTemplate:
      "{{style}}\n\n" +
      "Write a polite decline to this email thread in {{output_language}}.\n\n" +
      "Guidelines:\n" +
      "- Express genuine appreciation for the outreach/invitation.\n" +
      "- Clearly and politely state inability to commit (e.g. current priorities or capacity constraint) without over-explaining.\n" +
      "- Offer a helpful alternative (e.g. recommend a colleague, share existing documentation, or suggest revisiting next quarter).\n" +
      "- Close with warm regards.\n\n" +
      "User direction (optional): {{direction}}\n\n" +
      "Referenced Thread:\n{{source}}\n\n" +
      "{{thread_context}}",
    scope: "thread",
    isBuiltIn: true,
  },
  {
    id: "action-checklist",
    label: "Action Items with Owners",
    shortLabel: "Checklist",
    iconName: "CheckList",
    description:
      "Generates an actionable markdown task table with designated assignees, explicit deliverables, and deadlines.",
    systemPrompt:
      "You are an expert project manager. Parse email conversations into unambiguous, accountability-driven task lists. " +
      "Extract explicit and implicit responsibilities, assigning names or roles where stated. " +
      "Output formatted markdown with checkboxes and clean grouping.",
    userPromptTemplate:
      "Extract all action items, deliverables, and commitments from this email content in {{output_language}}.\n\n" +
      "Format as:\n" +
      "### Deliverables & Task Checklist\n" +
      "- [ ] **[Owner/Name]**: Task description (Due: [Date or 'TBD'])\n\n" +
      "### Decisions & Agreements\n" +
      "- Key conclusions reached in the thread\n\n" +
      "### Open Questions & Dependencies\n" +
      "- Items waiting on input before work can proceed\n\n" +
      "Email Content:\n{{source}}\n\n" +
      "{{thread_context}}",
    scope: "all",
    isBuiltIn: true,
  },
  {
    id: "technical-review",
    label: "Technical Spec & Architecture Review",
    shortLabel: "Tech Review",
    iconName: "Code",
    description:
      "Constructive engineering review focusing on architecture, edge cases, scalability, and security considerations.",
    systemPrompt:
      "You are a Principal Software Architect. Review technical emails, RFCs, and engineering proposals with high rigor. " +
      "Identify architectural strengths, performance bottlenecks, missing error handling, and maintainability concerns. " +
      "Format output as structured markdown.",
    userPromptTemplate:
      "Perform an engineering review of this technical discussion/proposal in {{output_language}}.\n\n" +
      "Review criteria:\n" +
      "1. **Architecture & Design**: Core feasibility and patterns\n" +
      "2. **Risks & Edge Cases**: Failure modes, concurrency, latency, or data integrity concerns\n" +
      "3. **Security & Performance**: Potential vulnerabilities, resource usage\n" +
      "4. **Actionable Recommendations**: Specific improvements or follow-up questions\n\n" +
      "Technical Content:\n{{source}}\n\n" +
      "{{thread_context}}",
    scope: "all",
    isBuiltIn: true,
  },
];

export function mergeCustomPresets(storedPresets?: CustomPreset[] | null): CustomPreset[] {
  if (!Array.isArray(storedPresets) || storedPresets.length === 0) {
    return [...DEFAULT_CUSTOM_PRESETS];
  }

  const validStored = storedPresets.filter(
    (p) =>
      p &&
      typeof p.id === "string" &&
      p.id.trim().length > 0 &&
      typeof p.label === "string" &&
      p.label.trim().length > 0
  );

  if (validStored.length === 0) {
    return [...DEFAULT_CUSTOM_PRESETS];
  }

  const normalizedStored = validStored.map((preset) => ({
    id: preset.id,
    label: (preset.label || "Custom Preset").trim(),
    shortLabel: (preset.shortLabel || preset.label || "Preset").trim().slice(0, 20),
    iconName: preset.iconName || "LightningBolt",
    description: (preset.description || "").trim(),
    systemPrompt: (preset.systemPrompt || "").trim(),
    userPromptTemplate: (preset.userPromptTemplate || "{{source}}").trim(),
    scope: preset.scope || "all",
    isBuiltIn: Boolean(preset.isBuiltIn),
  }));

  // Merge by id: a stored preset overrides the built-in with the same id,
  // and built-ins missing from storage are kept so new releases show up.
  const storedById = new Map(normalizedStored.map((preset) => [preset.id, preset]));
  const builtInIds = new Set(DEFAULT_CUSTOM_PRESETS.map((preset) => preset.id));
  const mergedBuiltIns = DEFAULT_CUSTOM_PRESETS.map(
    (builtIn) => storedById.get(builtIn.id) || builtIn
  );
  const customOnly = normalizedStored.filter((preset) => !builtInIds.has(preset.id));

  return [...mergedBuiltIns, ...customOnly];
}

export function validateCustomPreset(preset: Partial<CustomPreset>): string | null {
  if (!preset.label || !preset.label.trim()) {
    return "Preset name is required.";
  }

  if (!preset.systemPrompt || !preset.systemPrompt.trim()) {
    return "System prompt is required.";
  }

  if (!preset.userPromptTemplate || !preset.userPromptTemplate.trim()) {
    return "User prompt template is required.";
  }

  return null;
}
