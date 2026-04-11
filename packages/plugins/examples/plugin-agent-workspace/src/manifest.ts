import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "paperclip-agent-workspace";
const WORKSPACE_TAB_SLOT_ID = "agent-workspace-tab";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Agent Workspace",
  description:
    "Adds a Workspace tab to the agent detail page that shows the agent's workspace directory as a file tree, preserving filesystem order.",
  author: "Compound Law",
  categories: ["workspace", "ui"],
  capabilities: [
    "ui.detailTab.register",
    "agents.read",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "detailTab",
        id: WORKSPACE_TAB_SLOT_ID,
        displayName: "Workspace",
        exportName: "WorkspaceTab",
        entityTypes: ["agent"],
        order: 60,
      },
    ],
  },
};

export default manifest;
