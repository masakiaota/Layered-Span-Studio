import { useEffect, useState } from "react";

type AgentationComponent = typeof import("agentation")["Agentation"];

export function AgentationDevtools() {
  const [AgentationComponent, setAgentationComponent] = useState<AgentationComponent | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    let active = true;
    void import("agentation").then((module) => {
      if (!active) {
        return;
      }
      setAgentationComponent(() => module.Agentation);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!import.meta.env.DEV || !AgentationComponent) {
    return null;
  }

  const endpoint = import.meta.env.VITE_AGENTATION_ENDPOINT;
  return <AgentationComponent endpoint={endpoint || undefined} />;
}
