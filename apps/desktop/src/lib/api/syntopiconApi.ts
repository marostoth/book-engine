import type { SyntopicTopic, SyntopicTopicSummary } from "../types/syntopicon.ts";
import { callBackend } from "./clientBase.ts";

/** Every topic in `vault/syntopicon/topics/`. A vault with no topics gives an empty list. */
export async function getSyntopicTopics(): Promise<SyntopicTopicSummary[]> {
  return callBackend<SyntopicTopicSummary[]>("get_syntopic_topics", undefined, (dev) => dev.getSyntopicTopics());
}

export async function getSyntopicTopic(topicId: string): Promise<SyntopicTopic> {
  return callBackend<SyntopicTopic>("get_syntopic_topic", { topicId }, (dev) => dev.getSyntopicTopic(topicId));
}

export async function saveSyntopicTopic(topic: SyntopicTopic): Promise<void> {
  return callBackend<void>("save_syntopic_topic", { topic }, (dev) => dev.saveSyntopicTopic(topic));
}

export async function exportSyntopicReport(topicId: string): Promise<string> {
  return callBackend<string>("export_syntopic_report", { topicId }, (dev) => dev.exportSyntopicReport(topicId));
}
