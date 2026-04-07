// =========================
// lib/formatters.ts (UPGRADED)
// =========================

function extractSection(text: string, title: string) {
  const regex = new RegExp(title + "([\\s\\S]*?)(?=\\n\\d+\\.|$)", "i");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

export function formatJira(text: string) {
  const summary = extractSection(text, "User Journey Summary");
  const stories = extractSection(text, "Jira User Stories");
  const tasks = extractSection(text, "Developer Tasks");

  return `
h1. Product Spec

h2. Summary
${summary}

h2. User Stories
${stories}

h2. Developer Tasks
${tasks}
`;
}

export function formatNotion(text: string) {
  const summary = extractSection(text, "User Journey Summary");
  const stories = extractSection(text, "Jira User Stories");
  const tasks = extractSection(text, "Developer Tasks");

  return `
# Product Spec

## Summary
${summary}

## User Stories
${stories}

## Developer Tasks
${tasks}
`;
}

export function formatConfluence(text: string) {
  const summary = extractSection(text, "User Journey Summary");
  const stories = extractSection(text, "Jira User Stories");
  const tasks = extractSection(text, "Developer Tasks");

  return `
h1. Product Spec

h2. Summary
${summary}

h2. User Stories
${stories}

h2. Developer Tasks
${tasks}
`;
}