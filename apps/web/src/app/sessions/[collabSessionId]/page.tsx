"use client";

import { useParams } from "next/navigation";
import { CollabWorkspace } from "../../../components/collab-workspace";

export default function CollabSessionPage() {
  const params = useParams<{ collabSessionId: string }>();
  const collabSessionId = typeof params.collabSessionId === "string" ? params.collabSessionId : undefined;

  return <CollabWorkspace initialCollabSessionId={collabSessionId} />;
}
