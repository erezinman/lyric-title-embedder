import { useState } from "react";
import { ProjectLibrary } from "./components/library/ProjectLibrary";
import { Editor } from "./components/Editor";
import { projects } from "./api/client";

export function App() {
  const [openName, setOpenName] = useState<string | null>(null);
  const open = async (name: string) => { await projects.open(name); setOpenName(name); };
  if (!openName) return <ProjectLibrary onOpen={open} />;
  return <Editor projectName={openName} onHome={() => setOpenName(null)} />;
}
